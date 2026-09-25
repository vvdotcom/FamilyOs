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

from .domain import DomainError

Purpose = Literal["verify_email", "reset_password"]
SESSION_DAYS = 14
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
                """
            )

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

    def _create_session(self, connection: sqlite3.Connection, account_id: str) -> str:
        token = secrets.token_urlsafe(32)
        now = _now()
        connection.execute(
            "INSERT INTO sessions(token_hash, account_id, created_at, expires_at) VALUES(?, ?, ?, ?)",
            (hashlib.sha256(token.encode("ascii")).hexdigest(), account_id, _stamp(now), _stamp(now + timedelta(days=SESSION_DAYS))),
        )
        return token

    def session(self, token: str | None) -> dict[str, str | bool] | None:
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        with self._connection() as connection:
            row = connection.execute(
                """SELECT accounts.id FROM sessions JOIN accounts ON accounts.id = sessions.account_id
                   WHERE sessions.token_hash = ? AND sessions.revoked_at IS NULL AND sessions.expires_at > ?""",
                (token_hash, _stamp(_now())),
            ).fetchone()
            if row is None:
                connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (_stamp(_now()),))
                return None
            return self._account_payload(connection, row["id"])

    def sign_out(self, token: str | None) -> None:
        if not token:
            return
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        with self._connection() as connection:
            connection.execute("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?", (_stamp(_now()), token_hash))

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
