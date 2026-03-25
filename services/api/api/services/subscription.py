"""Subscription management service — CRUD, tier checks, renewals.

Tier definitions are cached in Redis (shared across API instances) with a 1-hour
TTL.  Falls back to Supabase if Redis is unavailable.
"""

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import redis as sync_redis

import manga_shared.supabase_client as sb

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Redis tier cache
# ---------------------------------------------------------------------------

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
TIER_CACHE_KEY = "cache:subscription_tiers"
TIER_CACHE_TTL = 3600  # 1 hour

# Tier ranking — used to prevent downgrades (user must cancel instead)
TIER_RANK = {"free": 0, "starter": 1, "pro": 2, "premium": 3}

_sync_redis: sync_redis.Redis | None = None


def _get_redis() -> sync_redis.Redis:
    """Lazy-init a **sync** Redis client for the tier cache."""
    global _sync_redis
    if _sync_redis is None:
        _sync_redis = sync_redis.Redis.from_url(REDIS_URL, decode_responses=True)
    return _sync_redis


# Default tier permissions (fallback if both Redis + DB are unavailable)
DEFAULT_FREE_PERMISSIONS: dict[str, Any] = {
    "editor.magic_remover": False,
    "editor.clone_stamp": False,
    "editor.manual_translate": False,
    "editor.text_border": False,
    "editor.bulk_export_zip": False,
    "editor.upscaling": False,
    "editor.watermark": False,
}


def _get_client():
    return sb._get_client()


# ---------------------------------------------------------------------------
# Tier cache — Redis-backed with Supabase fallback
# ---------------------------------------------------------------------------

def get_all_tiers() -> dict[str, dict]:
    """Fetch all subscription tiers.  Redis cache → Supabase fallback."""
    # 1. Try Redis
    try:
        r = _get_redis()
        cached = r.get(TIER_CACHE_KEY)
        if cached:
            return json.loads(cached)
    except Exception as e:
        logger.debug("Redis tier cache miss/error: %s", e)

    # 2. Fallback: load from Supabase
    client = _get_client()
    result = client.table("subscription_tiers").select("*").execute()
    tiers = {row["id"]: row for row in result.data}

    # 3. Populate Redis
    try:
        r = _get_redis()
        r.set(TIER_CACHE_KEY, json.dumps(tiers, default=str), ex=TIER_CACHE_TTL)
    except Exception as e:
        logger.warning("Failed to write tier cache to Redis: %s", e)

    return tiers


def invalidate_tiers_cache():
    """Delete the Redis tier cache (call after admin updates tiers)."""
    try:
        r = _get_redis()
        r.delete(TIER_CACHE_KEY)
        logger.info("Tier cache invalidated in Redis")
    except Exception as e:
        logger.warning("Failed to invalidate tier cache: %s", e)


def get_tier(tier_id: str) -> dict | None:
    """Get a single tier by ID."""
    tiers = get_all_tiers()
    return tiers.get(tier_id)


def get_tier_permissions(tier_id: str) -> dict[str, Any]:
    """Get resolved permissions for a tier."""
    tier = get_tier(tier_id)
    if not tier:
        return DEFAULT_FREE_PERMISSIONS.copy()
    features = tier.get("features", {})
    # features may be a JSON string if it went through Redis serialisation
    if isinstance(features, str):
        features = json.loads(features)
    permissions = DEFAULT_FREE_PERMISSIONS.copy()
    permissions.update(features)
    # Add numeric limits as permissions too
    permissions["batch_limit"] = tier.get("batch_limit", 1)
    permissions["max_projects"] = tier.get("max_projects", 1)
    permissions["project_expiry_days"] = tier.get("project_expiry_days", 7)
    permissions["max_rollover"] = tier.get("max_rollover", 0)
    permissions["monthly_tokens"] = tier.get("monthly_tokens", 0)
    return permissions


# ---------------------------------------------------------------------------
# User subscription queries
# ---------------------------------------------------------------------------

def get_user_subscription(user_id: str) -> dict | None:
    """Get a user's active subscription with tier details."""
    client = _get_client()
    result = (
        client.table("subscriptions")
        .select("*, subscription_tiers(*)")
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    return result.data if result.data else None


def get_user_subscription_summary(user_id: str) -> dict:
    """Get subscription summary for /auth/me response."""
    sub = get_user_subscription(user_id)
    if not sub:
        # No subscription row — treat as free
        return {
            "tier_id": "free",
            "tier_name": "Free",
            "billing_cycle": "monthly",
            "status": "active",
            "current_period_end": None,
            "cancel_at_period_end": False,
            "permissions": get_tier_permissions("free"),
        }

    tier_data = sub.get("subscription_tiers", {})
    tier_id = sub.get("tier_id", "free")

    return {
        "tier_id": tier_id,
        "tier_name": tier_data.get("name", tier_id.capitalize()),
        "billing_cycle": sub.get("billing_cycle", "monthly"),
        "status": sub.get("status", "active"),
        "current_period_start": sub.get("current_period_start"),
        "current_period_end": sub.get("current_period_end"),
        "cancel_at_period_end": sub.get("cancel_at_period_end", False),
        "rollover_tokens": sub.get("rollover_tokens", 0),
        "permissions": get_tier_permissions(tier_id),
    }


# ---------------------------------------------------------------------------
# Subscribe / cancel / reactivate
# ---------------------------------------------------------------------------

def subscribe(
    user_id: str,
    tier_id: str,
    billing_cycle: str = "monthly",
    omise_customer_id: str | None = None,
    omise_schedule_id: str | None = None,
) -> dict:
    """Create or update a user's subscription to a new tier."""
    tier = get_tier(tier_id)
    if not tier:
        raise ValueError(f"Invalid tier: {tier_id}")
    if billing_cycle not in ("monthly", "annual"):
        raise ValueError(f"Invalid billing cycle: {billing_cycle}")

    # Check current tier to avoid duplicate token crediting on repeated calls
    existing_sub = get_user_subscription(user_id)
    old_tier = existing_sub.get("tier_id", "free") if existing_sub else "free"
    should_credit = old_tier != tier_id

    client = _get_client()
    now = datetime.now(timezone.utc)

    if billing_cycle == "monthly":
        period_end = now + timedelta(days=30)
    else:
        period_end = now + timedelta(days=365)

    sub_data = {
        "user_id": user_id,
        "tier_id": tier_id,
        "billing_cycle": billing_cycle,
        "status": "active",
        "current_period_start": now.isoformat(),
        "current_period_end": period_end.isoformat(),
        "tokens_refreshed_at": now.isoformat(),
        "cancel_at_period_end": False,
    }
    if omise_customer_id:
        sub_data["omise_customer_id"] = omise_customer_id
    if omise_schedule_id:
        sub_data["omise_schedule_id"] = omise_schedule_id

    # Upsert subscription
    result = (
        client.table("subscriptions")
        .upsert(sub_data, on_conflict="user_id")
        .execute()
    )

    # Update profile tier_id
    client.table("profiles").update({"tier_id": tier_id}).eq("id", user_id).execute()

    # Only credit tokens on actual tier change (prevents duplicates from multiple callers)
    monthly_tokens = tier.get("monthly_tokens", 0)
    if monthly_tokens > 0 and should_credit:
        sb.credit_tokens(
            user_id=user_id,
            amount=monthly_tokens,
            type_="subscription",
            reference=f"subscribe:{tier_id}",
            channel="system",
        )

    # Invalidate in-process tier cache so feature checks pick up the new tier
    from api.services.feature_guard import invalidate_user_tier_cache
    invalidate_user_tier_cache(user_id)

    logger.info(
        "User %s subscribed to %s (%s), credited %d tokens (tier_changed=%s)",
        user_id, tier_id, billing_cycle, monthly_tokens, should_credit,
    )

    return result.data[0] if result.data else sub_data


def cancel_subscription(user_id: str) -> dict:
    """Mark subscription to cancel at end of current period."""
    client = _get_client()
    result = (
        client.table("subscriptions")
        .update({"cancel_at_period_end": True})
        .eq("user_id", user_id)
        .execute()
    )
    logger.info("User %s scheduled subscription cancellation", user_id)
    return result.data[0] if result.data else {}


def reactivate_subscription(user_id: str) -> dict:
    """Undo cancel — keep subscription active at period end."""
    client = _get_client()
    result = (
        client.table("subscriptions")
        .update({"cancel_at_period_end": False})
        .eq("user_id", user_id)
        .execute()
    )
    logger.info("User %s reactivated subscription", user_id)
    return result.data[0] if result.data else {}


# ---------------------------------------------------------------------------
# Renewal
# ---------------------------------------------------------------------------

def process_renewal(user_id: str) -> dict:
    """Process subscription renewal: rollover tokens, credit new allocation, extend period.

    Called by webhook or cron when a recurring payment succeeds.
    """
    sub = get_user_subscription(user_id)
    if not sub:
        raise ValueError(f"No subscription for user {user_id}")

    tier_id = sub.get("tier_id", "free")
    tier = get_tier(tier_id)
    if not tier:
        raise ValueError(f"Invalid tier: {tier_id}")

    # If cancel_at_period_end, downgrade to free
    if sub.get("cancel_at_period_end"):
        return _downgrade_to_free(user_id)

    client = _get_client()
    monthly_tokens = tier.get("monthly_tokens", 0)
    max_rollover = tier.get("max_rollover", 0)

    # Apply rollover + credit via RPC
    new_balance = client.rpc("refresh_subscription_tokens", {
        "p_user_id": user_id,
        "p_monthly_tokens": monthly_tokens,
        "p_max_rollover": max_rollover,
    }).execute().data

    # Extend period
    now = datetime.now(timezone.utc)
    billing_cycle = sub.get("billing_cycle", "monthly")
    if billing_cycle == "annual":
        new_end = now + timedelta(days=365)
    else:
        new_end = now + timedelta(days=30)

    client.table("subscriptions").update({
        "current_period_start": now.isoformat(),
        "current_period_end": new_end.isoformat(),
        "status": "active",
    }).eq("user_id", user_id).execute()

    logger.info(
        "Renewed subscription for user %s (tier=%s): new_balance=%s, period_end=%s",
        user_id, tier_id, new_balance, new_end.isoformat(),
    )

    return {"new_balance": new_balance, "period_end": new_end.isoformat()}


def _downgrade_to_free(user_id: str) -> dict:
    """Downgrade a cancelled subscription to free tier."""
    client = _get_client()
    client.table("subscriptions").update({
        "tier_id": "free",
        "status": "active",
        "billing_cycle": "monthly",
        "current_period_start": None,
        "current_period_end": None,
        "omise_schedule_id": None,
        "cancel_at_period_end": False,
    }).eq("user_id", user_id).execute()

    client.table("profiles").update({"tier_id": "free"}).eq("id", user_id).execute()

    # Invalidate in-process tier cache so feature checks pick up the downgrade
    from api.services.feature_guard import invalidate_user_tier_cache
    invalidate_user_tier_cache(user_id)

    logger.info("User %s downgraded to free tier", user_id)
    return {"tier_id": "free", "status": "active"}


# ---------------------------------------------------------------------------
# Permission helpers
# ---------------------------------------------------------------------------

def check_feature_permission(user_id: str, feature: str) -> bool:
    """Check if a user has permission for a specific feature."""
    profile = sb.get_user_profile(user_id)
    tier_id = profile.get("tier_id", "free")
    permissions = get_tier_permissions(tier_id)
    return bool(permissions.get(feature, False))


def get_project_limits(user_id: str) -> dict:
    """Get project limits for a user based on their tier."""
    profile = sb.get_user_profile(user_id)
    tier_id = profile.get("tier_id", "free")
    tier = get_tier(tier_id)
    if not tier:
        return {"max_projects": 1, "project_expiry_days": 7}
    return {
        "max_projects": tier.get("max_projects", 1),
        "project_expiry_days": tier.get("project_expiry_days", 7),
    }
