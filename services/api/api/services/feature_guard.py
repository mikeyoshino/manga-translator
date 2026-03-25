"""Feature permission guard — FastAPI dependency that gates endpoints by subscription tier.

Usage:
    @router.post("/inpaint", dependencies=[Depends(require_feature(Feature.MAGIC_REMOVER))])
"""

import logging
import threading
import time
from enum import Enum

from fastapi import Depends, HTTPException

from api.services.auth import AuthUser, get_current_user
from api.services.subscription import get_all_tiers, get_tier_permissions

logger = logging.getLogger(__name__)


class Feature(str, Enum):
    """Editor features gated by subscription tier."""
    MAGIC_REMOVER = "editor.magic_remover"
    CLONE_STAMP = "editor.clone_stamp"
    MANUAL_TRANSLATE = "editor.manual_translate"
    TEXT_BORDER = "editor.text_border"
    BULK_EXPORT_ZIP = "editor.bulk_export_zip"
    UPSCALING = "editor.upscaling"
    WATERMARK = "editor.watermark"


# ---------------------------------------------------------------------------
# User tier cache (in-process, 30s TTL — same pattern as auth._refresh_cache)
# ---------------------------------------------------------------------------

_user_tier_cache: dict[str, tuple[str, float]] = {}
_user_tier_lock = threading.Lock()
_USER_TIER_CACHE_TTL = 30


def _get_user_tier_id(user_id: str) -> str:
    """Get a user's tier_id with 30s in-process cache."""
    now = time.monotonic()
    with _user_tier_lock:
        if user_id in _user_tier_cache:
            tier_id, ts = _user_tier_cache[user_id]
            if now - ts < _USER_TIER_CACHE_TTL:
                return tier_id

    import manga_shared.supabase_client as sb
    profile = sb.get_user_profile(user_id)
    tier_id = profile.get("tier_id", "free")

    with _user_tier_lock:
        _user_tier_cache[user_id] = (tier_id, time.monotonic())

    return tier_id


def invalidate_user_tier_cache(user_id: str) -> None:
    """Remove a user's cached tier_id so next lookup is fresh."""
    with _user_tier_lock:
        _user_tier_cache.pop(user_id, None)
    logger.debug("Invalidated tier cache for user %s", user_id)


# ---------------------------------------------------------------------------
# Tier ordering for "required_tier" in error messages
# ---------------------------------------------------------------------------

_TIER_ORDER = ["free", "starter", "pro", "premium"]


def get_minimum_tier_for_feature(feature: Feature) -> str | None:
    """Return the cheapest tier that grants the given feature."""
    all_tiers = get_all_tiers()
    for tier_id in _TIER_ORDER:
        tier = all_tiers.get(tier_id)
        if not tier:
            continue
        permissions = get_tier_permissions(tier_id)
        if permissions.get(feature.value, False):
            return tier_id
    return None


# ---------------------------------------------------------------------------
# FastAPI dependency factory
# ---------------------------------------------------------------------------

def require_feature(feature: Feature):
    """Return a FastAPI dependency that checks the user has *feature* enabled."""

    def _dependency(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.is_admin:
            return user

        tier_id = _get_user_tier_id(user.id)
        permissions = get_tier_permissions(tier_id)

        if not permissions.get(feature.value, False):
            required_tier = get_minimum_tier_for_feature(feature)
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "feature_not_available",
                    "feature": feature.value,
                    "required_tier": required_tier,
                },
            )
        return user

    return _dependency
