"""Tests for payment routes — subscription charge uses subscription_payments table."""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock, call

from api.routes.payment import (
    create_subscription_charge,
    create_charge,
    check_charge,
    payment_webhook,
    CreateSubscriptionChargeRequest,
    CreateChargeRequest,
)
from api.routes.subscription import subscribe, SubscribeRequest
from api.services.auth import AuthUser


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(user_id: str = "user-1") -> AuthUser:
    return AuthUser(id=user_id, email="user@test.com", is_admin=False)


def _setup_tier_rank(mock_sub_svc, current_tier=None):
    """Configure TIER_RANK and get_user_subscription on a mocked sub_svc."""
    mock_sub_svc.TIER_RANK = {"free": 0, "starter": 1, "pro": 2, "premium": 3}
    mock_sub_svc.get_user_subscription.return_value = (
        {"tier_id": current_tier} if current_tier else None
    )


def _mock_supabase_client():
    """Return a mock Supabase client with chained table().insert/update/select/eq."""
    client = MagicMock()

    def _table(name):
        tbl = MagicMock()
        tbl._table_name = name
        # Track which table was used
        client._last_table = name
        return tbl

    client.table = MagicMock(side_effect=_table)
    return client


# ---------------------------------------------------------------------------
# Tests for create_subscription_charge
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@patch("api.routes.payment.sub_svc")
@patch("api.routes.payment.sb")
@patch("api.routes.payment.payment_svc")
async def test_subscription_charge_inserts_into_subscription_payments(
    mock_payment_svc, mock_sb, mock_sub_svc,
):
    """The subscription charge route should insert into subscription_payments, not payments."""
    # Arrange
    mock_payment_svc.create_subscription_promptpay_charge.return_value = {
        "charge_id": "chrg_test_123",
        "amount_satangs": 29900,
        "qr_code_url": "https://example.com/qr",
    }

    client = MagicMock()
    mock_sb._get_client.return_value = client

    # Mock subscriptions lookup
    sub_select = MagicMock()
    sub_select.data = {"id": "sub-uuid-1"}
    client.table("subscriptions").select("id").eq("user_id", "user-1").single().execute.return_value = sub_select
    _setup_tier_rank(mock_sub_svc)

    body = CreateSubscriptionChargeRequest(
        tier_id="pro",
        billing_cycle="monthly",
        payment_method="promptpay",
    )
    user = _make_user()

    # Act
    result = await create_subscription_charge(body, user)

    # Assert — charge_data is returned (not swallowed by DB error)
    assert result["charge_id"] == "chrg_test_123"
    assert result["qr_code_url"] == "https://example.com/qr"

    # Assert — subscription_payments table was used (not payments)
    table_calls = [c.args[0] for c in client.table.call_args_list]
    assert "subscription_payments" in table_calls
    assert "payments" not in table_calls


@pytest.mark.asyncio
@patch("api.routes.payment.sub_svc")
@patch("api.routes.payment.sb")
@patch("api.routes.payment.payment_svc")
async def test_subscription_charge_returns_data_even_if_db_insert_fails(
    mock_payment_svc, mock_sb, mock_sub_svc,
):
    """If the DB insert fails, the charge_data should still be returned to the frontend."""
    mock_payment_svc.create_subscription_promptpay_charge.return_value = {
        "charge_id": "chrg_test_456",
        "amount_satangs": 29900,
        "qr_code_url": "https://example.com/qr",
    }

    client = MagicMock()
    mock_sb._get_client.return_value = client

    _setup_tier_rank(mock_sub_svc)

    # Make the subscriptions lookup fail
    client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = Exception("DB error")

    body = CreateSubscriptionChargeRequest(
        tier_id="pro",
        billing_cycle="monthly",
        payment_method="promptpay",
    )
    user = _make_user()

    # Act — should NOT raise, charge_data must still be returned
    result = await create_subscription_charge(body, user)

    assert result["charge_id"] == "chrg_test_456"
    assert result["qr_code_url"] == "https://example.com/qr"


@pytest.mark.asyncio
@patch("api.routes.payment.sub_svc")
@patch("api.routes.payment.sb")
@patch("api.routes.payment.payment_svc")
async def test_subscription_card_charge_updates_subscription_payments(
    mock_payment_svc, mock_sb, mock_sub_svc,
):
    """Successful card charge should update subscription_payments (not payments)."""
    mock_payment_svc.create_subscription_card_charge.return_value = {
        "charge_id": "chrg_test_789",
        "amount_satangs": 29900,
        "paid": True,
    }

    client = MagicMock()
    mock_sb._get_client.return_value = client

    sub_select = MagicMock()
    sub_select.data = {"id": "sub-uuid-1"}
    client.table("subscriptions").select("id").eq("user_id", "user-1").single().execute.return_value = sub_select
    _setup_tier_rank(mock_sub_svc)

    body = CreateSubscriptionChargeRequest(
        tier_id="pro",
        billing_cycle="monthly",
        payment_method="card",
        card_token="tokn_test_abc",
    )
    user = _make_user()

    result = await create_subscription_charge(body, user)

    assert result["paid"] is True
    # subscribe should be called for immediate card success
    mock_sub_svc.subscribe.assert_called_once_with("user-1", "pro", "monthly")


@pytest.mark.asyncio
@patch("api.routes.payment.sentry_sdk")
@patch("api.routes.payment.sub_svc")
@patch("api.routes.payment.sb")
@patch("api.routes.payment.payment_svc")
async def test_subscription_card_charge_returns_data_even_if_subscribe_fails(
    mock_payment_svc, mock_sb, mock_sub_svc, mock_sentry,
):
    """If subscribe() throws during card payment, charge_data must still be returned (no 500)."""
    mock_payment_svc.create_subscription_card_charge.return_value = {
        "charge_id": "chrg_test_card_fail",
        "amount_satangs": 29900,
        "paid": True,
    }

    client = MagicMock()
    mock_sb._get_client.return_value = client

    _setup_tier_rank(mock_sub_svc)

    sub_select = MagicMock()
    sub_select.data = {"id": "sub-uuid-1"}
    client.table("subscriptions").select("id").eq("user_id", "user-1").single().execute.return_value = sub_select

    # Make subscribe() fail
    mock_sub_svc.subscribe.side_effect = Exception("Redis connection refused")

    body = CreateSubscriptionChargeRequest(
        tier_id="pro",
        billing_cycle="monthly",
        payment_method="card",
        card_token="tokn_test_abc",
    )
    user = _make_user()

    # Act — should NOT raise 500
    result = await create_subscription_charge(body, user)

    # charge_data is still returned
    assert result["charge_id"] == "chrg_test_card_fail"
    assert result["paid"] is True

    # Sentry was notified of the activation failure
    mock_sentry.capture_exception.assert_called_once()
    exc = mock_sentry.capture_exception.call_args[0][0]
    assert "Redis connection refused" in str(exc)


# ---------------------------------------------------------------------------
# Tests for create_charge (top-up) Sentry integration
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@patch("api.routes.payment.sentry_sdk")
@patch("api.routes.payment.sb")
@patch("api.routes.payment.payment_svc")
async def test_create_charge_sends_sentry_on_payment_error(
    mock_payment_svc, mock_sb, mock_sentry,
):
    """Top-up charge should report to Sentry when Omise call fails."""
    mock_payment_svc.create_promptpay_charge.side_effect = RuntimeError("Omise down")

    body = CreateChargeRequest(token_amount=100, payment_method="promptpay")
    user = _make_user()

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await create_charge(body, user)

    assert exc_info.value.status_code == 500
    mock_sentry.capture_exception.assert_called_once()


# ---------------------------------------------------------------------------
# Tests for webhook
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@patch("api.routes.payment.sub_svc")
@patch("api.routes.payment.sb")
@patch("api.routes.payment.payment_svc")
async def test_webhook_subscription_updates_subscription_payments(
    mock_payment_svc, mock_sb, mock_sub_svc,
):
    """Webhook for subscription payment should update subscription_payments table."""
    mock_payment_svc.parse_webhook_event.return_value = {
        "status": "successful",
        "user_id": "user-1",
        "charge_id": "chrg_test_sub",
        "payment_type": "subscription",
        "tier_id": "pro",
        "billing_cycle": "monthly",
        "tokens_to_credit": None,
    }

    client = MagicMock()
    mock_sb._get_client.return_value = client

    request = MagicMock()
    request.json = AsyncMock(return_value={})

    result = await payment_webhook(request)

    # Should update subscription_payments, not payments
    table_calls = [c.args[0] for c in client.table.call_args_list]
    assert "subscription_payments" in table_calls
    mock_sub_svc.subscribe.assert_called_once_with("user-1", "pro", "monthly")


@pytest.mark.asyncio
@patch("api.routes.payment.sub_svc")
@patch("api.routes.payment.sb")
@patch("api.routes.payment.payment_svc")
async def test_webhook_topup_still_uses_payments_table(
    mock_payment_svc, mock_sb, mock_sub_svc,
):
    """Webhook for top-up payment should still use the payments table."""
    mock_payment_svc.parse_webhook_event.return_value = {
        "status": "successful",
        "user_id": "user-1",
        "charge_id": "chrg_test_topup",
        "tokens_to_credit": 100,
        "payment_method": "promptpay",
    }

    client = MagicMock()
    mock_sb._get_client.return_value = client

    request = MagicMock()
    request.json = AsyncMock(return_value={})

    result = await payment_webhook(request)

    # Should use payments table for top-ups
    table_calls = [c.args[0] for c in client.table.call_args_list]
    assert "payments" in table_calls
    assert "subscription_payments" not in table_calls
    mock_sub_svc.subscribe.assert_not_called()


@pytest.mark.asyncio
@patch("api.routes.payment.sentry_sdk")
@patch("api.routes.payment.sub_svc")
@patch("api.routes.payment.sb")
@patch("api.routes.payment.payment_svc")
async def test_webhook_sends_sentry_on_error(
    mock_payment_svc, mock_sb, mock_sub_svc, mock_sentry,
):
    """Webhook should report to Sentry when processing fails."""
    mock_payment_svc.parse_webhook_event.side_effect = RuntimeError("parse error")

    request = MagicMock()
    request.json = AsyncMock(return_value={})

    with pytest.raises(RuntimeError):
        await payment_webhook(request)

    mock_sentry.capture_exception.assert_called_once()


# ---------------------------------------------------------------------------
# Tests for subscribe payment verification gate
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@patch("api.routes.subscription.sub_svc")
@patch("api.routes.subscription.sb")
async def test_subscribe_rejects_without_successful_payment(mock_sb, mock_sub_svc):
    """Calling /subscribe with no successful subscription_payments record returns 402."""
    client = MagicMock()
    mock_sb._get_client.return_value = client

    # No payment records found
    payment_result = MagicMock()
    payment_result.data = []
    (
        client.table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .eq.return_value
        .order.return_value
        .limit.return_value
        .execute.return_value
    ) = payment_result

    body = SubscribeRequest(tier_id="pro", billing_cycle="monthly")
    user = _make_user()

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await subscribe(body, user)

    assert exc_info.value.status_code == 402
    assert "No successful payment" in exc_info.value.detail


@pytest.mark.asyncio
@patch("api.routes.subscription.sub_svc")
@patch("api.routes.subscription.sb")
async def test_subscribe_allows_with_successful_payment(mock_sb, mock_sub_svc):
    """Calling /subscribe with a successful payment record returns 200."""
    client = MagicMock()
    mock_sb._get_client.return_value = client

    # Payment record exists
    payment_result = MagicMock()
    payment_result.data = [{"id": "pay-uuid-1"}]
    (
        client.table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .eq.return_value
        .order.return_value
        .limit.return_value
        .execute.return_value
    ) = payment_result

    _setup_tier_rank(mock_sub_svc)
    mock_sub_svc.subscribe.return_value = {"tier_id": "pro", "status": "active"}

    body = SubscribeRequest(tier_id="pro", billing_cycle="monthly")
    user = _make_user()

    result = await subscribe(body, user)

    assert result["ok"] is True
    assert result["subscription"]["tier_id"] == "pro"
    mock_sub_svc.subscribe.assert_called_once_with("user-1", "pro", "monthly")


# ---------------------------------------------------------------------------
# Tests for subscription downgrade prevention
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@patch("api.routes.subscription.sub_svc")
@patch("api.routes.subscription.sb")
async def test_subscribe_rejects_downgrade(mock_sb, mock_sub_svc):
    """User on 'pro' trying to subscribe to 'starter' should get 400."""
    client = MagicMock()
    mock_sb._get_client.return_value = client

    # Payment exists
    payment_result = MagicMock()
    payment_result.data = [{"id": "pay-uuid-1"}]
    (
        client.table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .eq.return_value
        .order.return_value
        .limit.return_value
        .execute.return_value
    ) = payment_result

    _setup_tier_rank(mock_sub_svc, current_tier="pro")

    body = SubscribeRequest(tier_id="starter", billing_cycle="monthly")
    user = _make_user()

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await subscribe(body, user)

    assert exc_info.value.status_code == 400
    assert "Cannot downgrade" in exc_info.value.detail


@pytest.mark.asyncio
@patch("api.routes.subscription.sub_svc")
@patch("api.routes.subscription.sb")
async def test_subscribe_allows_upgrade(mock_sb, mock_sub_svc):
    """User on 'starter' upgrading to 'pro' should succeed."""
    client = MagicMock()
    mock_sb._get_client.return_value = client

    # Payment exists
    payment_result = MagicMock()
    payment_result.data = [{"id": "pay-uuid-1"}]
    (
        client.table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .eq.return_value
        .order.return_value
        .limit.return_value
        .execute.return_value
    ) = payment_result

    _setup_tier_rank(mock_sub_svc, current_tier="starter")
    mock_sub_svc.subscribe.return_value = {"tier_id": "pro", "status": "active"}

    body = SubscribeRequest(tier_id="pro", billing_cycle="monthly")
    user = _make_user()

    result = await subscribe(body, user)

    assert result["ok"] is True
    mock_sub_svc.subscribe.assert_called_once_with("user-1", "pro", "monthly")


@pytest.mark.asyncio
@patch("api.routes.subscription.sub_svc")
@patch("api.routes.subscription.sb")
async def test_subscribe_allows_same_tier(mock_sb, mock_sub_svc):
    """User on 'pro' re-subscribing to 'pro' (renewal) should succeed."""
    client = MagicMock()
    mock_sb._get_client.return_value = client

    # Payment exists
    payment_result = MagicMock()
    payment_result.data = [{"id": "pay-uuid-1"}]
    (
        client.table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .eq.return_value
        .order.return_value
        .limit.return_value
        .execute.return_value
    ) = payment_result

    _setup_tier_rank(mock_sub_svc, current_tier="pro")
    mock_sub_svc.subscribe.return_value = {"tier_id": "pro", "status": "active"}

    body = SubscribeRequest(tier_id="pro", billing_cycle="monthly")
    user = _make_user()

    result = await subscribe(body, user)

    assert result["ok"] is True
    mock_sub_svc.subscribe.assert_called_once_with("user-1", "pro", "monthly")


@pytest.mark.asyncio
@patch("api.routes.payment.sub_svc")
@patch("api.routes.payment.sb")
@patch("api.routes.payment.payment_svc")
async def test_create_subscription_charge_rejects_downgrade(
    mock_payment_svc, mock_sb, mock_sub_svc,
):
    """User on 'premium' trying to create charge for 'pro' should get 400."""
    _setup_tier_rank(mock_sub_svc, current_tier="premium")

    body = CreateSubscriptionChargeRequest(
        tier_id="pro",
        billing_cycle="monthly",
        payment_method="promptpay",
    )
    user = _make_user()

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await create_subscription_charge(body, user)

    assert exc_info.value.status_code == 400
    assert "Cannot downgrade" in exc_info.value.detail
    # No charge should have been created
    mock_payment_svc.create_subscription_promptpay_charge.assert_not_called()
