"""Token charge & refund guard for translation endpoints."""

import logging
from typing import Optional

import sentry_sdk
from fastapi import HTTPException

import server.supabase_client as sb

logger = logging.getLogger(__name__)


class TokenCharge:
    """Tracks a token deduction and provides idempotent refund."""

    def __init__(self, user_id: str, amount: int, reference: str):
        self.user_id = user_id
        self.amount = amount
        self.reference = reference
        self._refunded = False

    def refund(self, reason: str = "") -> None:
        if self._refunded:
            return
        self._refunded = True
        try:
            sb.credit_tokens(
                user_id=self.user_id,
                amount=self.amount,
                type_="refund",
                reference=self.reference,
                channel="refund",
            )
            logger.warning(
                "Refunded %d tokens to user %s (ref=%s): %s",
                self.amount, self.user_id, self.reference, reason,
            )
        except Exception as exc:
            logger.error(
                "Failed to refund %d tokens to user %s (ref=%s): %s",
                self.amount, self.user_id, self.reference, exc,
                exc_info=True,
            )
            sentry_sdk.capture_exception(exc)
            sentry_sdk.capture_message(
                f"CRITICAL: token refund failed for user {self.user_id}, "
                f"amount={self.amount}, ref={self.reference}",
                level="fatal",
            )


def deduct_or_raise(
    user_id: str,
    amount: int,
    reference: str,
    is_admin: bool,
) -> Optional[TokenCharge]:
    """Deduct tokens or raise HTTP 402. Returns None for admins."""
    if is_admin:
        return None
    if not sb.deduct_tokens(user_id, amount, reference=reference, channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    return TokenCharge(user_id, amount, reference)
