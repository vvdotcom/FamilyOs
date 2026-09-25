from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .auth import EmailBody, EmailCodeBody, LocalAuthStore, ResetPasswordBody, SignInBody, SignUpBody, Purpose, SESSION_DAYS
from .briefing import SafeBriefingService
from .demo import demo_now
from .domain import DemoRepository, DomainError, snapshot_context
from .models import APIEnvelope, ActionProposalRequest, HouseholdContext

if os.getenv("RAILWAY_ENVIRONMENT"):
    raise RuntimeError(
        "FamilyOS deployment is intentionally blocked until production Cognito authentication, "
        "PostgreSQL persistence, and protected household routes are implemented and configured. "
        "Do not expose the local demo API on Railway."
    )

AUTH_MODE = os.getenv("FAMILYOS_AUTH_MODE", "local").strip().lower()
if AUTH_MODE != "local":
    raise RuntimeError("Only FAMILYOS_AUTH_MODE=local is implemented in this build; production identity is not ready.")

repository = DemoRepository()
briefings = SafeBriefingService()
auth_store = LocalAuthStore(os.getenv("FAMILYOS_AUTH_DB_PATH", ".familyos/familyos-auth.sqlite3"))
app = FastAPI(title="FamilyOS Family Agent", version="0.1.0")

if os.getenv("FAMILYOS_DEMO_MODE", "true").lower() == "true":
    origins = ["*"]
else:
    origins = [value.strip() for value in os.getenv("FAMILYOS_CORS_ORIGINS", "").split(",") if value.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Request-ID"],
)


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
    return success(request, {
        "status": "ok",
        "environment": "local-preview",
        "auth_mode": AUTH_MODE,
        "ai_provider": briefings.provider_name,
        "bedrock_configured": briefings.bedrock_configured,
        "model_configured": bool(os.getenv("FAMILYOS_BEDROCK_MODEL_ID")),
    })


AUTH_COOKIE = "familyos_session"
AUTH_COOKIE_MAX_AGE = SESSION_DAYS * 24 * 60 * 60


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        AUTH_COOKIE,
        token,
        max_age=AUTH_COOKIE_MAX_AGE,
        httponly=True,
        secure=os.getenv("FAMILYOS_COOKIE_SECURE", "false").lower() == "true",
        samesite="strict",
        path="/",
    )


@app.post("/v1/auth/sign-up", response_model=APIEnvelope)
async def sign_up(body: SignUpBody, request: Request):
    account = auth_store.create_account(body.email, body.password, body.parentName, body.householdName)
    return success(request, {
        "verificationRequired": True,
        "email": account["email"],
        "householdName": account["householdName"],
    })


@app.post("/v1/auth/verify-email", response_model=APIEnvelope)
async def verify_email(body: EmailCodeBody, request: Request, response: Response):
    token, account = auth_store.verify_email(body.email, body.code)
    set_session_cookie(response, token)
    return success(request, {"authenticated": True, "account": account})


@app.post("/v1/auth/resend-verification", response_model=APIEnvelope)
async def resend_verification(body: EmailBody, request: Request):
    auth_store.resend_verification(body.email)
    return success(request, {"message": "If the account needs verification, a new code has been sent."})


@app.post("/v1/auth/sign-in", response_model=APIEnvelope)
async def sign_in(body: SignInBody, request: Request, response: Response):
    token, account = auth_store.sign_in(body.email, body.password)
    set_session_cookie(response, token)
    return success(request, {"authenticated": True, "account": account})


@app.post("/v1/auth/sign-out", response_model=APIEnvelope)
async def sign_out(request: Request, response: Response):
    auth_store.sign_out(request.cookies.get(AUTH_COOKIE))
    response.delete_cookie(AUTH_COOKIE, path="/", httponly=True, samesite="strict")
    return success(request, {"signedOut": True})


@app.get("/v1/auth/session", response_model=APIEnvelope)
async def get_auth_session(request: Request):
    account = auth_store.session(request.cookies.get(AUTH_COOKIE))
    return success(request, {"authenticated": account is not None, "account": account})


@app.post("/v1/auth/forgot-password", response_model=APIEnvelope)
async def forgot_password(body: EmailBody, request: Request):
    auth_store.forgot_password(body.email)
    return success(request, {"message": "If an account with that email is eligible, a reset code has been sent."})


@app.post("/v1/auth/reset-password", response_model=APIEnvelope)
async def reset_password(body: ResetPasswordBody, request: Request, response: Response):
    auth_store.reset_password(body.email, body.code, body.newPassword)
    auth_store.sign_out(request.cookies.get(AUTH_COOKIE))
    response.delete_cookie(AUTH_COOKIE, path="/", httponly=True, samesite="strict")
    return success(request, {"passwordReset": True, "signInRequired": True})


@app.get("/v1/auth/dev-email/latest", response_model=APIEnvelope)
async def get_local_dev_email(email: str, purpose: Purpose, request: Request):
    local_hosts = {"127.0.0.1", "::1", "localhost", "testclient", "testserver"}
    client_host = request.client.host if request.client else ""
    if (
        os.getenv("FAMILYOS_LOCAL_AUTH_SHOW_CODES", "true").lower() != "true"
        or client_host not in local_hosts
    ):
        raise DomainError(404, "NOT_FOUND", "That resource could not be found.")
    delivery = auth_store.latest_dev_delivery(email, purpose)
    return success(request, delivery)


@app.get("/v1/household", response_model=APIEnvelope)
async def get_household(request: Request):
    return success(request, repository.snapshot())


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
    return success(request, repository.events(start_value, end_value))


@app.get("/v1/chores", response_model=APIEnvelope)
async def get_chores(request: Request):
    return success(request, repository.snapshot().chores)


@app.get("/v1/routines", response_model=APIEnvelope)
async def get_routines(request: Request):
    return success(request, repository.snapshot().routines)


@app.get("/v1/conflicts", response_model=APIEnvelope)
async def get_conflicts(request: Request):
    return success(request, repository.conflicts())


@app.get("/v1/actions/history", response_model=APIEnvelope)
async def get_action_history(request: Request):
    return success(request, repository.action_history())


async def build_briefing(request: Request, context: HouseholdContext):
    result, fallback = await briefings.generate(context)
    return success(request, result, fallback=fallback, provider=result.provider)


@app.get("/v1/briefing", response_model=APIEnvelope)
async def get_briefing(request: Request):
    context = snapshot_context(repository.snapshot(), demo_now())
    return await build_briefing(request, context)


@app.post("/v1/briefing", response_model=APIEnvelope)
async def create_briefing(context: HouseholdContext, request: Request):
    """Brief the app's minimized local snapshot; never accept notes or photo content."""
    return await build_briefing(request, context)


@app.post("/v1/actions/propose", response_model=APIEnvelope)
async def propose_action(body: ActionProposalRequest, request: Request):
    proposal = repository.propose(body.conflictId, body.eventId, body.targetMemberId)
    return success(request, proposal)


@app.post("/v1/actions/{action_id}/confirm", response_model=APIEnvelope)
async def confirm_action(action_id: str, request: Request):
    action, event, history = repository.confirm(action_id)
    return success(request, {"action": action, "event": event, "actionHistory": history})


@app.post("/v1/actions/{action_id}/cancel", response_model=APIEnvelope)
async def cancel_action(action_id: str, request: Request):
    action = repository.cancel(action_id)
    return success(request, action)


@app.post("/v1/demo/reset", response_model=APIEnvelope)
async def reset_demo(request: Request):
    return success(request, repository.reset())


app.mount(
    "/companion",
    StaticFiles(directory=Path(__file__).with_name("companion"), html=True),
    name="local-companion",
)
