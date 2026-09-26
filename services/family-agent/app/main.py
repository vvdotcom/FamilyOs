from __future__ import annotations

import os
import ipaddress
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .auth import EmailBody, EmailCodeBody, LocalAuthStore, ResetPasswordBody, SignInBody, SignUpBody, Purpose, SESSION_DAYS
from .briefing import SafeBriefingService
from .companion import CompanionMutation, apply_edit
from .demo import demo_now
from .domain import DemoRepository, DomainError, snapshot_context
from .models import (
    APIEnvelope, ActionProposalRequest, CognitoExchangeBody, EmptyBody, HouseholdContext,
    PairingApproveBody, PairingChallengeBody, PairingClaimBody,
)
from .pairing import PairingRegistry
from .production import CognitoSessionService, CognitoTokenVerifier, PostgresHouseholdStore

AUTH_MODE = os.getenv("FAMILYOS_AUTH_MODE", "local").strip().lower()
DEMO_MODE = os.getenv("FAMILYOS_DEMO_MODE", "true").lower() == "true"
IS_PRODUCTION = AUTH_MODE == "cognito"

if os.getenv("RAILWAY_ENVIRONMENT") and not IS_PRODUCTION:
    raise RuntimeError(
        "FamilyOS deployment is blocked unless Cognito authentication and PostgreSQL are enabled. "
        "Do not expose the local demo API on Railway."
    )

briefings = SafeBriefingService()
app = FastAPI(title="FamilyOS Family Agent", version="0.1.0")

if DEMO_MODE:
    origins = ["*"]
else:
    origins = [value.strip() for value in os.getenv("FAMILYOS_CORS_ORIGINS", "").split(",") if value.strip()]
    if "*" in origins:
        raise RuntimeError("Production CORS origins must list exact HTTPS origins; wildcard origins are not allowed.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=not DEMO_MODE,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

if IS_PRODUCTION:
    if DEMO_MODE:
        raise RuntimeError("FAMILYOS_DEMO_MODE must be false when FAMILYOS_AUTH_MODE=cognito.")
    if os.getenv("FAMILYOS_COOKIE_SECURE", "false").lower() != "true":
        raise RuntimeError("FAMILYOS_COOKIE_SECURE=true is required for production sessions.")
    cognito_issuer = os.getenv("FAMILYOS_COGNITO_ISSUER", "").strip().rstrip("/")
    cognito_client_id = os.getenv("FAMILYOS_COGNITO_CLIENT_ID", "").strip()
    if not cognito_issuer.startswith("https://") or not cognito_client_id:
        raise RuntimeError("FAMILYOS_COGNITO_ISSUER and FAMILYOS_COGNITO_CLIENT_ID are required in production.")
    production_store = PostgresHouseholdStore(os.getenv("DATABASE_URL", ""))
    production_store.initialize()
    production_auth = CognitoSessionService(CognitoTokenVerifier(cognito_issuer, cognito_client_id), production_store)
    pairing_registry = None
    repository = None
    auth_store = None
else:
    if AUTH_MODE != "local":
        raise RuntimeError("FAMILYOS_AUTH_MODE must be 'local' or 'cognito'.")
    if not DEMO_MODE:
        raise RuntimeError("A non-demo local service is not supported; use production Cognito and PostgreSQL.")
    repository = DemoRepository()
    auth_store = LocalAuthStore(os.getenv("FAMILYOS_AUTH_DB_PATH", ".familyos/familyos-auth.sqlite3"))
    production_store = None
    production_auth = None
    pairing_registry = PairingRegistry()


@app.middleware("http")
async def request_id_header(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", "")[:100] or uuid4().hex
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


def success(request: Request, data: object, **meta: object) -> dict[str, object]:
    return {"data": data, "meta": {"request_id": request.state.request_id, **meta}}


@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError):
    return JSONResponse(status_code=exc.status_code, content={
        "error": {"code": exc.code, "message": exc.message},
        "meta": {"request_id": getattr(request.state, "request_id", uuid4().hex)},
    })


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, _exc: RequestValidationError):
    return JSONResponse(status_code=422, content={
        "error": {"code": "VALIDATION_ERROR", "message": "The request could not be validated."},
        "meta": {"request_id": getattr(request.state, "request_id", uuid4().hex)},
    })


@app.get("/health", response_model=APIEnvelope)
async def health(request: Request):
    database_ready = production_store.health() if production_store else None
    if database_ready is False:
        raise HTTPException(status_code=503, detail="Household storage is temporarily unavailable.")
    return success(request, {
        "status": "ok",
        "environment": "production" if IS_PRODUCTION else "local-preview",
        "auth_mode": AUTH_MODE,
        "ai_provider": briefings.provider_name,
        "bedrock_configured": briefings.bedrock_configured,
        "model_configured": bool(os.getenv("FAMILYOS_BEDROCK_MODEL_ID")),
        "database_ready": database_ready,
    })


AUTH_COOKIE = "familyos_session"
AUTH_COOKIE_MAX_AGE = SESSION_DAYS * 24 * 60 * 60


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        AUTH_COOKIE,
        token,
        max_age=AUTH_COOKIE_MAX_AGE,
        httponly=True,
        secure=IS_PRODUCTION or os.getenv("FAMILYOS_COOKIE_SECURE", "false").lower() == "true",
        samesite="strict",
        path="/",
    )


def session_token(request: Request) -> str | None:
    authorization = request.headers.get("Authorization", "")
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return request.cookies.get(AUTH_COOKIE)


def authenticated_session(request: Request, response: Response, token: str, account):
    response.headers["Cache-Control"] = "no-store"
    data = {"authenticated": True, "account": account}
    if request.headers.get("X-FamilyOS-Session-Transport") == "bearer":
        data["sessionToken"] = token
    else:
        set_session_cookie(response, token)
    return success(request, data)


def require_household(request: Request):
    if IS_PRODUCTION:
        account = production_auth.session(session_token(request))
        if account is not None:
            return production_store, str(account["accountId"])
        device = production_store.device_session(session_token(request))
        if device is not None:
            return production_store, device["ownerSub"]
        raise DomainError(401, "AUTHENTICATION_REQUIRED", "Sign in or pair this TV to access a household.")
    device = pairing_registry.device(session_token(request))
    if device is not None:
        return repository, None
    return repository, None


def require_parent(request: Request):
    account = production_auth.session(session_token(request)) if IS_PRODUCTION else auth_store.session(session_token(request))
    if account is None:
        raise DomainError(401, "AUTHENTICATION_REQUIRED", "Sign in as a parent to make this change.")
    return (production_store if IS_PRODUCTION else repository), str(account["accountId"])


def pair_owner(request: Request) -> tuple[str, str]:
    account = production_auth.session(session_token(request)) if IS_PRODUCTION else auth_store.session(session_token(request))
    if account is None:
        raise DomainError(401, "AUTHENTICATION_REQUIRED", "Sign in on the phone to approve a TV.")
    return str(account["accountId"]), str(account.get("householdName", "Your household"))


def household_snapshot(request: Request):
    store, owner_sub = require_household(request)
    return store.household(owner_sub) if owner_sub else store.snapshot()


@app.post("/v1/auth/exchange", response_model=APIEnvelope)
async def exchange_cognito_session(body: CognitoExchangeBody, request: Request, response: Response):
    if not IS_PRODUCTION:
        raise DomainError(404, "NOT_FOUND", "That resource could not be found.")
    token, account = production_auth.exchange(body.idToken, body.parentName, body.householdName)
    return authenticated_session(request, response, token, account)


@app.post("/v1/auth/sign-up", response_model=APIEnvelope)
async def sign_up(body: SignUpBody, request: Request):
    if IS_PRODUCTION:
        raise DomainError(404, "NOT_FOUND", "That resource could not be found.")
    account = auth_store.create_account(body.email, body.password, body.parentName, body.householdName)
    return success(request, {
        "verificationRequired": True,
        "email": account["email"],
        "householdName": account["householdName"],
    })


@app.post("/v1/auth/verify-email", response_model=APIEnvelope)
async def verify_email(body: EmailCodeBody, request: Request, response: Response):
    if IS_PRODUCTION:
        raise DomainError(404, "NOT_FOUND", "That resource could not be found.")
    token, account = auth_store.verify_email(body.email, body.code)
    return authenticated_session(request, response, token, account)


@app.post("/v1/auth/resend-verification", response_model=APIEnvelope)
async def resend_verification(body: EmailBody, request: Request):
    if IS_PRODUCTION:
        raise DomainError(404, "NOT_FOUND", "That resource could not be found.")
    auth_store.resend_verification(body.email)
    return success(request, {"message": "If the account needs verification, a new code has been sent."})


@app.post("/v1/auth/sign-in", response_model=APIEnvelope)
async def sign_in(body: SignInBody, request: Request, response: Response):
    if IS_PRODUCTION:
        raise DomainError(404, "NOT_FOUND", "That resource could not be found.")
    token, account = auth_store.sign_in(body.email, body.password)
    return authenticated_session(request, response, token, account)


@app.post("/v1/auth/sign-out", response_model=APIEnvelope)
async def sign_out(request: Request, response: Response):
    if IS_PRODUCTION:
        production_auth.sign_out(session_token(request))
    else:
        auth_store.sign_out(session_token(request))
    response.delete_cookie(AUTH_COOKIE, path="/", httponly=True, samesite="strict")
    return success(request, {"signedOut": True})


@app.get("/v1/auth/session", response_model=APIEnvelope)
async def get_auth_session(request: Request):
    account = production_auth.session(session_token(request)) if IS_PRODUCTION else auth_store.session(session_token(request))
    return success(request, {"authenticated": account is not None, "account": account})


@app.post("/v1/auth/forgot-password", response_model=APIEnvelope)
async def forgot_password(body: EmailBody, request: Request):
    if IS_PRODUCTION:
        raise DomainError(404, "NOT_FOUND", "That resource could not be found.")
    auth_store.forgot_password(body.email)
    return success(request, {"message": "If an account with that email is eligible, a reset code has been sent."})


@app.post("/v1/auth/reset-password", response_model=APIEnvelope)
async def reset_password(body: ResetPasswordBody, request: Request, response: Response):
    if IS_PRODUCTION:
        raise DomainError(404, "NOT_FOUND", "That resource could not be found.")
    auth_store.reset_password(body.email, body.code, body.newPassword)
    auth_store.sign_out(session_token(request))
    response.delete_cookie(AUTH_COOKIE, path="/", httponly=True, samesite="strict")
    return success(request, {"passwordReset": True, "signInRequired": True})


@app.get("/v1/auth/dev-email/latest", response_model=APIEnvelope)
async def get_local_dev_email(email: str, purpose: Purpose, request: Request):
    local_hosts = {"127.0.0.1", "::1", "localhost", "testclient", "testserver"}
    client_host = request.client.host if request.client else ""
    lan_testing = os.getenv("FAMILYOS_LOCAL_AUTH_LAN_TESTING", "false").lower() == "true"
    try:
        private_lan_host = ipaddress.ip_address(client_host).is_private
    except ValueError:
        private_lan_host = False
    if (
        IS_PRODUCTION
        or
        os.getenv("FAMILYOS_LOCAL_AUTH_SHOW_CODES", "true").lower() != "true"
        or (client_host not in local_hosts and not (lan_testing and private_lan_host))
    ):
        raise DomainError(404, "NOT_FOUND", "That resource could not be found.")
    delivery = auth_store.latest_dev_delivery(email, purpose)
    return success(request, delivery)


@app.get("/v1/household", response_model=APIEnvelope)
async def get_household(request: Request):
    request.state.private_household = True
    return success(request, household_snapshot(request))


@app.post("/v1/pairing/challenges", response_model=APIEnvelope)
async def create_pairing_challenge(body: PairingChallengeBody, request: Request):
    requester = request.client.host if request.client else "unknown"
    data = (
        production_store.create_pairing_challenge(body.deviceName, requester)
        if IS_PRODUCTION
        else pairing_registry.create(body.deviceName, requester)
    )
    return success(request, data)


@app.post("/v1/pairing/challenges/{challenge_id}/claim", response_model=APIEnvelope)
async def claim_pairing(challenge_id: str, body: PairingClaimBody, request: Request):
    if len(challenge_id) > 64:
        raise DomainError(404, "PAIRING_NOT_FOUND", "That pairing request is unavailable.")
    data = (
        production_store.claim_pairing(challenge_id, body.pollingToken)
        if IS_PRODUCTION
        else pairing_registry.claim(challenge_id, body.pollingToken)
    )
    return success(request, data)


@app.post("/v1/pairing/approve", response_model=APIEnvelope)
async def approve_pairing(body: PairingApproveBody, request: Request):
    owner_id, household_name = pair_owner(request)
    data = (
        production_store.approve_pairing(owner_id, body.code)
        if IS_PRODUCTION
        else pairing_registry.approve(owner_id, body.code)
    )
    return success(request, {**data, "householdName": household_name})


@app.get("/v1/devices", response_model=APIEnvelope)
async def get_paired_devices(request: Request):
    owner_id, _ = pair_owner(request)
    data = production_store.paired_devices(owner_id) if IS_PRODUCTION else pairing_registry.devices(owner_id)
    return success(request, data)


@app.post("/v1/devices/{device_id}/revoke", response_model=APIEnvelope)
async def revoke_paired_device(device_id: str, request: Request):
    owner_id, _ = pair_owner(request)
    if IS_PRODUCTION:
        production_store.revoke_device(owner_id, device_id)
    else:
        pairing_registry.revoke(owner_id, device_id)
    return success(request, {"revoked": True, "deviceId": device_id})


@app.post("/v1/device/unpair", response_model=APIEnvelope)
async def unpair_current_device(_body: EmptyBody, request: Request):
    token = session_token(request)
    if IS_PRODUCTION:
        production_store.unpair_device(token)
    else:
        pairing_registry.unpair(token)
    return success(request, {"unpaired": True})


@app.post("/v1/companion/edit", response_model=APIEnvelope)
async def companion_edit(body: CompanionMutation, request: Request):
    store, owner_sub = require_parent(request)
    if IS_PRODUCTION:
        return success(request, store.companion_edit(owner_sub, body))
    # The existing deterministic demo is intentionally separate from real households.
    with store._lock:
        store._data = apply_edit(store._data, body)
        return success(request, store.snapshot())


@app.get("/v1/events", response_model=APIEnvelope)
async def get_events(
    request: Request,
    start: str | None = Query(default=None, alias="from", max_length=40),
    end: str | None = Query(default=None, alias="to", max_length=40),
):
    from datetime import datetime

    try:
        start_value = datetime.fromisoformat(start.replace("Z", "+00:00")) if start else None
        end_value = datetime.fromisoformat(end.replace("Z", "+00:00")) if end else None
    except ValueError as error:
        raise DomainError(422, "VALIDATION_ERROR", "Event date range must use ISO date or timestamp values.") from error
    if start_value and end_value and end_value <= start_value:
        raise DomainError(422, "VALIDATION_ERROR", "The end of the event range must follow its start.")
    store, owner_sub = require_household(request)
    if owner_sub:
        return success(request, store.events(owner_sub, start_value, end_value))
    return success(request, store.events(start_value, end_value))


@app.get("/v1/chores", response_model=APIEnvelope)
async def get_chores(request: Request):
    return success(request, household_snapshot(request).chores)


@app.get("/v1/routines", response_model=APIEnvelope)
async def get_routines(request: Request):
    return success(request, household_snapshot(request).routines)


@app.get("/v1/conflicts", response_model=APIEnvelope)
async def get_conflicts(request: Request):
    store, owner_sub = require_household(request)
    return success(request, store.conflicts(owner_sub) if owner_sub else store.conflicts())


@app.get("/v1/actions/history", response_model=APIEnvelope)
async def get_action_history(request: Request):
    store, owner_sub = require_household(request)
    return success(request, store.action_history(owner_sub) if owner_sub else store.action_history())


async def build_briefing(request: Request, context: HouseholdContext):
    result, fallback = await briefings.generate(context)
    return success(request, result, fallback=fallback, provider=result.provider)


@app.get("/v1/briefing", response_model=APIEnvelope)
async def get_briefing(request: Request):
    context = snapshot_context(household_snapshot(request), demo_now())
    return await build_briefing(request, context)


@app.post("/v1/briefing", response_model=APIEnvelope)
async def create_briefing(context: HouseholdContext, request: Request):
    """Brief the app's minimized local snapshot; never accept notes or photo content."""
    require_household(request)
    return await build_briefing(request, context)


@app.post("/v1/actions/propose", response_model=APIEnvelope)
async def propose_action(body: ActionProposalRequest, request: Request):
    store, owner_sub = require_parent(request)
    if IS_PRODUCTION:
        proposal = store.propose(owner_sub, body.conflictId, body.eventId, body.targetMemberId)
    else:
        proposal = store.propose(body.conflictId, body.eventId, body.targetMemberId)
    return success(request, proposal)


@app.post("/v1/actions/{action_id}/confirm", response_model=APIEnvelope)
async def confirm_action(action_id: str, request: Request):
    store, owner_sub = require_parent(request)
    action, event, history = store.confirm(owner_sub, action_id) if IS_PRODUCTION else store.confirm(action_id)
    return success(request, {"action": action, "event": event, "actionHistory": history})


@app.post("/v1/actions/{action_id}/cancel", response_model=APIEnvelope)
async def cancel_action(action_id: str, request: Request):
    store, owner_sub = require_parent(request)
    action = store.cancel(owner_sub, action_id) if IS_PRODUCTION else store.cancel(action_id)
    return success(request, action)


@app.post("/v1/demo/reset", response_model=APIEnvelope)
async def reset_demo(request: Request):
    if IS_PRODUCTION:
        raise DomainError(404, "NOT_FOUND", "That resource could not be found.")
    return success(request, repository.reset())

if not IS_PRODUCTION:
    app.mount(
        "/companion",
        StaticFiles(directory=Path(__file__).with_name("companion"), html=True),
        name="local-companion",
    )
