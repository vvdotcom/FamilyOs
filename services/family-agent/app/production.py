from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, TypeVar
from uuid import uuid4

import jwt
import psycopg
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .auth import SESSION_DAYS
from .domain import DemoRepository, DomainError
from .models import CalendarEvent, HouseholdSnapshot, ProposedAction

T = TypeVar("T")


class CognitoTokenVerifier:
    """Validates Cognito ID tokens against the user pool's rotating JWKS."""

    def __init__(self, issuer: str, client_id: str) -> None:
        self.issuer = issuer.rstrip("/")
        self.client_id = client_id
        self._jwks = PyJWKClient(f"{self.issuer}/.well-known/jwks.json", cache_keys=True, lifespan=300)

    def verify_id_token(self, raw_token: str) -> dict[str, object]:
        if not raw_token or len(raw_token) > 16_384:
            raise DomainError(401, "INVALID_SESSION", "Please sign in again.")
        try:
            key = self._jwks.get_signing_key_from_jwt(raw_token).key
            claims = jwt.decode(
                raw_token,
                key,
                algorithms=["RS256"],
                audience=self.client_id,
                issuer=self.issuer,
                leeway=60,
                options={"require": ["exp", "iat", "iss", "sub", "aud", "token_use"]},
            )
        except (jwt.PyJWTError, PyJWKClientError, ValueError, KeyError) as error:
            raise DomainError(401, "INVALID_SESSION", "Please sign in again.") from error
        subject = claims.get("sub")
        if claims.get("token_use") != "id" or not isinstance(subject, str) or not subject.strip():
            raise DomainError(401, "INVALID_SESSION", "Please sign in again.")
        if claims.get("email_verified") not in (True, "true"):
            raise DomainError(403, "EMAIL_NOT_VERIFIED", "Verify your email before continuing.")
        email = claims.get("email")
        if not isinstance(email, str) or not email.strip():
            raise DomainError(401, "INVALID_SESSION", "Your verified account email is unavailable.")
        return claims


class PostgresHouseholdStore:
    """Postgres persistence for identity sessions and tenant-isolated household snapshots."""

    def __init__(self, database_url: str) -> None:
        if not database_url:
            raise RuntimeError("DATABASE_URL is required when FAMILYOS_AUTH_MODE=cognito.")
        self.database_url = database_url.replace("postgres://", "postgresql://", 1)
        self._pairing_key = hashlib.sha256(self.database_url.encode("utf-8")).digest()

    def _pairing_digest(self, value: str) -> str:
        return hmac.new(self._pairing_key, value.encode("utf-8"), hashlib.sha256).hexdigest()

    def create_pairing_challenge(self, device_name: str, requester: str) -> dict[str, str]:
        code = f"{secrets.randbelow(1_000_000):06d}"
        polling_token = secrets.token_urlsafe(32)
        challenge_id = uuid4().hex
        expires = datetime.now(timezone.utc) + timedelta(minutes=10)
        requester_hash = self._pairing_digest(requester)
        with self._connect() as connection:
            connection.execute("DELETE FROM familyos_pairing_challenges WHERE expires_at <= now()")
            count = connection.execute(
                "SELECT count(*) AS amount FROM familyos_pairing_challenges "
                "WHERE requester_hash = %s AND created_at > now() - interval '15 minutes'",
                (requester_hash,),
            ).fetchone()["amount"]
            if count >= 8:
                raise DomainError(429, "PAIRING_RATE_LIMITED", "Too many pairing requests. Wait a few minutes and try again.")
            connection.execute(
                """INSERT INTO familyos_pairing_challenges
                   (id, code_hash, polling_hash, device_name, requester_hash, status, expires_at)
                   VALUES (%s, %s, %s, %s, %s, 'pending', %s)""",
                (challenge_id, self._pairing_digest(code), self._pairing_digest(polling_token),
                 device_name.strip()[:60] or "FamilyOS TV", requester_hash, expires),
            )
        return {"challengeId": challenge_id, "code": code, "pollingToken": polling_token,
                "expiresAt": expires.isoformat()}

    def approve_pairing(self, owner_sub: str, code: str) -> dict[str, str]:
        failure = None
        result = None
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM familyos_pairing_approval_attempts WHERE attempted_at < now() - interval '1 day'"
            )
            attempts = connection.execute(
                "SELECT count(*) AS amount FROM familyos_pairing_approval_attempts "
                "WHERE owner_sub = %s AND attempted_at > now() - interval '15 minutes'",
                (owner_sub,),
            ).fetchone()["amount"]
            if attempts >= 10:
                failure = DomainError(429, "PAIRING_RATE_LIMITED", "Too many code attempts. Wait a few minutes and try again.")
            else:
                connection.execute("INSERT INTO familyos_pairing_approval_attempts(owner_sub) VALUES (%s)", (owner_sub,))
            row = None if failure else connection.execute(
                """SELECT * FROM familyos_pairing_challenges WHERE code_hash = %s
                   AND status = 'pending' AND expires_at > now() FOR UPDATE""",
                (self._pairing_digest(code),),
            ).fetchone()
            if row is None:
                if failure is None:
                    failure = DomainError(401, "PAIRING_CODE_INVALID", "That TV code is not correct or has expired.")
            elif row["expires_at"] <= datetime.now(timezone.utc):
                failure = DomainError(410, "PAIRING_EXPIRED", "That TV code expired. Show a new code on the TV.")
            else:
                device_id = uuid4().hex
                device_name = row["device_name"]
                connection.execute(
                    """INSERT INTO familyos_devices(id, owner_sub, device_name, expires_at)
                       VALUES (%s, %s, %s, now() + interval '90 days')""",
                    (device_id, owner_sub, device_name),
                )
                connection.execute(
                    "UPDATE familyos_pairing_challenges SET status = 'approved', owner_sub = %s, device_id = %s WHERE id = %s",
                    (owner_sub, device_id, row["id"]),
                )
                result = {"deviceId": device_id, "deviceName": device_name, "status": "approved"}
        if failure:
            raise failure
        assert result is not None
        return result

    def claim_pairing(self, challenge_id: str, polling_token: str) -> dict[str, str]:
        failure = None
        result = None
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM familyos_pairing_challenges WHERE id = %s FOR UPDATE", (challenge_id,)
            ).fetchone()
            if row is None or not hmac.compare_digest(
                row["polling_hash"], self._pairing_digest(polling_token)
            ):
                failure = DomainError(404, "PAIRING_NOT_FOUND", "That pairing request is unavailable.")
            elif row["expires_at"] <= datetime.now(timezone.utc):
                connection.execute("UPDATE familyos_pairing_challenges SET status = 'expired' WHERE id = %s", (challenge_id,))
                failure = DomainError(410, "PAIRING_EXPIRED", "The pairing request expired. Show a new code on the TV.")
            elif row["status"] == "pending":
                result = {"status": "pending", "expiresAt": row["expires_at"].isoformat()}
            elif row["status"] in {"approved", "claimed"} and row["device_id"]:
                device = connection.execute(
                    "SELECT * FROM familyos_devices WHERE id = %s FOR UPDATE", (row["device_id"],)
                ).fetchone()
                if device is None or device["revoked_at"] or device["expires_at"] <= datetime.now(timezone.utc):
                    failure = DomainError(410, "PAIRING_REVOKED", "This TV was unpaired before setup finished.")
                else:
                    token = secrets.token_urlsafe(48)
                    connection.execute(
                        "UPDATE familyos_devices SET token_hash = %s, last_seen_at = now() WHERE id = %s",
                        (self._pairing_digest(token), row["device_id"]),
                    )
                    connection.execute(
                        "UPDATE familyos_pairing_challenges SET status = 'claimed' WHERE id = %s", (challenge_id,)
                    )
                    result = {"status": "approved", "deviceId": row["device_id"], "deviceToken": token}
            else:
                failure = DomainError(410, "PAIRING_CLOSED", "The pairing request is no longer available.")
        if failure:
            raise failure
        assert result is not None
        return result

    def device_session(self, token: str | None) -> dict[str, str] | None:
        if not token:
            return None
        token_hash = self._pairing_digest(token)
        with self._connect() as connection:
            row = connection.execute(
                """UPDATE familyos_devices SET last_seen_at = now()
                   WHERE token_hash = %s AND revoked_at IS NULL AND expires_at > now()
                   RETURNING id, owner_sub, device_name""", (token_hash,)
            ).fetchone()
        if row is None:
            return None
        return {"deviceId": str(row["id"]), "ownerSub": str(row["owner_sub"]), "deviceName": str(row["device_name"])}

    def paired_devices(self, owner_sub: str) -> list[dict[str, str | None]]:
        with self._connect() as connection:
            rows = connection.execute(
                """SELECT id, device_name, created_at, last_seen_at FROM familyos_devices
                   WHERE owner_sub = %s AND revoked_at IS NULL AND expires_at > now()
                   ORDER BY created_at DESC""", (owner_sub,)
            ).fetchall()
        return [{"deviceId": str(row["id"]), "deviceName": row["device_name"],
                 "createdAt": row["created_at"].isoformat(),
                 "lastSeenAt": row["last_seen_at"].isoformat() if row["last_seen_at"] else None}
                for row in rows]

    def revoke_device(self, owner_sub: str, device_id: str) -> None:
        with self._connect() as connection:
            row = connection.execute(
                """UPDATE familyos_devices SET revoked_at = now(), token_hash = NULL
                   WHERE id = %s AND owner_sub = %s AND revoked_at IS NULL RETURNING id""",
                (device_id, owner_sub),
            ).fetchone()
        if row is None:
            raise DomainError(404, "DEVICE_NOT_FOUND", "That connected TV could not be found.")

    def unpair_device(self, token: str | None) -> None:
        if not token:
            raise DomainError(401, "DEVICE_SESSION_INVALID", "This TV is no longer paired.")
        with self._connect() as connection:
            row = connection.execute(
                """UPDATE familyos_devices SET revoked_at = now(), token_hash = NULL
                   WHERE token_hash = %s AND revoked_at IS NULL AND expires_at > now() RETURNING id""",
                (self._pairing_digest(token),),
            ).fetchone()
        if row is None:
            raise DomainError(401, "DEVICE_SESSION_INVALID", "This TV is no longer paired.")

    def _connect(self):
        return psycopg.connect(self.database_url, connect_timeout=8, row_factory=dict_row)

    def initialize(self) -> None:
        migration_dir = Path(__file__).with_name("migrations")
        with self._connect() as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS familyos_schema_migrations "
                "(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
            )
            for migration in sorted(migration_dir.glob("*.sql")):
                applied = connection.execute(
                    "SELECT 1 FROM familyos_schema_migrations WHERE version = %s",
                    (migration.name,),
                ).fetchone()
                if applied:
                    continue
                # psycopg's parameterized/extended query protocol accepts one statement
                # per execute call. Keep migrations as ordinary SQL files, but execute
                # their individual statements so first deploy works reliably.
                statements = [part.strip() for part in migration.read_text(encoding="utf-8").split(";")]
                for statement in statements:
                    if statement:
                        connection.execute(statement)
                connection.execute(
                    "INSERT INTO familyos_schema_migrations(version) VALUES (%s)",
                    (migration.name,),
                )

    def health(self) -> bool:
        try:
            with self._connect() as connection:
                connection.execute("SELECT 1").fetchone()
            return True
        except psycopg.Error:
            return False

    @staticmethod
    def _account(row: dict[str, object]) -> dict[str, str | bool]:
        return {
            "accountId": str(row["owner_sub"]),
            "email": str(row["email"]),
            "parentName": str(row["parent_name"]),
            "emailVerified": bool(row["email_verified"]),
            "householdId": str(row["id"]),
            "householdName": str(row["name"]),
        }

    def create_or_get_household(
        self,
        *,
        owner_sub: str,
        email: str,
        parent_name: str | None,
        household_name: str | None,
    ) -> dict[str, str | bool]:
        normalized_email = email.strip().lower()
        name = (parent_name or "").strip()[:80]
        if not name:
            name = normalized_email.split("@", 1)[0][:80] or "Parent"
        household = (household_name or "").strip()[:80]
        if not household:
            household = f"{name}'s Family"[:80]
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM familyos_households WHERE owner_sub = %s FOR UPDATE",
                (owner_sub,),
            ).fetchone()
            if row is None:
                family_id = uuid4().hex
                member_id = uuid4().hex
                snapshot = HouseholdSnapshot.model_validate({
                    "family": {
                        "id": family_id,
                        "name": household,
                        "timezone": "America/Phoenix",
                        "memberIds": [member_id],
                    },
                    "members": [{
                        "id": member_id,
                        "familyId": family_id,
                        "name": name,
                        "initials": "".join(part[0] for part in name.split()[:2]).upper() or "P",
                        "role": "adult",
                        "accentColor": "#D98D18",
                    }],
                    "events": [],
                    "chores": [],
                    "routines": [],
                })
                row = connection.execute(
                    """INSERT INTO familyos_households
                       (id, owner_sub, email, parent_name, name, email_verified, snapshot)
                       VALUES (%s, %s, %s, %s, %s, TRUE, %s)
                       RETURNING *""",
                    (family_id, owner_sub, normalized_email, name, household,
                     Jsonb(snapshot.model_dump(mode="json"))),
                ).fetchone()
            else:
                row = connection.execute(
                    """UPDATE familyos_households
                       SET email = %s, email_verified = TRUE, updated_at = now()
                       WHERE owner_sub = %s RETURNING *""",
                    (normalized_email, owner_sub),
                ).fetchone()
        assert row is not None
        return self._account(row)

    def account_for_owner(self, owner_sub: str) -> dict[str, str | bool] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM familyos_households WHERE owner_sub = %s", (owner_sub,)
            ).fetchone()
        return self._account(row) if row else None

    def create_session(self, owner_sub: str) -> str:
        token = secrets.token_urlsafe(48)
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        expires = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
        with self._connect() as connection:
            connection.execute("DELETE FROM familyos_sessions WHERE expires_at <= now()")
            connection.execute(
                "INSERT INTO familyos_sessions(token_hash, owner_sub, expires_at) VALUES (%s, %s, %s)",
                (token_hash, owner_sub, expires),
            )
        return token

    def session(self, token: str | None) -> dict[str, str | bool] | None:
        if not token or len(token) > 256:
            return None
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        with self._connect() as connection:
            row = connection.execute(
                """SELECT h.* FROM familyos_sessions s
                   JOIN familyos_households h ON h.owner_sub = s.owner_sub
                   WHERE s.token_hash = %s AND s.revoked_at IS NULL AND s.expires_at > now()""",
                (token_hash,),
            ).fetchone()
        return self._account(row) if row else None

    def revoke_session(self, token: str | None) -> None:
        if not token:
            return
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        with self._connect() as connection:
            connection.execute(
                "UPDATE familyos_sessions SET revoked_at = now() WHERE token_hash = %s AND revoked_at IS NULL",
                (token_hash,),
            )

    def _load_repository(self, connection, owner_sub: str) -> DemoRepository:
        row = connection.execute(
            "SELECT snapshot, actions, history FROM familyos_households WHERE owner_sub = %s FOR UPDATE",
            (owner_sub,),
        ).fetchone()
        if row is None:
            raise DomainError(404, "HOUSEHOLD_NOT_FOUND", "That household could not be found.")
        repository = DemoRepository()
        repository._data = HouseholdSnapshot.model_validate(row["snapshot"])
        repository._actions = {
            action_id: ProposedAction.model_validate(value)
            for action_id, value in (row["actions"] or {}).items()
        }
        repository._history = list(row["history"] or [])
        return repository

    @staticmethod
    def _save_repository(connection, owner_sub: str, repository: DemoRepository) -> None:
        connection.execute(
            """UPDATE familyos_households
               SET snapshot = %s, actions = %s, history = %s, updated_at = now()
               WHERE owner_sub = %s""",
            (
                Jsonb(repository._data.model_dump(mode="json")),
                Jsonb({key: value.model_dump(mode="json") for key, value in repository._actions.items()}),
                Jsonb(repository._history),
                owner_sub,
            ),
        )

    def household(self, owner_sub: str) -> HouseholdSnapshot:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT snapshot FROM familyos_households WHERE owner_sub = %s", (owner_sub,)
            ).fetchone()
        if row is None:
            raise DomainError(404, "HOUSEHOLD_NOT_FOUND", "That household could not be found.")
        return HouseholdSnapshot.model_validate(row["snapshot"])

    def events(self, owner_sub: str, start=None, end=None) -> list[CalendarEvent]:
        snapshot = self.household(owner_sub)
        values = snapshot.events
        if start:
            from .domain import parse
            values = [item for item in values if parse(item.endAt) > start]
        if end:
            from .domain import parse
            values = [item for item in values if parse(item.startAt) < end]
        return values

    def conflicts(self, owner_sub: str):
        with self._connect() as connection:
            repository = self._load_repository(connection, owner_sub)
            return repository.conflicts()

    def action_history(self, owner_sub: str) -> list[ProposedAction]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT history FROM familyos_households WHERE owner_sub = %s", (owner_sub,)
            ).fetchone()
        if row is None:
            raise DomainError(404, "HOUSEHOLD_NOT_FOUND", "That household could not be found.")
        return [ProposedAction.model_validate(item) for item in reversed(row["history"] or [])]

    def _mutate(self, owner_sub: str, operation: Callable[[DemoRepository], T]) -> T:
        with self._connect() as connection:
            repository = self._load_repository(connection, owner_sub)
            revision = repository._data.revision
            result = operation(repository)
            if repository._data.revision == revision:
                repository._data.revision += 1
            self._save_repository(connection, owner_sub, repository)
            return result

    def propose(self, owner_sub: str, conflict_id: str, event_id: str, target_member_id: str):
        return self._mutate(
            owner_sub,
            lambda repository: repository.propose(conflict_id, event_id, target_member_id),
        )

    def companion_edit(self, owner_sub: str, edit):
        from .companion import apply_edit
        def operation(repository):
            repository._data = apply_edit(repository._data, edit)
            return repository.snapshot()
        return self._mutate(owner_sub, operation)

    def confirm(self, owner_sub: str, action_id: str):
        return self._mutate(owner_sub, lambda repository: repository.confirm(action_id))

    def cancel(self, owner_sub: str, action_id: str):
        return self._mutate(owner_sub, lambda repository: repository.cancel(action_id))


class CognitoSessionService:
    def __init__(self, verifier: CognitoTokenVerifier, store: PostgresHouseholdStore) -> None:
        self.verifier = verifier
        self.store = store

    def exchange(self, id_token: str, parent_name: str | None, household_name: str | None):
        claims = self.verifier.verify_id_token(id_token)
        owner_sub = str(claims["sub"])
        email = str(claims["email"])
        parent = parent_name or (str(claims.get("name", "")).strip() or None)
        account = self.store.create_or_get_household(
            owner_sub=owner_sub,
            email=email,
            parent_name=parent,
            household_name=household_name,
        )
        return self.store.create_session(owner_sub), account

    def session(self, token: str | None):
        return self.store.session(token)

    def sign_out(self, token: str | None) -> None:
        self.store.revoke_session(token)
