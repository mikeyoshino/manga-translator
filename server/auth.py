"""FastAPI dependency: verify Supabase JWT via Supabase auth.get_user().

Supports both Bearer token (for external API clients) and httpOnly cookies
(for the web frontend).
"""

import logging
import os

from fastapi import Depends, HTTPException, Request, Response
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from supabase import create_client

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}

COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() in ("true", "1", "yes")
COOKIE_SAMESITE = "lax"
COOKIE_PATH = "/"
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", "")  # e.g. ".wunplae.com" for cross-subdomain
ACCESS_TOKEN_MAX_AGE = 3600       # 1 hour
REFRESH_TOKEN_MAX_AGE = 604800    # 7 days

_auth_client = None


def _get_auth_client():
    global _auth_client
    if _auth_client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise HTTPException(status_code=500, detail="Supabase not configured")
        _auth_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _auth_client


class AuthUser(BaseModel):
    id: str          # UUID from Supabase auth.users
    email: str | None = None
    is_admin: bool = False


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    """Set httpOnly auth cookies on a response."""
    domain_kwargs = {"domain": COOKIE_DOMAIN} if COOKIE_DOMAIN else {}
    response.set_cookie(
        key="sb-access-token",
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path=COOKIE_PATH,
        max_age=ACCESS_TOKEN_MAX_AGE,
        **domain_kwargs,
    )
    response.set_cookie(
        key="sb-refresh-token",
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path=COOKIE_PATH,
        max_age=REFRESH_TOKEN_MAX_AGE,
        **domain_kwargs,
    )


def _clear_auth_cookies(response: Response):
    """Clear auth cookies from a response."""
    domain_kwargs = {"domain": COOKIE_DOMAIN} if COOKIE_DOMAIN else {}
    response.delete_cookie(key="sb-access-token", path=COOKIE_PATH, **domain_kwargs)
    response.delete_cookie(key="sb-refresh-token", path=COOKIE_PATH, **domain_kwargs)


def _verify_token(token: str):
    """Verify a token with Supabase and return the user object."""
    client = _get_auth_client()
    user_response = client.auth.get_user(token)
    user = user_response.user
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


async def get_current_user(request: Request) -> AuthUser:
    """Extract and verify auth token from Bearer header or httpOnly cookie.

    Priority:
    1. Authorization: Bearer header (for external API clients)
    2. sb-access-token cookie (for web frontend)
       - If cookie token is expired, try refreshing via sb-refresh-token
    """
    token = None

    # 1. Try Bearer header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]

    # 2. Fallback to cookie
    if not token:
        token = request.cookies.get("sb-access-token")

    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    try:
        user = _verify_token(token)
    except HTTPException:
        # If cookie-based auth failed, try refreshing
        refresh_token = request.cookies.get("sb-refresh-token")
        if not refresh_token or auth_header:
            raise
        try:
            client = _get_auth_client()
            refreshed = client.auth.refresh_session(refresh_token)
            if not refreshed or not refreshed.session:
                raise HTTPException(status_code=401, detail="Token refresh failed")
            new_session = refreshed.session
            user = new_session.user
            if not user:
                raise HTTPException(status_code=401, detail="Token refresh failed")
            # Store refreshed tokens on request.state for middleware to set on response
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


# ---------------------------------------------------------------------------
# Cookie auth endpoints
# ---------------------------------------------------------------------------

class SessionRequest(BaseModel):
    access_token: str
    refresh_token: str


async def create_session(body: SessionRequest, response: Response):
    """Receive tokens from frontend after login, set httpOnly cookies."""
    try:
        user = _verify_token(body.access_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid access token")
    _set_auth_cookies(response, body.access_token, body.refresh_token)
    is_admin = (user.email or "").lower() in ADMIN_EMAILS
    return {"id": user.id, "email": user.email, "is_admin": is_admin}


async def signout_session(response: Response):
    """Clear auth cookies."""
    _clear_auth_cookies(response)
    return {"ok": True}


async def get_me(request: Request, user: AuthUser = Depends(get_current_user)):
    """Return current user info from cookie. Used for page-reload bootstrap."""
    import server.supabase_client as sb
    profile = sb.get_user_profile(user.id)
    return {
        "id": user.id,
        "email": user.email,
        "is_admin": user.is_admin,
        "token_balance": profile.get("token_balance", 0),
        "display_name": profile.get("display_name", ""),
    }


# ---------------------------------------------------------------------------
# Middleware: set refreshed cookies on response
# ---------------------------------------------------------------------------

class AuthCookieMiddleware(BaseHTTPMiddleware):
    """After response, check if tokens were refreshed and set updated cookies."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        # If get_current_user refreshed the tokens, set them on the response
        if hasattr(request.state, "refreshed_access_token"):
            _set_auth_cookies(
                response,
                request.state.refreshed_access_token,
                request.state.refreshed_refresh_token,
            )
        return response
