"""Subscription endpoints: /subscription/*"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.services.auth import AuthUser, get_current_user
from api.services import subscription as sub_svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/subscription", tags=["subscription"])


# --- Models ---

class SubscribeRequest(BaseModel):
    tier_id: str
    billing_cycle: str = "monthly"


class CancelRequest(BaseModel):
    pass  # No body needed, user_id from auth


# --- Endpoints ---

@router.get("/tiers")
async def list_tiers():
    """List all available subscription tiers (public endpoint)."""
    tiers = sub_svc.get_all_tiers()
    # Return as sorted list
    order = ["free", "starter", "pro", "premium"]
    return [tiers[tid] for tid in order if tid in tiers]


@router.get("/me")
async def get_my_subscription(user: AuthUser = Depends(get_current_user)):
    """Get current user's subscription details + permissions."""
    return sub_svc.get_user_subscription_summary(user.id)


@router.post("/subscribe")
async def subscribe(body: SubscribeRequest, user: AuthUser = Depends(get_current_user)):
    """Subscribe to a tier (initial subscription or upgrade).

    For paid tiers, the frontend should first create a payment charge,
    then call this endpoint after payment succeeds.
    """
    if body.tier_id == "free":
        raise HTTPException(400, "Cannot subscribe to free tier — use /subscription/cancel instead")

    if body.tier_id not in ("starter", "pro", "premium"):
        raise HTTPException(400, f"Invalid tier: {body.tier_id}")

    try:
        result = sub_svc.subscribe(user.id, body.tier_id, body.billing_cycle)
        return {"ok": True, "subscription": result}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error("Subscribe failed for user %s: %s", user.id, e, exc_info=True)
        raise HTTPException(500, "Failed to create subscription")


@router.post("/cancel")
async def cancel_subscription(user: AuthUser = Depends(get_current_user)):
    """Cancel subscription at end of current billing period."""
    sub = sub_svc.get_user_subscription(user.id)
    if not sub or sub.get("tier_id") == "free":
        raise HTTPException(400, "No active paid subscription to cancel")

    result = sub_svc.cancel_subscription(user.id)
    return {"ok": True, "subscription": result}


@router.post("/reactivate")
async def reactivate_subscription(user: AuthUser = Depends(get_current_user)):
    """Undo a pending cancellation — keep subscription active."""
    sub = sub_svc.get_user_subscription(user.id)
    if not sub or not sub.get("cancel_at_period_end"):
        raise HTTPException(400, "No pending cancellation to reactivate")

    result = sub_svc.reactivate_subscription(user.id)
    return {"ok": True, "subscription": result}


@router.get("/permissions")
async def get_my_permissions(user: AuthUser = Depends(get_current_user)):
    """Get the current user's resolved feature permissions."""
    return sub_svc.get_user_subscription_summary(user.id)["permissions"]


@router.get("/check/{feature}")
async def check_permission(feature: str, user: AuthUser = Depends(get_current_user)):
    """Check if the current user has a specific feature permission."""
    allowed = sub_svc.check_feature_permission(user.id, feature)
    return {"feature": feature, "allowed": allowed}
