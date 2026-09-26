from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from .domain import DomainError

CHALLENGE_MINUTES = 10
DEVICE_DAYS = 90
MAX_CODE_ATTEMPTS = 5


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _digest(value: str, key: bytes) -> str:
    return hmac.new(key, value.encode("utf-8"), hashlib.sha256).hexdigest()


@dataclass
class Challenge:
    id: str
    code_hash: str
    polling_hash: str
    device_name: str
    expires_at: datetime
    created_by: str
    status: str = "pending"
    attempts: int = 0
    owner_id: str | None = None
    device_id: str | None = None


@dataclass
class Device:
    id: str
    owner_id: str
    name: str
    token_hash: str | None
    expires_at: datetime
    created_at: datetime
    last_seen_at: datetime | None = None
    revoked_at: datetime | None = None


class PairingRegistry:
    """Short-lived pairing challenges and revocable, read-only local TV sessions."""

    def __init__(self, key: bytes | None = None) -> None:
        self._key = key or secrets.token_bytes(32)
        self._lock = threading.RLock()
        self._challenges: dict[str, Challenge] = {}
        self._devices: dict[str, Device] = {}
        self._recent_creates: dict[str, list[datetime]] = {}
        self._recent_approvals: dict[str, list[datetime]] = {}

    def create(self, device_name: str, requester: str) -> dict[str, str]:
        now = _now()
        with self._lock:
            recent = [at for at in self._recent_creates.get(requester, []) if at > now - timedelta(minutes=15)]
            if len(recent) >= 8:
                raise DomainError(429, "PAIRING_RATE_LIMITED", "Too many pairing requests. Wait a few minutes and try again.")
            recent.append(now)
            self._recent_creates[requester] = recent
            code = f"{secrets.randbelow(1_000_000):06d}"
            poll_token = secrets.token_urlsafe(32)
            challenge_id = uuid4().hex
            expires = now + timedelta(minutes=CHALLENGE_MINUTES)
            self._challenges[challenge_id] = Challenge(
                id=challenge_id,
                code_hash=_digest(code, self._key),
                polling_hash=_digest(poll_token, self._key),
                device_name=device_name.strip()[:60] or "FamilyOS TV",
                expires_at=expires,
                created_by=requester,
            )
            return {"challengeId": challenge_id, "code": code, "pollingToken": poll_token, "expiresAt": expires.isoformat()}

    def approve(self, owner_id: str, code: str) -> dict[str, str]:
        now = _now()
        with self._lock:
            recent = [at for at in self._recent_approvals.get(owner_id, []) if at > now - timedelta(minutes=15)]
            if len(recent) >= 10:
                raise DomainError(429, "PAIRING_RATE_LIMITED", "Too many code attempts. Wait a few minutes and try again.")
            recent.append(now)
            self._recent_approvals[owner_id] = recent
            code_hash = _digest(code, self._key)
            challenge = next(
                (item for item in self._challenges.values()
                 if item.status == "pending" and item.expires_at > now
                 and hmac.compare_digest(item.code_hash, code_hash)),
                None,
            )
            if challenge is None:
                raise DomainError(401, "PAIRING_CODE_INVALID", "That TV code is not correct or has expired.")
            if challenge.expires_at <= now:
                challenge.status = "expired"
                raise DomainError(410, "PAIRING_EXPIRED", "That TV code expired. Show a new code on the TV.")
            device_id = uuid4().hex
            self._devices[device_id] = Device(
                id=device_id,
                owner_id=owner_id,
                name=challenge.device_name,
                token_hash=None,
                expires_at=now + timedelta(days=DEVICE_DAYS),
                created_at=now,
            )
            challenge.status = "approved"
            challenge.owner_id = owner_id
            challenge.device_id = device_id
            return {"deviceId": device_id, "deviceName": challenge.device_name, "status": "approved"}

    def claim(self, challenge_id: str, polling_token: str) -> dict[str, str]:
        now = _now()
        with self._lock:
            challenge = self._challenges.get(challenge_id)
            if challenge is None or not hmac.compare_digest(
                challenge.polling_hash, _digest(polling_token, self._key)
            ):
                raise DomainError(404, "PAIRING_NOT_FOUND", "That pairing request is unavailable.")
            if challenge.expires_at <= now:
                challenge.status = "expired"
                raise DomainError(410, "PAIRING_EXPIRED", "The pairing request expired. Show a new code on the TV.")
            if challenge.status == "pending":
                return {"status": "pending", "expiresAt": challenge.expires_at.isoformat()}
            if challenge.status not in {"approved", "claimed"} or not challenge.device_id:
                raise DomainError(410, "PAIRING_CLOSED", "The pairing request is no longer available.")
            device = self._devices[challenge.device_id]
            if device.revoked_at:
                raise DomainError(410, "PAIRING_REVOKED", "This TV was unpaired before setup finished.")
            token = secrets.token_urlsafe(48)
            device.token_hash = _digest(token, self._key)
            device.last_seen_at = now
            challenge.status = "claimed"
            return {"status": "approved", "deviceId": device.id, "deviceToken": token}

    def device(self, token: str | None) -> Device | None:
        if not token:
            return None
        token_hash = _digest(token, self._key)
        now = _now()
        with self._lock:
            for device in self._devices.values():
                if device.token_hash and hmac.compare_digest(device.token_hash, token_hash):
                    if device.revoked_at or device.expires_at <= now:
                        return None
                    device.last_seen_at = now
                    return device
        return None

    def devices(self, owner_id: str) -> list[dict[str, str | None]]:
        now = _now()
        with self._lock:
            return [
                {"deviceId": item.id, "deviceName": item.name, "createdAt": item.created_at.isoformat(),
                 "lastSeenAt": item.last_seen_at.isoformat() if item.last_seen_at else None}
                for item in self._devices.values()
                if item.owner_id == owner_id and not item.revoked_at and item.expires_at > now
            ]

    def revoke(self, owner_id: str, device_id: str) -> None:
        with self._lock:
            item = self._devices.get(device_id)
            if item is None or item.owner_id != owner_id or item.revoked_at:
                raise DomainError(404, "DEVICE_NOT_FOUND", "That connected TV could not be found.")
            item.revoked_at = _now()

    def unpair(self, token: str | None) -> None:
        if not token:
            raise DomainError(401, "DEVICE_SESSION_INVALID", "This TV is no longer paired.")
        token_hash = _digest(token, self._key)
        with self._lock:
            item = next(
                (device for device in self._devices.values()
                 if device.token_hash and hmac.compare_digest(device.token_hash, token_hash)
                 and not device.revoked_at and device.expires_at > _now()),
                None,
            )
            if item is None:
                raise DomainError(401, "DEVICE_SESSION_INVALID", "This TV is no longer paired.")
            item.revoked_at = _now()
