"""One household write path for the REST API, the paired TV, and the MCP voice server.

Every change goes through ``HouseholdService.edit``: it authorizes the actor against the Phase 9
matrix, applies the change with the revision check, and records an audit entry, all while the
household is locked (Postgres row lock in production, an in-process lock locally).
"""
from __future__ import annotations

from typing import Callable

from .companion import CompanionMutation, apply_edit
from .domain import DemoRepository
from .models import HouseholdSnapshot
from .permissions import Actor, authorize


class HouseholdService:
    def __init__(self, *, production: bool, repository: DemoRepository | None, pg_store=None, auth_store=None) -> None:
        self.production = production
        self.repository = repository
        self.pg_store = pg_store
        self.auth_store = auth_store

    @property
    def accounts(self):
        """Store for parent codes, voice tokens, sessions, and photo blobs."""
        return self.pg_store if self.production else self.auth_store

    def blob_owner(self, owner: str | None) -> str:
        # The local demo repository is shared, so its photos are shared too.
        return str(owner) if self.production else "local"

    def snapshot(self, owner: str | None) -> HouseholdSnapshot:
        if self.production:
            return self.pg_store.household(str(owner))
        return self.repository.snapshot()

    def transform(self, owner: str | None, change: Callable[[HouseholdSnapshot], HouseholdSnapshot]) -> HouseholdSnapshot:
        if self.production:
            return self.pg_store.transform(str(owner), change)
        with self.repository._lock:
            self.repository._data = change(self.repository._data)
            return self.repository.snapshot()

    def edit(self, actor: Actor, kind: str, value: dict, *, expected_revision: int | None = None,
             server: bool = False) -> HouseholdSnapshot:
        def change(snapshot: HouseholdSnapshot) -> HouseholdSnapshot:
            authorize(actor, kind, value, snapshot, server=server)
            revision = snapshot.revision if expected_revision is None else expected_revision
            mutation = CompanionMutation(expectedRevision=revision, kind=kind, value=value)
            return apply_edit(snapshot, mutation, actor.label)

        return self.transform(actor.owner, change)

    def verify_code(self, owner: str | None, code: str) -> None:
        self.accounts.verify_parent_access_code(str(owner), code)
