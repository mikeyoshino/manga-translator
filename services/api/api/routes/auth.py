"""Auth session endpoints: /auth/*"""

from fastapi import APIRouter, Depends, Request

from api.services.auth import (
    AuthUser, get_current_user, create_session, signout_session, get_me,
)

router = APIRouter(prefix="/auth", tags=["auth"])

router.add_api_route("/session", create_session, methods=["POST"])
router.add_api_route("/signout", signout_session, methods=["POST"])
router.add_api_route("/me", get_me, methods=["GET"])
