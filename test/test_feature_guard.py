"""Tests for subscription feature permission guard."""

import pytest
from unittest.mock import patch, MagicMock

from api.services.feature_guard import (
    Feature,
    require_feature,
    get_minimum_tier_for_feature,
    invalidate_user_tier_cache,
    _user_tier_cache,
    _user_tier_lock,
)
from api.services.auth import AuthUser


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

def _make_admin() -> AuthUser:
    return AuthUser(id="admin-1", email="admin@test.com", is_admin=True)


def _make_user(user_id: str = "user-1") -> AuthUser:
    return AuthUser(id=user_id, email="user@test.com", is_admin=False)


# Tier data mimicking DB rows
MOCK_TIERS = {
    "free": {
        "id": "free",
        "name": "Free",
        "features": {
            "editor.magic_remover": False,
            "editor.clone_stamp": False,
            "editor.manual_translate": False,
            "editor.text_border": False,
            "editor.bulk_export_zip": False,
            "editor.upscaling": False,
        },
        "batch_limit": 1,
        "max_projects": 1,
        "project_expiry_days": 7,
        "max_rollover": 0,
        "monthly_tokens": 0,
    },
    "starter": {
        "id": "starter",
        "name": "Starter",
        "features": {
            "editor.magic_remover": False,
            "editor.clone_stamp": False,
            "editor.manual_translate": False,
            "editor.text_border": False,
            "editor.bulk_export_zip": False,
            "editor.upscaling": False,
        },
        "batch_limit": 5,
        "max_projects": 3,
        "project_expiry_days": 14,
        "max_rollover": 0,
        "monthly_tokens": 500,
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "features": {
            "editor.magic_remover": True,
            "editor.clone_stamp": True,
            "editor.manual_translate": True,
            "editor.text_border": True,
            "editor.bulk_export_zip": True,
            "editor.upscaling": False,
        },
        "batch_limit": 20,
        "max_projects": 10,
        "project_expiry_days": 30,
        "max_rollover": 100,
        "monthly_tokens": 2000,
    },
    "premium": {
        "id": "premium",
        "name": "Premium",
        "features": {
            "editor.magic_remover": True,
            "editor.clone_stamp": True,
            "editor.manual_translate": True,
            "editor.text_border": True,
            "editor.bulk_export_zip": True,
            "editor.upscaling": True,
        },
        "batch_limit": 50,
        "max_projects": 999,
        "project_expiry_days": 60,
        "max_rollover": 500,
        "monthly_tokens": 5000,
    },
}


@pytest.fixture(autouse=True)
def _clear_tier_cache():
    """Ensure the in-process tier cache is clean between tests."""
    with _user_tier_lock:
        _user_tier_cache.clear()
    yield
    with _user_tier_lock:
        _user_tier_cache.clear()


@pytest.fixture(autouse=True)
def _mock_tiers():
    """Patch tier lookups to use our mock data (avoid hitting Redis/Supabase)."""
    with patch("api.services.feature_guard.get_all_tiers", return_value=MOCK_TIERS), \
         patch("api.services.feature_guard.get_tier_permissions") as mock_perms:

        def _perms(tier_id: str):
            from api.services.subscription import DEFAULT_FREE_PERMISSIONS
            tier = MOCK_TIERS.get(tier_id)
            if not tier:
                return DEFAULT_FREE_PERMISSIONS.copy()
            permissions = DEFAULT_FREE_PERMISSIONS.copy()
            permissions.update(tier.get("features", {}))
            permissions["batch_limit"] = tier.get("batch_limit", 1)
            permissions["max_projects"] = tier.get("max_projects", 1)
            permissions["project_expiry_days"] = tier.get("project_expiry_days", 7)
            permissions["max_rollover"] = tier.get("max_rollover", 0)
            permissions["monthly_tokens"] = tier.get("monthly_tokens", 0)
            return permissions

        mock_perms.side_effect = _perms
        yield


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_admin_bypasses_feature_check():
    """Admins pass any feature check regardless of tier."""
    admin = _make_admin()
    dep = require_feature(Feature.MAGIC_REMOVER)

    # The dependency should return the user without raising
    result = dep(user=admin)
    assert result.is_admin is True


@patch("api.services.feature_guard._get_user_tier_id", return_value="free")
def test_free_user_denied_pro_feature(mock_tier):
    """Free-tier user gets HTTP 403 for a Pro-only feature."""
    from fastapi import HTTPException

    user = _make_user()
    dep = require_feature(Feature.MAGIC_REMOVER)

    with pytest.raises(HTTPException) as exc_info:
        dep(user=user)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"] == "feature_not_available"
    assert exc_info.value.detail["feature"] == "editor.magic_remover"


@patch("api.services.feature_guard._get_user_tier_id", return_value="pro")
def test_pro_user_allowed_feature(mock_tier):
    """Pro-tier user passes the magic_remover feature check."""
    user = _make_user()
    dep = require_feature(Feature.MAGIC_REMOVER)

    result = dep(user=user)
    assert result.id == "user-1"


@patch("api.services.feature_guard._get_user_tier_id", return_value="free")
def test_403_includes_required_tier(mock_tier):
    """The 403 response includes the cheapest tier that has the feature."""
    from fastapi import HTTPException

    user = _make_user()
    dep = require_feature(Feature.MAGIC_REMOVER)

    with pytest.raises(HTTPException) as exc_info:
        dep(user=user)

    assert exc_info.value.detail["required_tier"] == "pro"


def test_minimum_tier_for_feature():
    """get_minimum_tier_for_feature returns the cheapest tier with the feature."""
    assert get_minimum_tier_for_feature(Feature.MAGIC_REMOVER) == "pro"
    assert get_minimum_tier_for_feature(Feature.UPSCALING) == "premium"


def test_cache_invalidation():
    """After invalidate_user_tier_cache(), a fresh profile lookup happens."""
    user_id = "user-cache-test"

    # Populate cache with "free"
    with _user_tier_lock:
        import time
        _user_tier_cache[user_id] = ("free", time.monotonic())

    # Invalidate
    invalidate_user_tier_cache(user_id)

    # Cache should be empty for this user
    with _user_tier_lock:
        assert user_id not in _user_tier_cache
