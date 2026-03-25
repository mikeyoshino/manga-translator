"""Payment endpoints: /payment/*"""

import logging
import os

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from api.services.auth import AuthUser, get_current_user
import api.services.payment as payment_svc
from api.services import subscription as sub_svc
import manga_shared.supabase_client as sb

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payment", tags=["payment"])


class CreateChargeRequest(BaseModel):
    token_amount: int
    payment_method: str = "promptpay"
    card_token: str | None = None


class CreateSubscriptionChargeRequest(BaseModel):
    tier_id: str
    billing_cycle: str = "monthly"
    payment_method: str = "promptpay"
    card_token: str | None = None


@router.post("/create-charge")
async def create_charge(body: CreateChargeRequest, user: AuthUser = Depends(get_current_user)):
    try:
        if body.payment_method == "card":
            if not body.card_token:
                raise HTTPException(status_code=400, detail="card_token is required for card payment")
            charge_data = payment_svc.create_card_charge(user.id, body.token_amount, body.card_token)
        else:
            charge_data = payment_svc.create_promptpay_charge(user.id, body.token_amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Payment error: {e}")

    client = sb._get_client()
    client.table("payments").insert({
        "user_id": user.id,
        "omise_charge_id": charge_data["charge_id"],
        "amount_satangs": charge_data["amount_satangs"],
        "tokens_to_credit": charge_data["tokens_to_credit"],
        "status": "pending",
    }).execute()

    if body.payment_method == "card" and charge_data.get("paid"):
        sb.credit_tokens(
            user_id=user.id,
            amount=charge_data["tokens_to_credit"],
            type_="topup",
            reference=charge_data["charge_id"],
            channel="card",
        )
        client.table("payments").update({
            "status": "successful",
        }).eq("omise_charge_id", charge_data["charge_id"]).execute()

    return charge_data


@router.post("/create-subscription-charge")
async def create_subscription_charge(body: CreateSubscriptionChargeRequest, user: AuthUser = Depends(get_current_user)):
    # Prevent downgrade — user must cancel instead
    current_sub = sub_svc.get_user_subscription(user.id)
    current_tier = current_sub.get("tier_id", "free") if current_sub else "free"
    if sub_svc.TIER_RANK.get(body.tier_id, 0) < sub_svc.TIER_RANK.get(current_tier, 0):
        raise HTTPException(status_code=400, detail="Cannot downgrade — cancel your current subscription instead")

    try:
        if body.payment_method == "card":
            if not body.card_token:
                raise HTTPException(status_code=400, detail="card_token is required for card payment")
            charge_data = payment_svc.create_subscription_card_charge(user.id, body.tier_id, body.billing_cycle, body.card_token)
        else:
            charge_data = payment_svc.create_subscription_promptpay_charge(user.id, body.tier_id, body.billing_cycle)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Payment error: {e}")

    client = sb._get_client()
    try:
        sub_row = client.table("subscriptions").select("id").eq("user_id", user.id).single().execute()
        client.table("subscription_payments").insert({
            "user_id": user.id,
            "subscription_id": sub_row.data["id"],
            "omise_charge_id": charge_data["charge_id"],
            "tier_id": body.tier_id,
            "billing_cycle": body.billing_cycle,
            "amount_satangs": charge_data["amount_satangs"],
            "status": "pending",
        }).execute()
    except Exception as e:
        logger.error("Failed to record subscription payment: %s", e)

    if body.payment_method == "card" and charge_data.get("paid"):
        sub_svc.subscribe(user.id, body.tier_id, body.billing_cycle)
        client.table("subscription_payments").update({
            "status": "successful",
        }).eq("omise_charge_id", charge_data["charge_id"]).execute()

    return charge_data


@router.post("/webhook")
async def payment_webhook(request: Request):
    body = await request.json()
    event = payment_svc.parse_webhook_event(body)
    if event is None:
        return JSONResponse({"ok": True, "message": "ignored"})

    client = sb._get_client()

    if event["status"] == "successful" and event["user_id"]:
        if event.get("payment_type") == "subscription" and event.get("tier_id"):
            sub_svc.subscribe(event["user_id"], event["tier_id"], event.get("billing_cycle", "monthly"))
            client.table("subscription_payments").update({
                "status": "successful",
            }).eq("omise_charge_id", event["charge_id"]).execute()
        elif event["tokens_to_credit"]:
            sb.credit_tokens(
                user_id=event["user_id"],
                amount=int(event["tokens_to_credit"]),
                type_="topup",
                reference=event["charge_id"],
                channel=event.get("payment_method", "unknown"),
            )
            client.table("payments").update({
                "status": "successful",
            }).eq("omise_charge_id", event["charge_id"]).execute()
        else:
            client.table("payments").update({
                "status": "failed",
            }).eq("omise_charge_id", event["charge_id"]).execute()
    else:
        client.table("payments").update({
            "status": "failed",
        }).eq("omise_charge_id", event["charge_id"]).execute()

    return JSONResponse({"ok": True})


@router.post("/check-charge")
async def check_charge(body: dict, user: AuthUser = Depends(get_current_user)):
    charge_id = body.get("charge_id")
    if not charge_id:
        raise HTTPException(status_code=400, detail="charge_id required")

    import omise as _omise
    payment_svc._init_omise()

    try:
        charge = _omise.Charge.retrieve(charge_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve charge: {e}")

    if charge.status == "successful" and charge.paid:
        client = sb._get_client()
        metadata = charge.metadata or {}
        uid = metadata.get("user_id", user.id)
        if metadata.get("payment_type") == "subscription" and metadata.get("tier_id"):
            existing = client.table("subscription_payments").select("status").eq("omise_charge_id", charge_id).single().execute()
            if existing.data and existing.data.get("status") != "successful":
                sub_svc.subscribe(uid, metadata["tier_id"], metadata.get("billing_cycle", "monthly"))
                client.table("subscription_payments").update({"status": "successful"}).eq("omise_charge_id", charge_id).execute()
        else:
            existing = client.table("payments").select("status").eq("omise_charge_id", charge_id).single().execute()
            if existing.data and existing.data.get("status") != "successful":
                tokens = int(metadata.get("tokens_to_credit", 0))
                if tokens > 0:
                    sb.credit_tokens(user_id=uid, amount=tokens, type_="topup", reference=charge_id, channel=metadata.get("payment_method", "unknown"))
                    client.table("payments").update({"status": "successful"}).eq("omise_charge_id", charge_id).execute()

    return {"status": charge.status, "paid": charge.paid}
