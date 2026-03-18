"""FastAPI dependency: verify Supabase JWT via Supabase auth.get_user()."""

import os

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel
from supabase import create_client


SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}

_auth_client = None


class AuthUser(BaseModel):
    id: str          # UUID from Supabase auth.users
    email: str | None = None
    is_admin: bool = False


async def get_current_user(request: Request) -> AuthUser:
    """Extract the Bearer token and verify it against Supabase.

    Usage:
        @app.get("/protected")
        async def protected(user: AuthUser = Depends(get_current_user)):
            ...
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.split(" ", 1)[1]

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    try:
        global _auth_client
        if _auth_client is None:
            _auth_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        user_response = _auth_client.auth.get_user(token)
        user = user_response.user
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {exc}")

    is_admin = (user.email or "").lower() in ADMIN_EMAILS

    return AuthUser(id=user.id, email=user.email, is_admin=is_admin)
