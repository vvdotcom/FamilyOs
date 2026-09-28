"""Phase 9 role/permission matrix. Every household write is authorized here before it is applied.

Actor types:
- ``parent``: a signed-in parent account (Cognito or local), or a parent session unlocked with the
  four-digit code (``elevated``; it expires after inactivity).
- ``child``: a child profile session started by a parent. Bound to one ``memberId``.
- ``device``: a paired TV using its own device token. It is a shared screen, so it can do what any
  family member standing in front of it could do, but not parent-only changes.
- ``device_parent``: a paired TV where a parent entered the four-digit code recently.
- ``voice``: an Alexa+/MCP connection. Voice never edits directly; it can only create proposals.
- ``system``: server-owned steps (import extraction, vision results, code-verified approvals). These
  are only reachable through dedicated endpoints that perform their own checks.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .domain import DomainError
from .models import HouseholdSnapshot

ActorType = Literal["parent", "child", "device", "device_parent", "voice", "system"]


@dataclass(frozen=True)
class Actor:
    type: ActorType
    owner: str | None
    member_id: str | None = None
    device_id: str | None = None
    elevated: bool = False

    @property
    def label(self) -> str:
        """Audit label: identifies the kind of actor without any credential or personal detail."""
        if self.type == "child":
            return f"child:{self.member_id}"
        if self.type in ("device", "device_parent"):
            return f"{'tv-parent' if self.type == 'device_parent' else 'tv'}:{(self.device_id or '')[:12]}"
        if self.type == "parent" and self.elevated:
            return "parent:code"
        return self.type


# Kinds only the server may apply, after its own verification (parent code, vision, upload, voice).
SERVER_ONLY_KINDS = frozenset({
    "importDraft", "redemptionRequest", "redemptionDecision", "starAdjustment",
    "choreVerificationCreate", "choreVerificationDecide", "proposalCreate", "photoCreate",
})

# Changes any family member may make at the shared TV, with item checks below.
DEVICE_KINDS = frozenset({"completeChore", "listItemToggle", "prepToggle", "moveComplete", "proposalDecide"})
# Additional changes allowed once a parent unlocked the TV with the four-digit code.
DEVICE_PARENT_KINDS = DEVICE_KINDS | frozenset({
    "chore", "listItem", "deleteListItem", "meal", "deleteMeal", "familyNightClose", "familyNightPick",
    "redemptionFulfill",
})
CHILD_KINDS = frozenset({"completeChore", "familyNightSuggest", "familyNightVote"})

# Human-readable matrix used by docs and tests. "item" means an item-level rule also applies.
MATRIX: dict[str, dict[str, str]] = {
    "events, meals, recipes, lists (create/edit/delete)": {"parent": "yes", "child": "no", "tv": "lists: check off only", "tv+code": "lists and meals", "voice": "propose only"},
    "chores (create/edit/undo)": {"parent": "yes", "child": "no", "tv": "no", "tv+code": "yes", "voice": "no"},
    "complete a chore": {"parent": "yes", "child": "own chores (item)", "tv": "assigned children (item)", "tv+code": "yes", "voice": "propose only"},
    "photo-verified chore approval": {"parent": "code each time", "child": "submit photo (own)", "tv": "code each time", "tv+code": "code each time", "voice": "no"},
    "rewards and reward settings": {"parent": "yes", "child": "request (own)", "tv": "no", "tv+code": "mark fulfilled", "voice": "balance only"},
    "reward approval / star correction": {"parent": "code each time", "child": "no", "tv": "code each time", "tv+code": "code each time", "voice": "no"},
    "household members and roles": {"parent": "yes", "child": "no", "tv": "no", "tv+code": "no", "voice": "no"},
    "imports": {"parent": "yes", "child": "no", "tv": "no", "tv+code": "no", "voice": "no"},
    "photos": {"parent": "yes", "child": "no", "tv": "view", "tv+code": "view", "voice": "no"},
    "teams, carpools, family night settings": {"parent": "yes", "child": "no", "tv": "no", "tv+code": "no", "voice": "no"},
    "family night suggest/vote": {"parent": "any member", "child": "self (item)", "tv": "view", "tv+code": "close/pick", "voice": "no"},
    "voice proposals (confirm/reject)": {"parent": "yes", "child": "no", "tv": "chore-done only", "tv+code": "yes", "voice": "no"},
    "parent code, pairing, voice connections, sessions": {"parent": "yes (reset needs password)", "child": "no", "tv": "no", "tv+code": "no", "voice": "no"},
}


def deny(message: str, code: str = "PERMISSION_DENIED") -> DomainError:
    return DomainError(403, code, message)


def authorize(actor: Actor, kind: str, value: dict, snapshot: HouseholdSnapshot, *, server: bool = False) -> None:
    """Raise a 403 unless ``actor`` may apply ``kind`` to this household snapshot."""
    if kind in SERVER_ONLY_KINDS and not server:
        raise deny("That change needs its own confirmation step.", "CONFIRMATION_REQUIRED")
    if actor.type in ("system", "parent"):
        return
    if actor.type == "voice":
        if kind != "proposalCreate":
            raise deny("Voice can only suggest changes; confirm them on the TV or phone.", "VOICE_PROPOSAL_ONLY")
        return
    if server and kind in SERVER_ONLY_KINDS:
        # Dedicated endpoints decide which server-only steps each actor may trigger.
        return
    allowed = {"child": CHILD_KINDS, "device": DEVICE_KINDS, "device_parent": DEVICE_PARENT_KINDS}[actor.type]
    if kind not in allowed:
        if actor.type == "child":
            raise deny("Child mode can only complete your own chores, vote, and request rewards.", "CHILD_PERMISSION_DENIED")
        raise deny("Ask a parent to unlock the TV with the four-digit code for that change.", "PARENT_CODE_REQUIRED")
    _item_rules(actor, kind, value, snapshot)


def _item_rules(actor: Actor, kind: str, value: dict, snapshot: HouseholdSnapshot) -> None:
    if kind == "completeChore":
        chore = next((item for item in snapshot.chores if item.id == value.get("id")), None)
        if chore is None:
            raise DomainError(404, "CHORE_NOT_FOUND", "That chore could not be found.")
        if chore.verifyWithPhoto and actor.type in ("child", "device"):
            raise deny("This chore needs a photo from the phone so a parent can approve it.", "PHOTO_REQUIRED")
        if actor.type == "child" and (chore.assignedToMemberId != actor.member_id or value.get("memberId") != actor.member_id):
            raise deny("Children can complete only chores assigned to their own profile.", "CHORE_NOT_ASSIGNED")
        if actor.type in ("device", "device_parent"):
            member = next((item for item in snapshot.members if item.id == chore.assignedToMemberId), None)
            if actor.type == "device" and (member is None or member.role != "child"):
                raise deny("Ask a parent to unlock the TV to complete this chore.", "PARENT_CODE_REQUIRED")
    elif kind in ("familyNightSuggest", "familyNightVote") and actor.type == "child":
        member_field = "byMemberId" if kind == "familyNightSuggest" else "memberId"
        if value.get(member_field) != actor.member_id:
            raise deny("You can vote or suggest only for yourself.", "CHILD_PERMISSION_DENIED")
    elif kind == "proposalDecide" and actor.type == "device":
        proposal = next((item for item in snapshot.proposals if item.id == value.get("id")), None)
        if proposal is None:
            raise DomainError(404, "PROPOSAL_NOT_FOUND", "That request could not be found.")
        if proposal.kind != "chore_done":
            raise deny("Enter the parent code on the TV to confirm this change.", "PARENT_CODE_REQUIRED")
        chore = next((item for item in snapshot.chores if item.id == proposal.payload.get("choreId")), None)
        if chore is not None and chore.verifyWithPhoto:
            raise deny("This chore needs a photo from the phone so a parent can approve it.", "PHOTO_REQUIRED")
