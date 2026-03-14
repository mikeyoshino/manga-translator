"""Service-role Supabase client for token operations."""

import os
from supabase import create_client, Client


def _get_client() -> Client:
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


def get_user_balance(user_id: str) -> int:
    client = _get_client()
    result = client.table("profiles").select("token_balance").eq("id", user_id).single().execute()
    return result.data["token_balance"]


def get_user_profile(user_id: str) -> dict:
    client = _get_client()
    result = client.table("profiles").select("*").eq("id", user_id).single().execute()
    return result.data


def deduct_tokens(user_id: str, amount: int, reference: str | None = None, channel: str | None = None) -> bool:
    """Calls the atomic deduct_tokens Postgres function. Returns True if successful."""
    client = _get_client()
    result = client.rpc("deduct_tokens", {
        "p_user_id": user_id,
        "p_amount": amount,
        "p_reference": reference,
        "p_channel": channel,
    }).execute()
    return result.data is True


def credit_tokens(user_id: str, amount: int, type_: str = "topup", reference: str | None = None, channel: str | None = None) -> int:
    """Credits tokens and returns the new balance."""
    client = _get_client()
    result = client.rpc("credit_tokens", {
        "p_user_id": user_id,
        "p_amount": amount,
        "p_type": type_,
        "p_reference": reference,
        "p_channel": channel,
    }).execute()
    return result.data


def get_transactions(user_id: str, limit: int = 50, offset: int = 0) -> list[dict]:
    client = _get_client()
    result = (
        client.table("token_transactions")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return result.data
