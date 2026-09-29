from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator

from .calendars import link_key, open_link, seal_link
from .domain import DomainError

Purpose = Literal["verify_email", "reset_password"]
SESSION_DAYS = 14
ELEVATED_IDLE_MINUTES = 15
MAX_CODE_ATTEMPTS = 5
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _stamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds")


def _password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=64)
    return f"scrypt${salt.hex()}${digest.hex()}"


def _password_matches(password: str, encoded: str) -> bool:
    try:
        algorithm, salt_hex, expected_hex = encoded.split("$", 2)
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(
            password.encode("utf-8"), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=64
        )
        return hmac.compare_digest(actual.hex(), expected_hex)
    except (ValueError, TypeError):
        return False


class LocalAuthStore:
    """Development-only local account store; production identity is intentionally separate."""

    def __init__(self, database_path: str | Path) -> None:
        self.path = Path(database_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._pepper = self._load_pepper()
        self._initialize()

    def _load_pepper(self) -> bytes:
        configured = os.getenv("FAMILYOS_AUTH_PEPPER")
        if configured:
            return configured.encode("utf-8")
        pepper_path = self.path.with_suffix(self.path.suffix + ".pepper")
        try:
            return bytes.fromhex(pepper_path.read_text(encoding="ascii").strip())
        except FileNotFoundError:
            value = secrets.token_bytes(32)
            try:
                with pepper_path.open("x", encoding="ascii") as pepper_file:
                    pepper_file.write(value.hex())
            except FileExistsError:
                return bytes.fromhex(pepper_path.read_text(encoding="ascii").strip())
            return value

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS accounts (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    parent_name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    email_verified INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS households (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    owner_account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS auth_codes (
                    id TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    purpose TEXT NOT NULL,
                    code_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    consumed_at TEXT
                );
                CREATE INDEX IF NOT EXISTS auth_codes_lookup
                    ON auth_codes(account_id, purpose, created_at);
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    revoked_at TEXT
                );
                CREATE TABLE IF NOT EXISTS child_sessions (
                    token_hash TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    member_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    revoked_at TEXT
                );
                CREATE TABLE IF NOT EXISTS dev_email_outbox (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL,
                    purpose TEXT NOT NULL,
                    code TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS dev_email_lookup
                    ON dev_email_outbox(email, purpose, created_at);
                CREATE TABLE IF NOT EXISTS parent_access_codes (
                    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
                    salt BLOB NOT NULL,
                    code_hash BLOB NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    locked_until TEXT
                );
                CREATE TABLE IF NOT EXISTS voice_tokens (
                    id TEXT PRIMARY KEY,
                    token_hash TEXT NOT NULL UNIQUE,
                    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    member_id TEXT,
                    label TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    last_used_at TEXT,
                    revoked_at TEXT
                );
                CREATE TABLE IF NOT EXISTS photo_blobs (
                    owner TEXT NOT NULL,
                    photo_id TEXT NOT NULL,
                    variant TEXT NOT NULL,
                    content BLOB NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (owner, photo_id, variant)
                );
                CREATE TABLE IF NOT EXISTS calendar_links (
                    owner TEXT NOT NULL,
                    calendar_id TEXT NOT NULL,
                    sealed_url BLOB NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (owner, calendar_id)
                );
                """
            )
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(sessions)")}
            if "elevated" not in columns:
                connection.execute("ALTER TABLE sessions ADD COLUMN elevated INTEGER NOT NULL DEFAULT 0")
            if "last_used_at" not in columns:
                connection.execute("ALTER TABLE sessions ADD COLUMN last_used_at TEXT")

    def _normalize_email(self, email: str) -> str:
        value = email.strip().lower()
        if len(value) > 254 or not EMAIL_PATTERN.fullmatch(value):
            raise DomainError(422, "INVALID_EMAIL", "Enter a valid email address.")
        return value

    def _validate_password(self, password: str) -> None:
        if len(password) < 12 or len(password) > 128:
            raise DomainError(422, "WEAK_PASSWORD", "Use a password between 12 and 128 characters.")

    def _code_hash(self, account_id: str, purpose: Purpose, code: str) -> str:
        value = f"{account_id}:{purpose}:{code}".encode("utf-8")
        return hmac.new(self._pepper, value, hashlib.sha256).hexdigest()

    def _parent_code_hash(self, code: str, salt: bytes) -> bytes:
        keyed = hmac.new(self._pepper, b"familyos-parent-access:" + code.encode("ascii"), hashlib.sha256).digest()
        return hashlib.scrypt(keyed, salt=salt, n=2**14, r=8, p=1, dklen=32)

    def set_parent_access_code(self, account_id: str, code: str) -> None:
        if not re.fullmatch(r"\d{4}", code or ""):
            raise DomainError(422, "INVALID_ACCESS_CODE", "Choose a four-digit parent access code.")
        salt = secrets.token_bytes(16)
        with self._connection() as connection:
            existing = connection.execute(
                "SELECT 1 FROM parent_access_codes WHERE account_id = ?", (account_id,)
            ).fetchone()
            if existing:
                raise DomainError(409, "ACCESS_CODE_ALREADY_SET", "A parent access code is already set. Verify the current code before changing it.")
            connection.execute(
                "INSERT INTO parent_access_codes(account_id, salt, code_hash) VALUES (?, ?, ?)",
                (account_id, salt, self._parent_code_hash(code, salt)),
            )

    def parent_access_code_configured(self, account_id: str) -> bool:
        with self._connection() as connection:
            return connection.execute(
                "SELECT 1 FROM parent_access_codes WHERE account_id = ?", (account_id,)
            ).fetchone() is not None

    def change_parent_access_code(self, account_id: str, old_code: str, new_code: str) -> None:
        self.verify_parent_access_code(account_id, old_code)
        if not re.fullmatch(r"\d{4}", new_code or ""):
            raise DomainError(422, "INVALID_ACCESS_CODE", "Choose a four-digit parent access code.")
        salt = secrets.token_bytes(16)
        with self._connection() as connection:
            connection.execute(
                "UPDATE parent_access_codes SET salt = ?, code_hash = ?, attempts = 0, locked_until = NULL WHERE account_id = ?",
                (salt, self._parent_code_hash(new_code, salt), account_id),
            )

    def verify_parent_access_code(self, account_id: str, code: str) -> None:
        now = _now()
        failure: DomainError | None = None
        with self._connection() as connection:
            row = connection.execute(
                "SELECT salt, code_hash, attempts, locked_until FROM parent_access_codes WHERE account_id = ?",
                (account_id,),
            ).fetchone()
            if row is None:
                failure = DomainError(409, "ACCESS_CODE_NOT_SET", "Set a parent access code before approving a reward.")
            elif row["locked_until"] and row["locked_until"] > _stamp(now):
                failure = DomainError(429, "ACCESS_CODE_COOLDOWN", "Too many incorrect codes. Wait one minute and try again.")
            elif not (re.fullmatch(r"\d{4}", code or "") and hmac.compare_digest(
                    row["code_hash"], self._parent_code_hash(code, row["salt"]))):
                attempts = int(row["attempts"]) + 1
                locked_until = _stamp(now + timedelta(minutes=1)) if attempts >= 5 else None
                connection.execute(
                    "UPDATE parent_access_codes SET attempts = ?, locked_until = ? WHERE account_id = ?",
                    (0 if locked_until else attempts, locked_until, account_id),
                )
                failure = DomainError(401, "ACCESS_CODE_INCORRECT", "That parent access code is incorrect.")
            else:
                connection.execute(
                    "UPDATE parent_access_codes SET attempts = 0, locked_until = NULL WHERE account_id = ?",
                    (account_id,),
                )
        if failure:
            raise failure

    def _issue_code(self, connection: sqlite3.Connection, account_id: str, email: str, purpose: Purpose) -> str:
        code = f"{secrets.randbelow(1_000_000):06d}"
        created = _now()
        lifetime = timedelta(hours=24) if purpose == "verify_email" else timedelta(minutes=30)
        expires = created + lifetime
        connection.execute(
            "UPDATE auth_codes SET consumed_at = ? WHERE account_id = ? AND purpose = ? AND consumed_at IS NULL",
            (_stamp(created), account_id, purpose),
        )
        connection.execute(
            "INSERT INTO auth_codes(id, account_id, purpose, code_hash, created_at, expires_at) VALUES(?, ?, ?, ?, ?, ?)",
            (uuid4().hex, account_id, purpose, self._code_hash(account_id, purpose, code), _stamp(created), _stamp(expires)),
        )
        connection.execute(
            "DELETE FROM dev_email_outbox WHERE expires_at <= ?", (_stamp(created),)
        )
        connection.execute(
            "INSERT INTO dev_email_outbox(id, email, purpose, code, created_at, expires_at) VALUES(?, ?, ?, ?, ?, ?)",
            (uuid4().hex, email, purpose, code, _stamp(created), _stamp(expires)),
        )
        return code

    def _account_payload(self, connection: sqlite3.Connection, account_id: str) -> dict[str, str | bool]:
        row = connection.execute(
            """SELECT accounts.id, accounts.email, accounts.parent_name, accounts.email_verified,
                      households.id AS household_id, households.name AS household_name
               FROM accounts JOIN households ON households.owner_account_id = accounts.id
               WHERE accounts.id = ?""",
            (account_id,),
        ).fetchone()
        if row is None:
            raise DomainError(404, "ACCOUNT_NOT_FOUND", "The account could not be found.")
        return {
            "accountId": row["id"],
            "email": row["email"],
            "parentName": row["parent_name"],
            "emailVerified": bool(row["email_verified"]),
            "householdId": row["household_id"],
            "householdName": row["household_name"],
        }

    def create_account(self, email: str, password: str, parent_name: str, household_name: str) -> dict[str, str | bool]:
        normalized = self._normalize_email(email)
        self._validate_password(password)
        parent_name = parent_name.strip()
        household_name = household_name.strip()
        if not parent_name or len(parent_name) > 80:
            raise DomainError(422, "INVALID_NAME", "Enter a parent or guardian name (up to 80 characters).")
        if not household_name or len(household_name) > 80:
            raise DomainError(422, "INVALID_HOUSEHOLD", "Enter a household name (up to 80 characters).")
        account_id = uuid4().hex
        now = _stamp(_now())
        try:
            with self._connection() as connection:
                connection.execute(
                    "INSERT INTO accounts(id, email, parent_name, password_hash, email_verified, created_at) VALUES(?, ?, ?, ?, 0, ?)",
                    (account_id, normalized, parent_name, _password_hash(password), now),
                )
                connection.execute(
                    "INSERT INTO households(id, name, owner_account_id, created_at) VALUES(?, ?, ?, ?)",
                    (uuid4().hex, household_name, account_id, now),
                )
                self._issue_code(connection, account_id, normalized, "verify_email")
                return self._account_payload(connection, account_id)
        except sqlite3.IntegrityError as error:
            raise DomainError(409, "ACCOUNT_EXISTS", "An account with that email already exists. Try signing in instead.") from error

    def resend_verification(self, email: str) -> None:
        normalized = self._normalize_email(email)
        with self._connection() as connection:
            row = connection.execute("SELECT id, email_verified FROM accounts WHERE email = ?", (normalized,)).fetchone()
            if row and not row["email_verified"]:
                self._issue_code(connection, row["id"], normalized, "verify_email")

    def _consume_code(self, connection: sqlite3.Connection, email: str, purpose: Purpose, code: str) -> sqlite3.Row:
        normalized = self._normalize_email(email)
        account = connection.execute("SELECT * FROM accounts WHERE email = ?", (normalized,)).fetchone()
        if account is None:
            raise DomainError(400, "INVALID_OR_EXPIRED_CODE", "That code is invalid or expired. Request a new code and try again.")
        challenge = connection.execute(
            """SELECT * FROM auth_codes WHERE account_id = ? AND purpose = ? AND consumed_at IS NULL
               ORDER BY created_at DESC LIMIT 1""",
            (account["id"], purpose),
        ).fetchone()
        valid = bool(
            challenge
            and challenge["attempts"] < MAX_CODE_ATTEMPTS
            and challenge["expires_at"] > _stamp(_now())
            and re.fullmatch(r"\d{6}", code or "")
            and hmac.compare_digest(challenge["code_hash"], self._code_hash(account["id"], purpose, code))
        )
        if not valid:
            if challenge:
                attempts = challenge["attempts"] + 1
                consumed_at = _stamp(_now()) if attempts >= MAX_CODE_ATTEMPTS else None
                connection.execute(
                    "UPDATE auth_codes SET attempts = ?, consumed_at = ? WHERE id = ?",
                    (attempts, consumed_at, challenge["id"]),
                )
            raise DomainError(400, "INVALID_OR_EXPIRED_CODE", "That code is invalid or expired. Request a new code and try again.")
        connection.execute("UPDATE auth_codes SET consumed_at = ? WHERE id = ?", (_stamp(_now()), challenge["id"]))
        connection.execute(
            "UPDATE dev_email_outbox SET code = '' WHERE email = ? AND purpose = ? AND code = ?",
            (normalized, purpose, code),
        )
        return account

    def verify_email(self, email: str, code: str) -> tuple[str, dict[str, str | bool]]:
        with self._connection() as connection:
            account = self._consume_code(connection, email, "verify_email", code)
            connection.execute("UPDATE accounts SET email_verified = 1 WHERE id = ?", (account["id"],))
            token = self._create_session(connection, account["id"])
            return token, self._account_payload(connection, account["id"])

    def sign_in(self, email: str, password: str) -> tuple[str, dict[str, str | bool]]:
        normalized = self._normalize_email(email)
        with self._connection() as connection:
            account = connection.execute("SELECT * FROM accounts WHERE email = ?", (normalized,)).fetchone()
            password_hash = account["password_hash"] if account else _password_hash("dummy-password-value")
            if not _password_matches(password, password_hash):
                raise DomainError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.")
            if not account["email_verified"]:
                raise DomainError(403, "EMAIL_NOT_VERIFIED", "Verify your email before signing in. You can request a new code.")
            token = self._create_session(connection, account["id"])
            return token, self._account_payload(connection, account["id"])

    def _create_session(self, connection: sqlite3.Connection, account_id: str, elevated: bool = False) -> str:
        token = secrets.token_urlsafe(32)
        now = _now()
        lifetime = timedelta(hours=8) if elevated else timedelta(days=SESSION_DAYS)
        connection.execute(
            "INSERT INTO sessions(token_hash, account_id, created_at, expires_at, elevated, last_used_at) VALUES(?, ?, ?, ?, ?, ?)",
            (hashlib.sha256(token.encode("ascii")).hexdigest(), account_id, _stamp(now), _stamp(now + lifetime),
             int(elevated), _stamp(now)),
        )
        return token

    def session(self, token: str | None) -> dict[str, str | bool] | None:
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        now = _now()
        with self._connection() as connection:
            row = connection.execute(
                """SELECT accounts.id, sessions.elevated, sessions.last_used_at
                   FROM sessions JOIN accounts ON accounts.id = sessions.account_id
                   WHERE sessions.token_hash = ? AND sessions.revoked_at IS NULL AND sessions.expires_at > ?""",
                (token_hash, _stamp(now)),
            ).fetchone()
            if row is None:
                connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (_stamp(now),))
                return None
            if row["elevated"] and (row["last_used_at"] or "") <= _stamp(now - timedelta(minutes=ELEVATED_IDLE_MINUTES)):
                # Parent access unlocked with the four-digit code lapses after inactivity.
                connection.execute("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?", (_stamp(now), token_hash))
                return None
            connection.execute("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?", (_stamp(now), token_hash))
            return {**self._account_payload(connection, row["id"]), "elevated": bool(row["elevated"])}

    def account_for_id(self, account_id: str) -> dict[str, str | bool]:
        with self._connection() as connection:
            return self._account_payload(connection, account_id)

    def create_parent_session(self, account_id: str, elevated: bool = False) -> str:
        with self._connection() as connection:
            return self._create_session(connection, account_id, elevated)

    def revoke_all_sessions(self, account_id: str) -> None:
        stamp = _stamp(_now())
        with self._connection() as connection:
            connection.execute("UPDATE sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL", (stamp, account_id))
            connection.execute("UPDATE child_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL", (stamp, account_id))

    def verify_password(self, account_id: str, password: str) -> None:
        with self._connection() as connection:
            row = connection.execute("SELECT password_hash FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if row is None or not _password_matches(password or "", row["password_hash"]):
            raise DomainError(401, "INVALID_CREDENTIALS", "That password is incorrect.")

    def reset_parent_access_code(self, account_id: str, new_code: str) -> None:
        if not re.fullmatch(r"\d{4}", new_code or ""):
            raise DomainError(422, "INVALID_ACCESS_CODE", "Choose a four-digit parent access code.")
        salt = secrets.token_bytes(16)
        with self._connection() as connection:
            connection.execute(
                """INSERT INTO parent_access_codes(account_id, salt, code_hash) VALUES (?, ?, ?)
                   ON CONFLICT(account_id) DO UPDATE SET salt = excluded.salt, code_hash = excluded.code_hash,
                   attempts = 0, locked_until = NULL""",
                (account_id, salt, self._parent_code_hash(new_code, salt)),
            )

    # Voice (MCP) connections: random bearer tokens, stored only as hashes.
    def create_voice_token(self, account_id: str, label: str, member_id: str | None) -> tuple[str, dict[str, str | None]]:
        token = "fos_voice_" + secrets.token_urlsafe(32)
        record = {"id": uuid4().hex, "label": label.strip()[:60] or "Alexa+", "memberId": member_id,
                  "createdAt": _stamp(_now()), "lastUsedAt": None}
        with self._connection() as connection:
            count = connection.execute(
                "SELECT count(*) AS amount FROM voice_tokens WHERE account_id = ? AND revoked_at IS NULL", (account_id,)
            ).fetchone()["amount"]
            if count >= 5:
                raise DomainError(409, "VOICE_LIMIT", "Disconnect an existing voice connection before adding another.")
            connection.execute(
                "INSERT INTO voice_tokens(id, token_hash, account_id, member_id, label, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (record["id"], hashlib.sha256(token.encode("ascii")).hexdigest(), account_id, member_id,
                 record["label"], record["createdAt"]),
            )
        return token, record

    def voice_tokens(self, account_id: str) -> list[dict[str, str | None]]:
        with self._connection() as connection:
            rows = connection.execute(
                """SELECT id, label, member_id, created_at, last_used_at FROM voice_tokens
                   WHERE account_id = ? AND revoked_at IS NULL ORDER BY created_at DESC""", (account_id,)
            ).fetchall()
        return [{"id": row["id"], "label": row["label"], "memberId": row["member_id"],
                 "createdAt": row["created_at"], "lastUsedAt": row["last_used_at"]} for row in rows]

    def revoke_voice_token(self, account_id: str, token_id: str) -> None:
        with self._connection() as connection:
            changed = connection.execute(
                "UPDATE voice_tokens SET revoked_at = ? WHERE id = ? AND account_id = ? AND revoked_at IS NULL",
                (_stamp(_now()), token_id, account_id),
            ).rowcount
        if not changed:
            raise DomainError(404, "VOICE_NOT_FOUND", "That voice connection could not be found.")

    def voice_token(self, token: str | None) -> dict[str, str | None] | None:
        if not token or not token.startswith("fos_voice_") or len(token) > 200:
            return None
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        with self._connection() as connection:
            row = connection.execute(
                "SELECT id, account_id, member_id, label FROM voice_tokens WHERE token_hash = ? AND revoked_at IS NULL",
                (token_hash,),
            ).fetchone()
            if row is None:
                return None
            connection.execute("UPDATE voice_tokens SET last_used_at = ? WHERE id = ?", (_stamp(_now()), row["id"]))
        return {"id": row["id"], "owner": row["account_id"], "memberId": row["member_id"], "label": row["label"]}

    # Private photo storage for local development.
    def put_photo(self, owner: str, photo_id: str, variants: dict[str, bytes]) -> None:
        with self._connection() as connection:
            for variant, content in variants.items():
                connection.execute(
                    "INSERT OR REPLACE INTO photo_blobs(owner, photo_id, variant, content, created_at) VALUES (?, ?, ?, ?, ?)",
                    (owner, photo_id, variant, content, _stamp(_now())),
                )

    def get_photo(self, owner: str, photo_id: str, variant: str) -> bytes | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT content FROM photo_blobs WHERE owner = ? AND photo_id = ? AND variant = ?", (owner, photo_id, variant)
            ).fetchone()
        return bytes(row["content"]) if row else None

    def delete_photo(self, owner: str, photo_id: str) -> None:
        with self._connection() as connection:
            connection.execute("DELETE FROM photo_blobs WHERE owner = ? AND photo_id = ?", (owner, photo_id))

    def photo_usage(self, owner: str) -> int:
        with self._connection() as connection:
            row = connection.execute("SELECT coalesce(sum(length(content)), 0) AS total FROM photo_blobs WHERE owner = ?", (owner,)).fetchone()
        return int(row["total"])

    # Connected calendar links (secrets: encrypted, never returned to clients).
    def put_calendar_link(self, owner: str, calendar_id: str, url: str) -> None:
        sealed = seal_link(link_key(self._pepper), owner, calendar_id, url)
        with self._connection() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO calendar_links(owner, calendar_id, sealed_url, created_at) VALUES (?, ?, ?, ?)",
                (owner, calendar_id, sealed, _stamp(_now())),
            )

    def calendar_link(self, owner: str, calendar_id: str) -> str | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT sealed_url FROM calendar_links WHERE owner = ? AND calendar_id = ?", (owner, calendar_id)
            ).fetchone()
        return open_link(link_key(self._pepper), owner, calendar_id, bytes(row["sealed_url"])) if row else None

    def delete_calendar_link(self, owner: str, calendar_id: str) -> None:
        with self._connection() as connection:
            connection.execute("DELETE FROM calendar_links WHERE owner = ? AND calendar_id = ?", (owner, calendar_id))

    def calendar_links(self) -> list[tuple[str, str]]:
        """(owner, calendar id) for every connected calendar, for the background sync."""
        with self._connection() as connection:
            rows = connection.execute("SELECT owner, calendar_id FROM calendar_links ORDER BY created_at").fetchall()
        return [(row["owner"], row["calendar_id"]) for row in rows]

    def create_child_session(self, account_id: str, member_id: str) -> str:
        token = secrets.token_urlsafe(32)
        now = _now()
        with self._connection() as connection:
            connection.execute(
                "INSERT INTO child_sessions(token_hash, account_id, member_id, created_at, expires_at) VALUES(?, ?, ?, ?, ?)",
                (hashlib.sha256(token.encode("ascii")).hexdigest(), account_id, member_id, _stamp(now), _stamp(now + timedelta(hours=8))),
            )
        return token

    def child_session(self, token: str | None) -> dict[str, str] | None:
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        with self._connection() as connection:
            row = connection.execute(
                "SELECT account_id, member_id FROM child_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?",
                (token_hash, _stamp(_now())),
            ).fetchone()
        return {"accountId": row["account_id"], "memberId": row["member_id"]} if row else None

    def revoke_child_session(self, token: str | None) -> None:
        if token:
            token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
            with self._connection() as connection:
                connection.execute("UPDATE child_sessions SET revoked_at = ? WHERE token_hash = ?", (_stamp(_now()), token_hash))

    def sign_out(self, token: str | None) -> None:
        if not token:
            return
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        with self._connection() as connection:
            connection.execute("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?", (_stamp(_now()), token_hash))
            connection.execute("UPDATE child_sessions SET revoked_at = ? WHERE token_hash = ?", (_stamp(_now()), token_hash))

    def forgot_password(self, email: str) -> None:
        normalized = self._normalize_email(email)
        with self._connection() as connection:
            account = connection.execute(
                "SELECT id, email_verified FROM accounts WHERE email = ?", (normalized,)
            ).fetchone()
            if account and account["email_verified"]:
                self._issue_code(connection, account["id"], normalized, "reset_password")

    def reset_password(self, email: str, code: str, new_password: str) -> None:
        self._validate_password(new_password)
        with self._connection() as connection:
            account = self._consume_code(connection, email, "reset_password", code)
            connection.execute("UPDATE accounts SET password_hash = ? WHERE id = ?", (_password_hash(new_password), account["id"]))
            connection.execute("DELETE FROM sessions WHERE account_id = ?", (account["id"],))

    def latest_dev_delivery(self, email: str, purpose: Purpose) -> dict[str, str] | None:
        normalized = self._normalize_email(email)
        with self._connection() as connection:
            row = connection.execute(
                """SELECT purpose, code, expires_at FROM dev_email_outbox
                   WHERE email = ? AND purpose = ? AND expires_at > ?
                   ORDER BY created_at DESC LIMIT 1""",
                (normalized, purpose, _stamp(_now())),
            ).fetchone()
            if not row or not row["code"]:
                return None
            return {"purpose": row["purpose"], "code": row["code"], "expiresAt": row["expires_at"]}


class SignUpBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=128)
    parentName: str = Field(min_length=1, max_length=80)
    householdName: str = Field(min_length=1, max_length=80)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not EMAIL_PATTERN.fullmatch(normalized):
            raise ValueError("Enter a valid email address.")
        return normalized


class EmailCodeBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    code: str = Field(min_length=1, max_length=32)


class SignInBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class ResetPasswordBody(EmailCodeBody):
    newPassword: str = Field(min_length=12, max_length=128)


class EmailBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
