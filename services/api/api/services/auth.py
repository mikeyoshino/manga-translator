"""FastAPI dependency: verify Supabase JWT via Supabase auth.get_user().

Supports both Bearer token (for external API clients) and httpOnly cookies
(for the web frontend).
"""

import logging
import os
import time
import threading

from fastapi import Depends, HTTPException, Request, Response
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from supabase import create_client

logger = logging.getLogger(__name__)

_refresh_cache: dict[str, tuple] = {}
_refresh_lock = threading.Lock()
_REFRESH_CACHE_TTL = 30

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}

COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() in ("true", "1", "yes")
COOKIE_SAMESITE = "lax"
COOKIE_PATH = "/"
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", "")
ACCESS_TOKEN_MAX_AGE = 3600
REFRESH_TOKEN_MAX_AGE = 604800

_auth_client = None


def _get_auth_client():
    global _auth_client
    if _auth_client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise HTTPException(status_code=500, detail="Supabase not configured")
        _auth_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _auth_client


class AuthUser(BaseModel):
    id: str
    email: str | None = None
    is_admin: bool = False


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    domain_kwargs = {"domain": COOKIE_DOMAIN} if COOKIE_DOMAIN else {}
    response.set_cookie(
        key="sb-access-token", value=access_token, httponly=True,
        secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, path=COOKIE_PATH,
        max_age=ACCESS_TOKEN_MAX_AGE, **domain_kwargs,
    )
    response.set_cookie(
        key="sb-refresh-token", value=refresh_token, httponly=True,
        secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, path=COOKIE_PATH,
        max_age=REFRESH_TOKEN_MAX_AGE, **domain_kwargs,
    )


def _clear_auth_cookies(response: Response):
    domain_kwargs = {"domain": COOKIE_DOMAIN} if COOKIE_DOMAIN else {}
    response.delete_cookie(key="sb-access-token", path=COOKIE_PATH, **domain_kwargs)
    response.delete_cookie(key="sb-refresh-token", path=COOKIE_PATH, **domain_kwargs)


def _verify_token(token: str):
    client = _get_auth_client()
    user_response = client.auth.get_user(token)
    user = user_response.user
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


def _refresh_with_cache(refresh_token: str):
    now = time.monotonic()
    with _refresh_lock:
        stale = [k for k, (_, ts) in _refresh_cache.items() if now - ts > _REFRESH_CACHE_TTL]
        for k in stale:
            del _refresh_cache[k]
        if refresh_token in _refresh_cache:
            cached_session, _ = _refresh_cache[refresh_token]
            return cached_session

    client = _get_auth_client()
    refreshed = client.auth.refresh_session(refresh_token)
    if not refreshed or not refreshed.session:
        raise HTTPException(status_code=401, detail="Token refresh failed")

    new_session = refreshed.session
    with _refresh_lock:
        _refresh_cache[refresh_token] = (new_session, time.monotonic())
    return new_session


async def get_current_user(request: Request) -> AuthUser:
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
    if not token:
        token = request.cookies.get("sb-access-token")
    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    try:
        user = _verify_token(token)
    except HTTPException:
        refresh_token = request.cookies.get("sb-refresh-token")
        if not refresh_token or auth_header:
            raise
        try:
            new_session = _refresh_with_cache(refresh_token)
            user = new_session.user
            if not user:
                raise HTTPException(status_code=401, detail="Token refresh failed")
            request.state.refreshed_access_token = new_session.access_token
            request.state.refreshed_refresh_token = new_session.refresh_token
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=401, detail=f"Token refresh failed: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {exc}")

    is_admin = (user.email or "").lower() in ADMIN_EMAILS
    return AuthUser(id=user.id, email=user.email, is_admin=is_admin)


class SessionRequest(BaseModel):
    access_token: str
    refresh_token: str


async def create_session(body: SessionRequest, response: Response):
    try:
        user = _verify_token(body.access_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid access token")
    _set_auth_cookies(response, body.access_token, body.refresh_token)
    is_admin = (user.email or "").lower() in ADMIN_EMAILS
    return {"id": user.id, "email": user.email, "is_admin": is_admin}


async def signout_session(response: Response):
    _clear_auth_cookies(response)
    return {"ok": True}


async def get_me(request: Request, user: AuthUser = Depends(get_current_user)):
    import manga_shared.supabase_client as sb
    profile = sb.get_user_profile(user.id)
    return {
        "id": user.id,
        "email": user.email,
        "is_admin": user.is_admin,
        "token_balance": profile.get("token_balance", 0),
        "display_name": profile.get("display_name", ""),
    }


class AuthCookieMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        if hasattr(request.state, "refreshed_access_token"):
            _set_auth_cookies(
                response,
                request.state.refreshed_access_token,
                request.state.refreshed_refresh_token,
            )
        return response
