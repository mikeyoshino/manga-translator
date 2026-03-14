"""Omise payment integration — PromptPay & Credit Card charges + webhooks."""

import hashlib
import hmac
import logging
import os
from typing import Any

import omise

logger = logging.getLogger(__name__)

# Token packages: tokens → satangs (1 THB = 100 satangs)
TOKEN_PACKAGES: dict[int, int] = {
    50: 2900,      # 50 tokens → 29 THB
    200: 9900,     # 200 tokens → 99 THB
    500: 19900,    # 500 tokens → 199 THB
}


def _init_omise():
    """Set Omise keys lazily so dotenv has time to load."""
    if not omise.api_secret:
        omise.api_public = os.getenv("OMISE_PUBLIC_KEY", "")
        omise.api_secret = os.getenv("OMISE_SECRET_KEY", "")


def create_promptpay_charge(user_id: str, token_amount: int) -> dict[str, Any]:
    """Create a PromptPay source + charge. Returns charge data including QR URL."""
    _init_omise()

    if token_amount not in TOKEN_PACKAGES:
        raise ValueError(f"Invalid package. Choose from: {list(TOKEN_PACKAGES.keys())}")

    amount_satangs = TOKEN_PACKAGES[token_amount]

    source = omise.Source.create(
        type="promptpay",
        amount=amount_satangs,
        currency="thb",
    )

    charge = omise.Charge.create(
        amount=amount_satangs,
        currency="thb",
        source=source.id,
        metadata={
            "user_id": user_id,
            "tokens_to_credit": token_amount,
            "payment_method": "promptpay",
        },
    )

    logger.info("Source object: %s", source.__dict__ if hasattr(source, '__dict__') else source)
    logger.info("Charge object: %s", charge.__dict__ if hasattr(charge, '__dict__') else charge)

    # Extract QR code URL — try multiple locations across Omise API versions
    qr_code_url = None
    try:
        sc = getattr(source, "scannable_code", None)
        if sc and getattr(sc, "image", None):
            qr_code_url = sc.image.download_uri
    except Exception:
        pass
    if not qr_code_url:
        try:
            sc = getattr(charge, "source", {})
            if isinstance(sc, dict):
                sc_code = sc.get("scannable_code", {}) or {}
                img = sc_code.get("image", {}) or {}
                qr_code_url = img.get("download_uri")
            elif hasattr(sc, "scannable_code") and getattr(sc.scannable_code, "image", None):
                qr_code_url = sc.scannable_code.image.download_uri
        except Exception:
            pass

    return {
        "charge_id": charge.id,
        "amount_satangs": amount_satangs,
        "tokens_to_credit": token_amount,
        "qr_code_url": qr_code_url,
        "authorize_uri": charge.authorize_uri,
        "status": charge.status,
    }


def create_card_charge(user_id: str, token_amount: int, card_token: str) -> dict[str, Any]:
    """Create a credit card charge using an Omise card token from the frontend."""
    _init_omise()

    if token_amount not in TOKEN_PACKAGES:
        raise ValueError(f"Invalid package. Choose from: {list(TOKEN_PACKAGES.keys())}")

    amount_satangs = TOKEN_PACKAGES[token_amount]

    charge = omise.Charge.create(
        amount=amount_satangs,
        currency="thb",
        card=card_token,
        metadata={
            "user_id": user_id,
            "tokens_to_credit": token_amount,
            "payment_method": "card",
        },
    )

    logger.info("Card charge object: %s", charge.__dict__ if hasattr(charge, '__dict__') else charge)

    return {
        "charge_id": charge.id,
        "amount_satangs": amount_satangs,
        "tokens_to_credit": token_amount,
        "status": charge.status,
        "authorize_uri": charge.authorize_uri,  # 3D Secure redirect if needed
        "paid": getattr(charge, "paid", False),
    }


def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    """Verify Omise webhook signature."""
    secret = os.getenv("OMISE_SECRET_KEY", "")
    if not secret:
        return False
    computed = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, signature)


def parse_webhook_event(payload: dict) -> dict[str, Any] | None:
    """Parse a charge.complete webhook event. Returns charge metadata or None."""
    if payload.get("key") != "charge.complete":
        return None

    data = payload.get("data", {})
    status = data.get("status")
    metadata = data.get("metadata", {})

    return {
        "charge_id": data.get("id"),
        "status": status,
        "user_id": metadata.get("user_id"),
        "tokens_to_credit": metadata.get("tokens_to_credit"),
        "payment_method": metadata.get("payment_method", "unknown"),
        "amount_satangs": data.get("amount"),
    }
