from __future__ import annotations

import asyncio
import ipaddress
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.routing import Route

from . import alexa, calendars
from .auth import EmailBody, EmailCodeBody, LocalAuthStore, ResetPasswordBody, SignInBody, SignUpBody, Purpose, SESSION_DAYS
from .briefing import SafeBriefingService
from .companion import CompanionMutation
from .demo import demo_now
from .domain import DemoRepository, DomainError, snapshot_context, sports_reminders
from .household_ops import FAMILY_NIGHT_RULE, current_picker, household_today
from .imports import ImportContext, ImportRequest, configured_import_provider, make_import_drafts
from .models import (
    APIEnvelope, ActionProposalRequest, CalendarAddBody, CalendarSubscriptionMeta, ChangeParentAccessCodeBody, ChildAccessBody, ChoreVerificationBody,
    CognitoExchangeBody, DecisionWithCodeBody, EmptyBody, HouseholdContext, MoveCompleteBody, PairingApproveBody,
    PairingChallengeBody, PairingClaimBody, ParentAccessCodeBody, PhotoUploadBody, ProposalDecisionBody,
    DeleteAccountBody, RedemptionDecisionBody, RedemptionRequestBody, ResetAccessCodeBody, StarAdjustmentBody, VoiceTokenBody,
    VoiceUtteranceBody,
)
from .move import MOVE_ROUTINES, SAFETY_NOTE, routine_summary
from .pairing import PairingRegistry
from .rhythm import Rhythm, find_patterns, learned_routines
from .permissions import MATRIX, Actor
from .photos import HOUSEHOLD_PHOTO_QUOTA_BYTES, decode_upload, process_image
from .production import CognitoAccessTokenVerifier, CognitoSessionService, CognitoTokenVerifier, PostgresHouseholdStore
from .service import HouseholdService
from .vision import CHEERS, FALLBACK as VISION_FALLBACK, check_chore_photo, configured_provider
from .tv_commands import TVCommandBus
from .voice import VoiceGateway, VoiceServer
from .weather import NWSWeatherProvider, WeatherNotConfigured, WeatherUnavailable, WeatherUnsupportedLocation

AUTH_MODE = os.getenv("FAMILYOS_AUTH_MODE", "local").strip().lower()
DEMO_MODE = os.getenv("FAMILYOS_DEMO_MODE", "true").lower() == "true"
IS_PRODUCTION = AUTH_MODE == "cognito"
VISION_CHECKS_PER_DAY = int(os.getenv("FAMILYOS_VISION_CHECKS_PER_DAY", "30"))
# Amazon Bedrock spending guard: AI requests allowed per household, and for the whole service, per UTC day.
# At about $0.0001-$0.0002 per request, the service-wide default caps spend near $1 a day.
AI_CALLS_PER_DAY = int(os.getenv("FAMILYOS_AI_CALLS_PER_DAY", "200"))
AI_CALLS_PER_DAY_TOTAL = int(os.getenv("FAMILYOS_AI_CALLS_PER_DAY_TOTAL", "5000"))
_ai_usage: dict[str, int] = {}
# Minutes between background re-reads of connected calendars; 0 turns the background sync off.
CALENDAR_SYNC_MINUTES = float(os.getenv("FAMILYOS_CALENDAR_SYNC_MINUTES", "15"))
# The Alexa skill standing in for the Alexa+ add-on. Unset: the /alexa endpoint is off.
ALEXA_SKILL_ID = os.getenv("FAMILYOS_ALEXA_SKILL_ID", "").strip()
ALEXA_MCP_CLIENT_FACTORY = None  # Tests route the skill's MCP client to this app in-process.
logger = logging.getLogger("familyos.agent")

if os.getenv("RAILWAY_ENVIRONMENT") and not IS_PRODUCTION:
    raise RuntimeError(
        "Hometide deployment is blocked unless Cognito authentication and PostgreSQL are enabled. "
        "Do not expose the local demo API on Railway."
    )

briefings = SafeBriefingService()
weather_provider = NWSWeatherProvider.from_environment()
cognito_issuer = os.getenv("FAMILYOS_COGNITO_ISSUER", "").strip().rstrip("/")
cognito_access_verifier = None

if IS_PRODUCTION:
    if DEMO_MODE:
        raise RuntimeError("FAMILYOS_DEMO_MODE must be false when FAMILYOS_AUTH_MODE=cognito.")
    if os.getenv("FAMILYOS_COOKIE_SECURE", "false").lower() != "true":
        raise RuntimeError("FAMILYOS_COOKIE_SECURE=true is required for production sessions.")
    cognito_client_id = os.getenv("FAMILYOS_COGNITO_CLIENT_ID", "").strip()
    if not cognito_issuer.startswith("https://") or not cognito_client_id:
        raise RuntimeError("FAMILYOS_COGNITO_ISSUER and FAMILYOS_COGNITO_CLIENT_ID are required in production.")
    production_store = PostgresHouseholdStore(os.getenv("DATABASE_URL", ""))
    production_store.initialize()
    production_auth = CognitoSessionService(CognitoTokenVerifier(cognito_issuer, cognito_client_id), production_store)
    voice_clients = {item.strip() for item in os.getenv("FAMILYOS_MCP_COGNITO_CLIENT_IDS", "").split(",") if item.strip()}
    cognito_access_verifier = CognitoAccessTokenVerifier(cognito_issuer, voice_clients) if voice_clients else None
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


def service() -> HouseholdService:
    """Built per call from module globals so tests can substitute stores."""
    return HouseholdService(production=IS_PRODUCTION, repository=repository, pg_store=production_store, auth_store=auth_store)


PUBLIC_URL = os.getenv("FAMILYOS_PUBLIC_URL", "http://127.0.0.1:8787").rstrip("/")


class _ServiceProxy:
    def __getattr__(self, name):
        return getattr(service(), name)


voice_gateway = VoiceGateway(_ServiceProxy(), cognito_access_verifier)  # type: ignore[arg-type]
tv_command_bus = TVCommandBus()
# Routines Hometide learns from the calendar, remembered in Amazon Bedrock AgentCore Memory when configured.
rhythm = Rhythm()
voice_server = VoiceServer(
    _ServiceProxy(), voice_gateway, public_url=PUBLIC_URL, rhythm=rhythm,  # type: ignore[arg-type]
    authorization_server=cognito_issuer or PUBLIC_URL, tv_commands=tv_command_bus, weather=weather_provider.forecast_for,
    allowed_origins=[value.strip() for value in os.getenv("FAMILYOS_MCP_ALLOWED_ORIGINS", "").split(",") if value.strip()],
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    background = asyncio.create_task(calendar_sync_loop()) if CALENDAR_SYNC_MINUTES > 0 else None
    try:
        async with voice_server.lifespan():
            yield
    finally:
        if background is not None:
            background.cancel()


app = FastAPI(title="Hometide Family Agent", version="0.2.0", lifespan=lifespan)

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
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-FamilyOS-Session-Transport",
                   "Mcp-Session-Id", "Mcp-Protocol-Version"],
)


@app.middleware("http")
async def request_id_header(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", "")[:100] or uuid4().hex
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


def take_ai_call(owner: str | None) -> bool:
    """Reserve one AI request for today. False means today's budget is spent and the caller must fall back."""
    day = datetime.now(timezone.utc).date().isoformat()
    household = f"{day}|{owner or 'anonymous'}"
    for key in [key for key in _ai_usage if not key.startswith(day)]:
        del _ai_usage[key]  # Forget earlier days.
    if _ai_usage.get(household, 0) >= AI_CALLS_PER_DAY or _ai_usage.get(day, 0) >= AI_CALLS_PER_DAY_TOTAL:
        return False
    _ai_usage[household] = _ai_usage.get(household, 0) + 1
    _ai_usage[day] = _ai_usage.get(day, 0) + 1
    return True


class _BudgetedImportReader:
    """Counts each Bedrock read of a photo or scanned PDF against the daily budget."""

    def __init__(self, provider, owner: str | None) -> None:
        self.provider, self.owner, self.name = provider, owner, provider.name

    async def from_image(self, raw, media, context):
        if not take_ai_call(self.owner):
            raise DomainError(429, "AI_DAILY_LIMIT",
                              "Your family reached today's limit for reading photos. Paste the text instead, or try again tomorrow.")
        return await self.provider.from_image(raw, media, context)


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


# Public policy pages (linked from the app stores) ------------------------------------------------------
PAGES_DIR = Path(__file__).with_name("pages")
POLICY_UPDATED = "October 1, 2026"


def _public_page(name: str) -> HTMLResponse:
    """Render a policy page. The operator name and privacy email come from Railway variables."""
    import html as _html

    operator = _html.escape(os.getenv("FAMILYOS_OPERATOR_NAME", "").strip())
    email = _html.escape(os.getenv("FAMILYOS_PRIVACY_EMAIL", "").strip())
    mail = f'<a href="mailto:{email}">{email}</a>' if email else ""
    values = {
        "{{UPDATED}}": POLICY_UPDATED,
        "{{OPERATOR_SENTENCE}}": f"Hometide is provided by {operator}." if operator else "",
        "{{CONTACT_SENTENCE}}": (f"Questions, requests, or concerns about privacy or your children's data: email {mail}."
                                 if email else "Use the tools in the app, or the account-deletion page, for privacy requests."),
        "{{CONTACT_SENTENCE_DELETE}}": (
            "Reset your password from the sign-in screen (<em>Forgot password?</em>), then delete the account as above."
            + (f" Or email {mail} from the email address on the account and ask us to delete it. We confirm and "
               "delete it within 30 days." if email else "")),
    }
    page = (PAGES_DIR / name).read_text(encoding="utf-8")
    for key, value in values.items():
        page = page.replace(key, value)
    return HTMLResponse(page, headers={"Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff",
                                       "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; "
                                       "img-src 'self'; frame-ancestors 'none'"})


@app.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
async def privacy_page():
    return _public_page("privacy.html")


@app.get("/delete-account", response_class=HTMLResponse, include_in_schema=False)
async def delete_account_page():
    return _public_page("delete-account.html")


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
        "weather_provider": "nws" if weather_provider.configured else "disabled",
        "weather_configured": weather_provider.configured,
        "database_ready": database_ready,
        "mcp_endpoint": "/mcp",
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


def _optional(store, name: str, *args):
    method = getattr(store, name, None)
    return method(*args) if method else None


# Actors ------------------------------------------------------------------------------------------

def resolve_actor(request: Request) -> Actor | None:
    """Identify who is calling: parent, child profile, or paired TV. Never trusts body IDs."""
    token = session_token(request)
    if not token:
        return None
    if IS_PRODUCTION:
        child = _optional(production_store, "child_session", token)
        if child:
            return Actor("child", str(child["ownerSub"]), member_id=str(child["memberId"]))
        account = production_auth.session(token)
        if account:
            return Actor("parent", str(account["accountId"]), elevated=bool(account.get("elevated")))
        device = _optional(production_store, "device_session", token)
        if device:
            device_id = str(device.get("deviceId", ""))
            elevated = bool(device.get("elevated")) and bool(_optional(production_store, "device_elevated", device_id))
            return Actor("device_parent" if elevated else "device", str(device["ownerSub"]), device_id=device_id)
        return None
    child = _optional(auth_store, "child_session", token)
    if child:
        return Actor("child", str(child["accountId"]), member_id=str(child["memberId"]))
    account = auth_store.session(token)
    if account:
        return Actor("parent", str(account["accountId"]), elevated=bool(account.get("elevated")))
    device = pairing_registry.device(token) if pairing_registry else None
    if device:
        elevated = pairing_registry.is_elevated(device)
        return Actor("device_parent" if elevated else "device", device.owner_id, device_id=device.id)
    return None


def require_actor(request: Request, allowed: set[str] | None = None) -> Actor:
    actor = resolve_actor(request)
    if actor is None:
        raise DomainError(401, "AUTHENTICATION_REQUIRED", "Sign in or pair this TV to access a household.")
    if allowed is not None and actor.type not in allowed:
        if actor.type == "child":
            raise DomainError(403, "CHILD_PERMISSION_DENIED", "Ask a parent to make this change.")
        if actor.type == "device":
            raise DomainError(403, "PARENT_CODE_REQUIRED", "Ask a parent to unlock the TV with the four-digit code.")
        raise DomainError(403, "PERMISSION_DENIED", "This account cannot make that change.")
    return actor


def require_parent(request: Request) -> Actor:
    actor = resolve_actor(request)
    if actor is None or actor.type != "parent":
        if actor is not None and actor.type == "child":
            raise DomainError(403, "CHILD_PERMISSION_DENIED", "Ask a parent to make this change.")
        raise DomainError(401, "AUTHENTICATION_REQUIRED", "Sign in as a parent to make this change.")
    return actor


def pair_owner(request: Request) -> tuple[str, str]:
    account = production_auth.session(session_token(request)) if IS_PRODUCTION else auth_store.session(session_token(request))
    if account is None:
        raise DomainError(401, "AUTHENTICATION_REQUIRED", "Sign in on the phone to approve a TV.")
    return str(account["accountId"]), str(account.get("householdName", "Your household"))


def household_snapshot(request: Request):
    actor = resolve_actor(request)
    if actor is not None:
        return service().snapshot(actor.owner)
    if IS_PRODUCTION:
        raise DomainError(401, "AUTHENTICATION_REQUIRED", "Sign in or pair this TV to access a household.")
    return repository.snapshot()  # The unpaired local demo TV reads the shared demo household.


# Accounts ----------------------------------------------------------------------------------------

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
    token = session_token(request)
    store = production_store if IS_PRODUCTION else auth_store
    if _optional(store, "child_session", token):
        store.revoke_child_session(token)
    elif IS_PRODUCTION:
        production_auth.sign_out(token)
    else:
        auth_store.sign_out(token)
    response.delete_cookie(AUTH_COOKIE, path="/", httponly=True, samesite="strict")
    return success(request, {"signedOut": True})


@app.post("/v1/auth/sessions/revoke-all", response_model=APIEnvelope)
async def revoke_all_sessions(request: Request, response: Response):
    """Sign this parent account out everywhere, including child sessions it started."""
    actor = require_parent(request)
    service().accounts.revoke_all_sessions(actor.owner)
    response.delete_cookie(AUTH_COOKIE, path="/", httponly=True, samesite="strict")
    return success(request, {"revoked": True, "signInRequired": True})


@app.get("/v1/auth/session", response_model=APIEnvelope)
async def get_auth_session(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    actor = resolve_actor(request)
    if actor is not None and actor.type == "child":
        account = (production_store.account_for_owner(actor.owner) if IS_PRODUCTION
                   else auth_store.account_for_id(actor.owner))
        member = next((item for item in service().snapshot(actor.owner).members if item.id == actor.member_id), None)
        return success(request, {"authenticated": True, "accessMode": "child", "memberId": actor.member_id,
                                 "account": {**account, "parentName": "Parent", "email": ""},
                                 "memberName": member.name if member else "Child"})
    token = session_token(request)
    account = production_auth.session(token) if IS_PRODUCTION else auth_store.session(token)
    return success(request, {"authenticated": account is not None, "accessMode": "parent" if account else None,
                             "memberId": None, "account": account,
                             "elevated": bool(account and account.get("elevated"))})


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
        or os.getenv("FAMILYOS_LOCAL_AUTH_SHOW_CODES", "true").lower() != "true"
        or (client_host not in local_hosts and not (lan_testing and private_lan_host))
    ):
        raise DomainError(404, "NOT_FOUND", "That resource could not be found.")
    delivery = auth_store.latest_dev_delivery(email, purpose)
    return success(request, delivery)


# Household reads ---------------------------------------------------------------------------------

@app.get("/v1/household", response_model=APIEnvelope)
async def get_household(request: Request):
    snapshot = household_snapshot(request)
    actor = resolve_actor(request)
    if actor is not None or not IS_PRODUCTION:
        snapshot = learn_rhythm(actor.owner if actor else None, snapshot)
    return success(request, snapshot)


def learn_rhythm(owner, snapshot, *, force: bool = False):
    """Offer at most one routine Hometide noticed. Never lets a pattern check break a household read."""
    try:
        return rhythm.check(service(), owner, snapshot, force=force)
    except Exception:  # pragma: no cover - defensive: the read must still succeed.
        logger.exception("rhythm check failed")
        return snapshot


@app.get("/v1/rhythm", response_model=APIEnvelope)
async def get_rhythm(request: Request):
    """What Hometide has noticed in the calendar and the routines the family confirmed."""
    snapshot = household_snapshot(request)
    actor = resolve_actor(request)
    patterns = [{"id": item.id, "kind": item.kind, "summary": item.summary, "detail": item.detail,
                 "evidence": item.evidence} for item in find_patterns(snapshot)]
    return success(request, {"patterns": patterns, "learned": learned_routines(snapshot),
                             "memory": rhythm.memory.provider, "owner": bool(actor)})


@app.get("/v1/permissions", response_model=APIEnvelope)
async def get_permissions(request: Request):
    actor = resolve_actor(request)
    return success(request, {"actor": actor.type if actor else None, "memberId": actor.member_id if actor else None,
                             "matrix": MATRIX})


@app.get("/v1/weather", response_model=APIEnvelope)
async def get_weather(request: Request, response: Response):
    """Forecast for the household's saved location; the service-wide setting is only a fallback."""
    snapshot = household_snapshot(request)
    response.headers["Cache-Control"] = "no-store"
    place = snapshot.location
    if place is None and not weather_provider.configured:
        raise DomainError(503, "WEATHER_NOT_CONFIGURED", "Set your household's location in the Hometide app to show weather.")
    try:
        if place is not None:
            forecast = await weather_provider.forecast_for(place.latitude, place.longitude, place.label)
        else:
            forecast = await weather_provider.get_forecast()
    except WeatherNotConfigured as error:
        raise DomainError(503, "WEATHER_NOT_CONFIGURED", "Set your household's location in the Hometide app to show weather.") from error
    except WeatherUnsupportedLocation as error:
        raise DomainError(503, "WEATHER_UNSUPPORTED_LOCATION", "Weather forecasts are available for US locations only.") from error
    except WeatherUnavailable as error:
        raise DomainError(503, "WEATHER_UNAVAILABLE", "The weather service is temporarily unavailable.") from error
    return success(request, forecast, provider="nws", source="household" if place else "service")


@app.get("/v1/events", response_model=APIEnvelope)
async def get_events(
    request: Request,
    start: str | None = Query(default=None, alias="from", max_length=40),
    end: str | None = Query(default=None, alias="to", max_length=40),
):
    try:
        start_value = datetime.fromisoformat(start.replace("Z", "+00:00")) if start else None
        end_value = datetime.fromisoformat(end.replace("Z", "+00:00")) if end else None
    except ValueError as error:
        raise DomainError(422, "VALIDATION_ERROR", "Event date range must use ISO date or timestamp values.") from error
    if start_value and end_value and end_value <= start_value:
        raise DomainError(422, "VALIDATION_ERROR", "The end of the event range must follow its start.")
    from .domain import parse
    values = household_snapshot(request).events
    if start_value:
        values = [item for item in values if parse(item.endAt) > start_value]
    if end_value:
        values = [item for item in values if parse(item.startAt) < end_value]
    return success(request, values)


@app.get("/v1/chores", response_model=APIEnvelope)
async def get_chores(request: Request):
    return success(request, household_snapshot(request).chores)


@app.get("/v1/routines", response_model=APIEnvelope)
async def get_routines(request: Request):
    return success(request, household_snapshot(request).routines)


@app.get("/v1/conflicts", response_model=APIEnvelope)
async def get_conflicts(request: Request):
    from .domain import detect_conflicts
    return success(request, detect_conflicts(household_snapshot(request), demo_now()))


@app.get("/v1/reminders", response_model=APIEnvelope)
async def get_reminders(request: Request):
    snapshot = household_snapshot(request)
    return success(request, {"sports": sports_reminders(snapshot, demo_now())})


@app.get("/v1/actions/history", response_model=APIEnvelope)
async def get_action_history(request: Request):
    actor = resolve_actor(request)
    if IS_PRODUCTION:
        actor = require_actor(request)
        return success(request, production_store.action_history(actor.owner))
    return success(request, repository.action_history())


async def build_briefing(request: Request, context: HouseholdContext):
    actor = resolve_actor(request)
    owner = actor.owner if actor else None
    result, fallback = await briefings.generate(context, may_use_ai=lambda: take_ai_call(owner))
    return success(request, result, fallback=fallback, provider=result.provider)


@app.get("/v1/briefing", response_model=APIEnvelope)
async def get_briefing(request: Request):
    context = snapshot_context(household_snapshot(request), demo_now())
    return await build_briefing(request, context)


@app.post("/v1/briefing", response_model=APIEnvelope)
async def create_briefing(context: HouseholdContext, request: Request):
    """Brief the app's minimized local snapshot; never accept notes or photo content."""
    household_snapshot(request)
    return await build_briefing(request, context)


# Pairing and TV parent mode ------------------------------------------------------------------------

@app.post("/v1/pairing/challenges", response_model=APIEnvelope)
async def create_pairing_challenge(body: PairingChallengeBody, request: Request):
    requester = request.client.host if request.client else "unknown"
    data = (
        production_store.create_pairing_challenge(body.deviceName, requester)
        if IS_PRODUCTION
        else pairing_registry.create(body.deviceName, requester)
    )
    # The TV shows this link as a QR code. The code rides in the URL fragment, which browsers never send to a
    # server, so it stays out of access logs; a signed-in parent still has to tap "Approve TV".
    return success(request, {**data, "pairUrl": f"{PUBLIC_URL}/app/#pair={data['code']}"})


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


def _elevate_tv(request: Request, actor: Actor) -> str:
    token = session_token(request)
    until = production_store.elevate_device(token) if IS_PRODUCTION else pairing_registry.elevate(token)
    return until.isoformat()


@app.post("/v1/tv/parent-mode", response_model=APIEnvelope)
async def unlock_tv_parent_mode(body: ParentAccessCodeBody, request: Request):
    """Temporary parent access on a paired TV. It ends after five idle minutes or when locked."""
    actor = require_actor(request, {"device", "device_parent"})
    service().verify_code(actor.owner, body.code)
    return success(request, {"elevated": True, "expiresAt": _elevate_tv(request, actor), "idleMinutes": 5})


@app.post("/v1/tv/lock", response_model=APIEnvelope)
async def lock_tv_parent_mode(_body: EmptyBody, request: Request):
    require_actor(request, {"device", "device_parent"})
    if IS_PRODUCTION:
        production_store.lock_device(session_token(request))
    else:
        pairing_registry.lock(session_token(request))
    return success(request, {"elevated": False})


@app.post("/alexa", include_in_schema=False)
async def alexa_skill(request: Request):
    """Alexa Skills Kit endpoint. The skill reaches Hometide through the MCP server, with the linked account's token."""
    if not ALEXA_SKILL_ID:
        raise DomainError(404, "NOT_FOUND", "That resource could not be found.")
    body = await request.body()
    try:
        envelope = await asyncio.to_thread(alexa.verify_request, request.headers, body, ALEXA_SKILL_ID)
    except alexa.AlexaRequestRejected as error:
        logger.info("Alexa request rejected: %s", error)
        return JSONResponse(status_code=400, content={"error": "invalid request"})
    reply = await alexa.respond(
        envelope, identity_for=voice_gateway.identity,
        open_tools=lambda token: alexa.mcp_tools(f"{PUBLIC_URL}/mcp", token, ALEXA_MCP_CLIENT_FACTORY),
        converse=voice_server.converse, budget=take_ai_call,
    )
    return JSONResponse(reply)


@app.get("/v1/tv/commands", response_model=APIEnvelope)
async def tv_commands(request: Request, response: Response, after: int = Query(default=-1, ge=-1)):
    """What voice asked this household's TV to show. Polled by paired TVs about every 1.5 seconds."""
    actor = require_actor(request, {"device", "device_parent"})
    response.headers["Cache-Control"] = "no-store"
    commands, latest = tv_command_bus.since(actor.owner, after)
    return success(request, {"commands": commands, "latest": latest})


@app.get("/v1/tv/session", response_model=APIEnvelope)
async def tv_session(request: Request):
    actor = require_actor(request, {"device", "device_parent"})
    return success(request, {"paired": True, "elevated": actor.type == "device_parent"})


# Household edits ----------------------------------------------------------------------------------

@app.post("/v1/companion/edit", response_model=APIEnvelope)
async def companion_edit(body: CompanionMutation, request: Request):
    actor = require_actor(request)
    return success(request, service().edit(actor, body.kind, body.value, expected_revision=body.expectedRevision))


@app.post("/v1/access-code", response_model=APIEnvelope)
async def set_parent_access_code(body: ParentAccessCodeBody, request: Request):
    actor = require_parent(request)
    service().accounts.set_parent_access_code(actor.owner, body.code)
    return success(request, {"configured": True})


@app.get("/v1/access-code", response_model=APIEnvelope)
async def parent_access_code_status(request: Request):
    actor = require_parent(request)
    return success(request, {"configured": service().accounts.parent_access_code_configured(actor.owner)})


@app.post("/v1/access-code/change", response_model=APIEnvelope)
async def change_parent_access_code(body: ChangeParentAccessCodeBody, request: Request):
    actor = require_parent(request)
    service().accounts.change_parent_access_code(actor.owner, body.oldCode, body.newCode)
    return success(request, {"changed": True})


@app.post("/v1/access-code/reset", response_model=APIEnvelope)
async def reset_parent_access_code(body: ResetAccessCodeBody, request: Request):
    """Owner recovery: a forgotten four-digit code is replaced only after re-entering the account password."""
    actor = require_parent(request)
    if IS_PRODUCTION:
        production_auth.verify_recent_sign_in(body.idToken, actor.owner)
    else:
        auth_store.verify_password(actor.owner, body.password or "")
    service().accounts.reset_parent_access_code(actor.owner, body.newCode)
    return success(request, {"reset": True})


@app.post("/v1/account/delete", response_model=APIEnvelope)
async def delete_account(body: DeleteAccountBody, request: Request, response: Response):
    """Permanently delete the signed-in parent's household and everything in it.

    Needs a fresh password sign-in. Sessions, paired TVs, child views, the parent code, voice connections,
    photos and calendar links go with it. The phone or web app then deletes the Cognito sign-in itself.
    """
    actor = require_parent(request)
    if IS_PRODUCTION:
        production_auth.verify_recent_sign_in(body.idToken, actor.owner,
                                              message="Enter your password again to delete your account.")
        production_store.delete_household(actor.owner)
    else:
        auth_store.verify_password(actor.owner, body.password or "")
        auth_store.delete_account(actor.owner)
    response.delete_cookie(AUTH_COOKIE, path="/")
    response.headers["Cache-Control"] = "no-store"
    logger.info("Account deleted on request")
    return success(request, {"deleted": True})


@app.get("/v1/rewards", response_model=APIEnvelope)
async def get_rewards(request: Request):
    snapshot = household_snapshot(request)
    balances = {
        member.id: sum(item.delta for item in snapshot.starTransactions if item.memberId == member.id)
        for member in snapshot.members
    }
    return success(request, {"rewards": snapshot.rewards, "redemptions": snapshot.redemptions,
                             "balances": balances, "starTransactions": snapshot.starTransactions})


@app.post("/v1/redemptions/request", response_model=APIEnvelope)
async def request_redemption(body: RedemptionRequestBody, request: Request):
    actor = require_actor(request, {"parent", "child"})
    if actor.type == "child" and body.memberId != actor.member_id:
        raise DomainError(403, "CHILD_PERMISSION_DENIED", "A child can request a reward only for their own profile.")
    snapshot = service().snapshot(actor.owner)
    reward = next((item for item in snapshot.rewards if item.id == body.rewardId and item.available), None)
    if reward is None:
        raise DomainError(404, "REWARD_NOT_FOUND", "That reward is not available.")
    request_id = uuid4().hex
    saved = service().edit(actor, "redemptionRequest", {
        "id": request_id, "memberId": body.memberId, "rewardId": reward.id,
        "stars": reward.stars, "status": "pending",
        "requestedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }, server=True)
    return success(request, {"request": next(item for item in saved.redemptions if item.id == request_id), "household": saved})


@app.post("/v1/redemptions/{redemption_id}/decision", response_model=APIEnvelope)
async def decide_redemption(redemption_id: str, body: RedemptionDecisionBody, request: Request):
    """Every approval needs the four-digit code, from the phone or the TV number pad."""
    actor = require_actor(request, {"parent", "device", "device_parent"})
    service().verify_code(actor.owner, body.code)
    saved = service().edit(actor, "redemptionDecision", {
        "id": redemption_id, "action": body.action, "approvedBy": actor.label,
        "approvedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }, server=True)
    request_item = next((item for item in saved.redemptions if item.id == redemption_id), None)
    return success(request, {"request": request_item, "household": saved})


@app.post("/v1/stars/adjust", response_model=APIEnvelope)
async def adjust_stars(body: StarAdjustmentBody, request: Request):
    actor = require_actor(request, {"parent", "device", "device_parent"})
    service().verify_code(actor.owner, body.code)
    saved = service().edit(actor, "starAdjustment", {"id": uuid4().hex, "memberId": body.memberId, "delta": body.delta}, server=True)
    return success(request, saved)


def import_context(snapshot) -> ImportContext:
    return ImportContext(today=household_today(snapshot).isoformat(), timezone=snapshot.family.timezone,
                         memberNames=[member.name for member in snapshot.members])


@app.post("/v1/imports/drafts", response_model=APIEnvelope)
async def create_import_draft(body: ImportRequest, request: Request):
    actor = require_parent(request)
    reader = configured_import_provider()
    drafts = await make_import_drafts(body, import_context(service().snapshot(actor.owner)),
                                      _BudgetedImportReader(reader, actor.owner) if reader else None)
    snapshot = None
    for draft in drafts:
        snapshot = service().edit(actor, "importDraft", draft.model_dump(mode="json"), server=True)
    saved = [item for item in snapshot.importDrafts if item.id in {draft.id for draft in drafts}]
    return success(request, {"draft": saved[0], "drafts": saved, "household": snapshot})


# Parent / child access ------------------------------------------------------------------------------

@app.post("/v1/access/child-session", response_model=APIEnvelope)
async def start_child_session(body: ChildAccessBody, request: Request, response: Response):
    actor = require_parent(request)
    accounts = service().accounts
    if not accounts.parent_access_code_configured(actor.owner):
        raise DomainError(409, "ACCESS_CODE_NOT_SET", "Set the four-digit parent access code before switching to child mode.")
    snapshot = service().snapshot(actor.owner)
    member = next((item for item in snapshot.members if item.id == body.memberId and item.role == "child"), None)
    if member is None:
        raise DomainError(422, "INVALID_CHILD_PROFILE", "Choose a child profile in this household.")
    child_token = accounts.create_child_session(actor.owner, member.id)
    parent_token = session_token(request)
    if IS_PRODUCTION:
        production_store.revoke_session(parent_token)
    else:
        auth_store.sign_out(parent_token)
    response.headers["Cache-Control"] = "no-store"
    return success(request, {"accessMode": "child", "memberId": member.id, "memberName": member.name,
                             "sessionToken": child_token, "expiresInHours": 8})


@app.post("/v1/access/parent-mode", response_model=APIEnvelope)
async def return_to_parent_mode(body: ParentAccessCodeBody, request: Request, response: Response):
    """Unlock temporary parent access on a phone in child mode.

    The child session stays valid so the phone can lock again (or fall back automatically) when this
    parent session ends after 15 idle minutes. The child session itself never gains parent rights.
    """
    actor = resolve_actor(request)
    if actor is None or actor.type != "child":
        raise DomainError(401, "CHILD_SESSION_REQUIRED", "Switch to a child profile before returning to parent mode.")
    accounts = service().accounts
    accounts.verify_parent_access_code(actor.owner, body.code)
    parent_token = accounts.create_parent_session(actor.owner, True)
    account = production_store.account_for_owner(actor.owner) if IS_PRODUCTION else auth_store.account_for_id(actor.owner)
    response.headers["Cache-Control"] = "no-store"
    return success(request, {"accessMode": "parent", "sessionToken": parent_token, "account": account,
                             "elevated": True, "idleMinutes": 15})


# Pickup suggestions (conflict resolution) ---------------------------------------------------------

@app.post("/v1/actions/propose", response_model=APIEnvelope)
async def propose_action(body: ActionProposalRequest, request: Request):
    actor = require_actor(request, {"parent", "device_parent"})
    if IS_PRODUCTION:
        proposal = production_store.propose(actor.owner, body.conflictId, body.eventId, body.targetMemberId)
    else:
        proposal = repository.propose(body.conflictId, body.eventId, body.targetMemberId)
    return success(request, proposal)


@app.post("/v1/actions/{action_id}/confirm", response_model=APIEnvelope)
async def confirm_action(action_id: str, request: Request):
    actor = require_actor(request, {"parent", "device_parent"})
    action, event, history = production_store.confirm(actor.owner, action_id) if IS_PRODUCTION else repository.confirm(action_id)
    return success(request, {"action": action, "event": event, "actionHistory": history})


@app.post("/v1/actions/{action_id}/cancel", response_model=APIEnvelope)
async def cancel_action(action_id: str, request: Request):
    actor = require_actor(request, {"parent", "device_parent"})
    action = production_store.cancel(actor.owner, action_id) if IS_PRODUCTION else repository.cancel(action_id)
    return success(request, action)


# Voice proposals ----------------------------------------------------------------------------------

@app.get("/v1/proposals", response_model=APIEnvelope)
async def list_proposals(request: Request):
    snapshot = household_snapshot(request)
    return success(request, [item for item in snapshot.proposals if item.status == "pending"])


@app.post("/v1/proposals/{proposal_id}/decision", response_model=APIEnvelope)
async def decide_proposal(proposal_id: str, body: ProposalDecisionBody, request: Request):
    """Confirm or reject a voice request. A TV may include the parent code to confirm parent-level changes."""
    actor = require_actor(request, {"parent", "device", "device_parent"})
    if actor.type == "device" and body.code:
        service().verify_code(actor.owner, body.code)
        _elevate_tv(request, actor)
        actor = Actor("device_parent", actor.owner, device_id=actor.device_id)
    saved = service().edit(actor, "proposalDecide", {"id": proposal_id, "action": body.action})
    proposal = next(item for item in saved.proposals if item.id == proposal_id)
    rhythm.decided(actor.owner, proposal)
    if proposal.status == "confirmed" and proposal.kind != "routine":
        # Learn from what the family just did: a one-off fix of a repeating clash becomes a routine suggestion.
        saved = learn_rhythm(actor.owner, saved, force=True)
    return success(request, {"proposal": proposal, "household": saved})


# Chore photo verification -------------------------------------------------------------------------

@app.post("/v1/chores/{chore_id}/verification", response_model=APIEnvelope)
async def submit_chore_photo(chore_id: str, body: ChoreVerificationBody, request: Request):
    """A child (or parent) submits a photo. The AI verdict is advisory and never awards stars."""
    actor = require_actor(request, {"parent", "child"})
    if actor.type == "child" and body.memberId != actor.member_id:
        raise DomainError(403, "CHORE_NOT_ASSIGNED", "Children can submit photos only for their own chores.")
    svc = service()
    snapshot = svc.snapshot(actor.owner)
    chore = next((item for item in snapshot.chores if item.id == chore_id), None)
    if chore is None or not chore.verifyWithPhoto:
        raise DomainError(422, "PHOTO_NOT_REQUIRED", "That chore does not use photo checks.")
    if chore.assignedToMemberId != body.memberId:
        raise DomainError(403, "CHORE_NOT_ASSIGNED", "That chore belongs to someone else.")
    since = datetime.now(timezone.utc) - timedelta(days=1)
    recent = [item for item in snapshot.choreVerifications if datetime.fromisoformat(item.submittedAt) > since]
    if len(recent) >= VISION_CHECKS_PER_DAY:
        raise DomainError(429, "PHOTO_CHECK_LIMIT", "Your family reached today's photo check limit. A parent can approve the chore directly.")
    variants, _, _ = process_image(decode_upload(body.contentBase64), ("thumb", "check"))
    provider = configured_provider()
    if provider.name == "bedrock" and not take_ai_call(actor.owner):
        result = VISION_FALLBACK  # Over today's AI budget: a parent decides, as with any unclear photo.
    else:
        result = await check_chore_photo(provider, chore.title, chore.photoHint or "", variants["check"])
    photo_id = f"chk-{uuid4().hex}"
    owner = svc.blob_owner(actor.owner)
    svc.accounts.put_photo(owner, photo_id, variants)
    occurrence = f"chore:{chore.id}:{chore.dueAt[:10] if chore.recurrence and chore.dueAt else 'once'}"
    record_id = uuid4().hex
    try:
        saved = svc.edit(actor, "choreVerificationCreate", {
            "id": record_id, "choreId": chore.id, "memberId": body.memberId, "occurrence": occurrence,
            "photoId": photo_id, "verdict": result.verdict, "reason": result.reason, "confidence": result.confidence,
            "provider": result.provider, "status": "pending",
            "submittedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }, server=True)
    except DomainError:
        svc.accounts.delete_photo(owner, photo_id)
        raise
    for replaced in [item for item in saved.choreVerifications if item.choreId == chore.id and item.id != record_id
                     and item.decidedBy == "replaced" and item.photoId]:
        svc.accounts.delete_photo(owner, replaced.photoId)
    record = next(item for item in saved.choreVerifications if item.id == record_id)
    return success(request, {"verification": record, "message": CHEERS[result.verdict], "household": saved})


@app.post("/v1/chores/verifications/{verification_id}/decision", response_model=APIEnvelope)
async def decide_chore_photo(verification_id: str, body: DecisionWithCodeBody, request: Request):
    actor = require_actor(request, {"parent", "device", "device_parent"})
    svc = service()
    svc.verify_code(actor.owner, body.code)
    before = next((item for item in svc.snapshot(actor.owner).choreVerifications if item.id == verification_id), None)
    saved = svc.edit(actor, "choreVerificationDecide", {"id": verification_id, "action": body.action}, server=True)
    if before and before.photoId:
        svc.accounts.delete_photo(svc.blob_owner(actor.owner), before.photoId)  # Deleted after the parent decides.
    record = next(item for item in saved.choreVerifications if item.id == verification_id)
    return success(request, {"verification": record, "household": saved})


@app.get("/v1/chores/verifications/{verification_id}/photo")
async def chore_photo(verification_id: str, request: Request, variant: str = Query(default="thumb", pattern="^(thumb|check)$")):
    actor = require_actor(request, {"parent", "device", "device_parent", "child"})
    svc = service()
    record = next((item for item in svc.snapshot(actor.owner).choreVerifications if item.id == verification_id), None)
    if record is None or not record.photoId or (actor.type == "child" and record.memberId != actor.member_id):
        raise DomainError(404, "PHOTO_NOT_FOUND", "That photo is no longer available.")
    content = svc.accounts.get_photo(svc.blob_owner(actor.owner), record.photoId, variant)
    if content is None:
        raise DomainError(404, "PHOTO_NOT_FOUND", "That photo is no longer available.")
    return Response(content, media_type="image/jpeg", headers={"Cache-Control": "private, no-store"})


# Family photos ------------------------------------------------------------------------------------

@app.post("/v1/photos", response_model=APIEnvelope)
async def upload_photo(body: PhotoUploadBody, request: Request):
    actor = require_parent(request)
    svc = service()
    variants, width, height = process_image(decode_upload(body.contentBase64))
    owner = svc.blob_owner(actor.owner)
    size = sum(len(item) for item in variants.values())
    if svc.accounts.photo_usage(owner) + size > HOUSEHOLD_PHOTO_QUOTA_BYTES:
        raise DomainError(413, "PHOTO_STORAGE_FULL", "Your family photo storage is full. Remove some photos first.")
    photo_id = uuid4().hex
    svc.accounts.put_photo(owner, photo_id, variants)
    try:
        saved = svc.edit(actor, "photoCreate", {
            "id": photo_id, "caption": body.caption.strip(), "width": width, "height": height, "bytes": size,
            "uploadedBy": actor.label, "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }, server=True)
    except DomainError:
        svc.accounts.delete_photo(owner, photo_id)
        raise
    return success(request, {"photo": next(item for item in saved.photos if item.id == photo_id), "household": saved})


@app.get("/v1/photos/{photo_id}/{variant}")
async def get_photo(photo_id: str, variant: str, request: Request):
    if variant not in ("tv", "thumb"):
        raise DomainError(404, "PHOTO_NOT_FOUND", "That photo is no longer available.")
    actor = require_actor(request)
    svc = service()
    if not any(item.id == photo_id for item in svc.snapshot(actor.owner).photos):
        raise DomainError(404, "PHOTO_NOT_FOUND", "That photo is no longer available.")
    content = svc.accounts.get_photo(svc.blob_owner(actor.owner), photo_id, variant)
    if content is None:
        raise DomainError(404, "PHOTO_NOT_FOUND", "That photo is no longer available.")
    return Response(content, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})


@app.post("/v1/photos/{photo_id}/update", response_model=APIEnvelope)
async def update_photo(photo_id: str, request: Request):
    actor = require_parent(request)
    body = await request.json()
    if not isinstance(body, dict):
        raise DomainError(422, "VALIDATION_ERROR", "The request could not be validated.")
    return success(request, service().edit(actor, "photoMeta", {**body, "id": photo_id}))


@app.post("/v1/photos/{photo_id}/delete", response_model=APIEnvelope)
async def delete_photo(photo_id: str, request: Request):
    actor = require_parent(request)
    svc = service()
    saved = svc.edit(actor, "photoDelete", {"id": photo_id})
    svc.accounts.delete_photo(svc.blob_owner(actor.owner), photo_id)
    return success(request, saved)


# Connected calendars (read-only Google, iCloud, Outlook, or .ics links) -----------------------------

MANUAL_SYNC_SECONDS = 60
_manual_syncs: dict[tuple[str, str], float] = {}


def sync_calendar(svc: HouseholdService, owner: str | None, calendar_id: str):
    """Re-read one connected calendar and mirror its events. A bad feed is recorded, not raised."""
    link_owner = svc.blob_owner(owner)
    snapshot = svc.snapshot(owner)
    meta = next((item for item in snapshot.calendars if item.id == calendar_id), None)
    if meta is None:  # Disconnected: drop any link left behind.
        svc.accounts.delete_calendar_link(link_owner, calendar_id)
        raise DomainError(404, "CALENDAR_NOT_FOUND", "That calendar was disconnected.")
    link = svc.accounts.calendar_link(link_owner, calendar_id)
    events, failure = None, None
    if link is None:
        failure = DomainError(422, "CALENDAR_RECONNECT", "Reconnect this calendar by pasting its link again.")
    else:
        try:
            events = calendars.events_from_ics(calendars.fetch_ics(link), meta, snapshot)
        except DomainError as error:
            failure = error
    return svc.transform(owner, lambda current: calendars.apply_sync(current, calendar_id, events, failure), bump=False)


def sync_all_calendars() -> int:
    """One background pass over every connected calendar. Returns how many were read."""
    svc = service()
    count = 0
    for owner, calendar_id in svc.accounts.calendar_links():
        try:
            sync_calendar(svc, owner, calendar_id)
            count += 1
        except DomainError as error:
            logger.info("Calendar sync skipped: %s", error.code)
        except Exception:  # Keep the loop alive; never log the private link.
            logger.exception("Calendar sync failed for one calendar")
    return count


async def calendar_sync_loop() -> None:
    while True:
        await asyncio.sleep(CALENDAR_SYNC_MINUTES * 60)
        try:
            await asyncio.to_thread(sync_all_calendars)
        except Exception:
            logger.exception("Calendar sync pass failed")


def _calendar_payload(saved, calendar_id: str) -> dict[str, object]:
    return {"calendar": next((item for item in saved.calendars if item.id == calendar_id), None), "household": saved}


@app.post("/v1/calendars", response_model=APIEnvelope)
def connect_calendar(body: CalendarAddBody, request: Request):
    """Connect a calendar by its private iCal link. The link is checked before anything is saved."""
    actor = require_parent(request)
    svc = service()
    link_owner = svc.blob_owner(actor.owner)
    url = calendars.normalize_url(body.url)
    snapshot = svc.snapshot(actor.owner)
    if len(snapshot.calendars) >= calendars.MAX_CALENDARS:
        raise DomainError(422, "CALENDAR_LIMIT", f"You can connect up to {calendars.MAX_CALENDARS} calendars.")
    if any(svc.accounts.calendar_link(link_owner, item.id) == url for item in snapshot.calendars):
        raise DomainError(409, "CALENDAR_ALREADY_CONNECTED", "That calendar is already connected.")
    provider = calendars.guess_provider(url)
    calendar_id = uuid4().hex[:16]
    meta = CalendarSubscriptionMeta(id=calendar_id, label=body.label.strip()[:60], provider=provider,
                                    host=calendars.display_host(url), memberIds=body.memberIds)
    events = calendars.events_from_ics(calendars.fetch_ics(url), meta, snapshot)
    svc.accounts.put_calendar_link(link_owner, calendar_id, url)
    try:
        svc.edit(actor, "calendarAdd", {"id": calendar_id, "label": meta.label, "provider": provider,
                                         "host": meta.host, "memberIds": body.memberIds}, server=True)
    except DomainError:
        svc.accounts.delete_calendar_link(link_owner, calendar_id)
        raise
    saved = svc.transform(actor.owner, lambda current: calendars.apply_sync(current, calendar_id, events), bump=False)
    return success(request, _calendar_payload(saved, calendar_id))


@app.post("/v1/calendars/{calendar_id}/sync", response_model=APIEnvelope)
def sync_calendar_now(calendar_id: str, request: Request):
    actor = require_parent(request)
    key = (str(actor.owner), calendar_id)
    now = time.monotonic()
    if now - _manual_syncs.get(key, -MANUAL_SYNC_SECONDS) < MANUAL_SYNC_SECONDS:
        raise DomainError(429, "CALENDAR_SYNC_TOO_SOON", "This calendar just synced. Try again in a minute.")
    _manual_syncs[key] = now
    saved = sync_calendar(service(), actor.owner, calendar_id)
    return success(request, _calendar_payload(saved, calendar_id))


@app.post("/v1/calendars/{calendar_id}/delete", response_model=APIEnvelope)
def disconnect_calendar(calendar_id: str, request: Request):
    actor = require_parent(request)
    svc = service()
    saved = svc.edit(actor, "calendarRemove", {"id": calendar_id}, server=True)
    svc.accounts.delete_calendar_link(svc.blob_owner(actor.owner), calendar_id)
    return success(request, saved)


# Movement breaks, family night ----------------------------------------------------------------

@app.get("/v1/move/routines", response_model=APIEnvelope)
async def move_routines(request: Request):
    return success(request, {"safetyNote": SAFETY_NOTE, "routines": [routine_summary(item) for item in MOVE_ROUTINES.values()]})


@app.post("/v1/move/complete", response_model=APIEnvelope)
async def complete_move(body: MoveCompleteBody, request: Request):
    actor = require_actor(request, {"parent", "device", "device_parent"})
    session_key = body.eventId or f"{body.date}:{body.routineId}"
    saved = service().edit(actor, "moveComplete", {"id": session_key[:80], "routineId": body.routineId,
                                                   "memberIds": body.memberIds, "eventId": body.eventId, "date": body.date})
    return success(request, saved)


@app.get("/v1/family-night", response_model=APIEnvelope)
async def family_night(request: Request):
    snapshot = household_snapshot(request)
    return success(request, {"settings": snapshot.familyNight, "picker": current_picker(snapshot),
                             "rule": FAMILY_NIGHT_RULE, "polls": snapshot.familyNightPolls[-8:]})


# Voice connections (MCP) ------------------------------------------------------------------------

@app.get("/v1/voice/connections", response_model=APIEnvelope)
async def voice_connections(request: Request):
    actor = require_parent(request)
    return success(request, {"connections": service().accounts.voice_tokens(actor.owner),
                             "mcpUrl": f"{PUBLIC_URL}/mcp"})


@app.post("/v1/voice/connections", response_model=APIEnvelope)
async def create_voice_connection(body: VoiceTokenBody, request: Request, response: Response):
    actor = require_parent(request)
    if body.memberId:
        member = next((item for item in service().snapshot(actor.owner).members if item.id == body.memberId), None)
        if member is None or member.role != "child":
            raise DomainError(422, "INVALID_CHILD_PROFILE", "Choose a child profile for a child voice connection.")
    token, record = service().accounts.create_voice_token(actor.owner, body.label, body.memberId)
    response.headers["Cache-Control"] = "no-store"
    return success(request, {"connection": record, "token": token, "mcpUrl": f"{PUBLIC_URL}/mcp"})


@app.post("/v1/voice/connections/{connection_id}/revoke", response_model=APIEnvelope)
async def revoke_voice_connection(connection_id: str, request: Request):
    actor = require_parent(request)
    service().accounts.revoke_voice_token(actor.owner, connection_id)
    return success(request, {"revoked": True})


@app.post("/v1/voice/simulate", response_model=APIEnvelope)
async def simulate_voice(body: VoiceUtteranceBody, request: Request):
    """Simulated Alexa+: a voice connection token, or a signed-in parent, drives the MCP tools."""
    from .voice import VoiceIdentity

    identity = voice_gateway.identity(session_token(request))
    if identity is None:
        actor = require_parent(request)
        identity = VoiceIdentity(owner=actor.owner, member_id=None, label="simulated", connection_id=f"sim:{actor.owner[:12]}")
    result = await voice_server.simulate(identity, body.utterance, may_use_ai=lambda: take_ai_call(identity.owner))
    result.pop("unresolved", None)
    return success(request, {**result, "simulated": True, "label": "Simulated Alexa+ (not a live Alexa device)"})


@app.get("/.well-known/oauth-protected-resource/mcp")
@app.get("/.well-known/oauth-protected-resource")
async def protected_resource_metadata():
    return JSONResponse(voice_server.protected_resource_metadata())


@app.post("/v1/demo/reset", response_model=APIEnvelope)
async def reset_demo(request: Request):
    if IS_PRODUCTION:
        raise DomainError(404, "NOT_FOUND", "That resource could not be found.")
    return success(request, repository.reset())


app.router.routes.append(Route("/mcp", endpoint=voice_server, methods=["GET", "POST", "DELETE"]))

# Web app (the phone companion built for browsers) ----------------------------------------------------
# Built from apps/companion with `yarn build:web-app` into app/webapp and served here, on the API's own
# origin, so it needs no CORS setup and its sessions never leave this origin.
WEB_APP_DIR = Path(__file__).with_name("webapp")
_cognito_region = cognito_issuer.split("cognito-idp.", 1)[1].split(".", 1)[0] if "cognito-idp." in cognito_issuer else "us-west-2"
WEB_APP_CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    # react-native-web adds its styles at runtime.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    # Passwords go straight to Cognito; everything else goes to this API.
    f"connect-src 'self' https://cognito-idp.{_cognito_region}.amazonaws.com",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])


@app.middleware("http")
async def web_app_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path == "/app" or path.startswith("/app/"):
        response.headers["Content-Security-Policy"] = WEB_APP_CSP
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(self), geolocation=(self), microphone=()"
        if IS_PRODUCTION:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        # Bundles have content hashes in their names; the page itself must always be fresh.
        immutable = "/_expo/static/" in path or "/assets/" in path
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable" if immutable else "no-cache"
    return response


if WEB_APP_DIR.is_dir():
    app.mount("/app", StaticFiles(directory=WEB_APP_DIR, html=True), name="web-app")

    @app.get("/", include_in_schema=False)
    async def web_app_home():
        return RedirectResponse("/app/", status_code=307)


if not IS_PRODUCTION:
    app.mount(
        "/companion",
        StaticFiles(directory=Path(__file__).with_name("companion"), html=True),
        name="local-companion",
    )
