"""Supabase queries for the admin CRM panel."""

import logging
from datetime import datetime

import server.supabase_client as sb

logger = logging.getLogger(__name__)


def get_dashboard_stats() -> dict:
    """Aggregate dashboard statistics."""
    client = sb._get_client()

    # Total users & token balance sum
    profiles = client.table("profiles").select("token_balance").execute()
    total_users = len(profiles.data) if profiles.data else 0
    tokens_in_circulation = sum(p["token_balance"] for p in profiles.data) if profiles.data else 0

    # Revenue from successful payments
    payments = (
        client.table("payments")
        .select("amount_satangs")
        .eq("status", "successful")
        .execute()
    )
    total_revenue_satangs = sum(p["amount_satangs"] for p in payments.data) if payments.data else 0

    # Active users (7d) — users with transactions in last 7 days
    from datetime import timedelta
    seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
    thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    active_7d = (
        client.table("token_transactions")
        .select("user_id")
        .gte("created_at", seven_days_ago)
        .execute()
    )
    active_7d_count = len(set(t["user_id"] for t in active_7d.data)) if active_7d.data else 0

    active_30d = (
        client.table("token_transactions")
        .select("user_id")
        .gte("created_at", thirty_days_ago)
        .execute()
    )
    active_30d_count = len(set(t["user_id"] for t in active_30d.data)) if active_30d.data else 0

    # Translations today
    translations_today = (
        client.table("token_transactions")
        .select("id", count="exact")
        .eq("type", "translation")
        .gte("created_at", today_start)
        .execute()
    )

    return {
        "total_users": total_users,
        "tokens_in_circulation": tokens_in_circulation,
        "total_revenue_thb": total_revenue_satangs / 100,
        "active_users_7d": active_7d_count,
        "active_users_30d": active_30d_count,
        "translations_today": translations_today.count or 0,
    }


def list_users(
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
    sort: str = "created_at",
    order: str = "desc",
) -> dict:
    """List users with optional email search. Returns {users, total}."""
    client = sb._get_client()

    # If searching by email, look up user IDs from Supabase Auth first
    matching_ids: set[str] | None = None
    if search:
        # Use admin API to search users by email
        auth_users = client.auth.admin.list_users()
        matching_ids = {
            u.id for u in auth_users
            if u.email and search.lower() in u.email.lower()
        }
        if not matching_ids:
            return {"users": [], "total": 0}

    # Build profiles query
    query = client.table("profiles").select("*", count="exact")
    if matching_ids is not None:
        query = query.in_("id", list(matching_ids))

    desc = order == "desc"
    query = query.order(sort, desc=desc).range(offset, offset + limit - 1)
    result = query.execute()

    # Enrich with emails from auth
    if result.data:
        if not search:
            auth_users = client.auth.admin.list_users()
        email_map = {u.id: u.email for u in auth_users}
        for profile in result.data:
            profile["email"] = email_map.get(profile["id"], None)

    return {
        "users": result.data or [],
        "total": result.count or 0,
    }


def get_user_detail(user_id: str) -> dict | None:
    """Get single user profile enriched with email."""
    client = sb._get_client()
    try:
        profile = client.table("profiles").select("*").eq("id", user_id).single().execute()
    except Exception:
        return None

    # Get email from auth
    try:
        auth_user = client.auth.admin.get_user_by_id(user_id)
        profile.data["email"] = auth_user.user.email if auth_user.user else None
    except Exception:
        profile.data["email"] = None

    return profile.data


def get_user_transactions(user_id: str, limit: int = 50, offset: int = 0) -> dict:
    """Get paginated transactions for a specific user."""
    client = sb._get_client()
    result = (
        client.table("token_transactions")
        .select("*", count="exact")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"transactions": result.data or [], "total": result.count or 0}


def get_user_projects(user_id: str, limit: int = 50, offset: int = 0) -> dict:
    """Get user's projects with image counts."""
    client = sb._get_client()
    projects = (
        client.table("projects")
        .select("*", count="exact")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    # Enrich with image counts
    for project in (projects.data or []):
        images = (
            client.table("project_images")
            .select("id", count="exact")
            .eq("project_id", project["id"])
            .execute()
        )
        project["image_count"] = images.count or 0

    return {"projects": projects.data or [], "total": projects.count or 0}


def list_all_transactions(
    type_: str | None = None,
    user_id: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """Global transaction log with filters."""
    client = sb._get_client()
    query = client.table("token_transactions").select("*", count="exact")

    if type_:
        query = query.eq("type", type_)
    if user_id:
        query = query.eq("user_id", user_id)
    if from_date:
        query = query.gte("created_at", from_date)
    if to_date:
        query = query.lte("created_at", to_date)

    result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()

    # Enrich with emails
    if result.data:
        user_ids = list(set(t["user_id"] for t in result.data))
        auth_users = client.auth.admin.list_users()
        email_map = {u.id: u.email for u in auth_users}
        for txn in result.data:
            txn["email"] = email_map.get(txn["user_id"], None)

    return {"transactions": result.data or [], "total": result.count or 0}


def get_transactions_summary(from_date: str | None = None, to_date: str | None = None) -> list[dict]:
    """Daily aggregated token flow for charts."""
    client = sb._get_client()
    query = client.table("token_transactions").select("*")

    if from_date:
        query = query.gte("created_at", from_date)
    if to_date:
        query = query.lte("created_at", to_date)

    result = query.order("created_at", desc=False).execute()

    # Aggregate by date
    daily: dict[str, dict] = {}
    for txn in (result.data or []):
        date = txn["created_at"][:10]  # YYYY-MM-DD
        if date not in daily:
            daily[date] = {"date": date, "credits": 0, "debits": 0, "count": 0}
        amount = txn.get("amount", 0)
        if amount > 0:
            daily[date]["credits"] += amount
        else:
            daily[date]["debits"] += abs(amount)
        daily[date]["count"] += 1

    return sorted(daily.values(), key=lambda d: d["date"])


def list_all_payments(
    status: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """All payments with optional filters."""
    client = sb._get_client()
    query = client.table("payments").select("*", count="exact")

    if status:
        query = query.eq("status", status)
    if from_date:
        query = query.gte("created_at", from_date)
    if to_date:
        query = query.lte("created_at", to_date)

    result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()

    # Enrich with emails
    if result.data:
        auth_users = client.auth.admin.list_users()
        email_map = {u.id: u.email for u in auth_users}
        for payment in result.data:
            payment["email"] = email_map.get(payment["user_id"], None)

    return {"payments": result.data or [], "total": result.count or 0}


def get_usage_summary(from_date: str | None = None, to_date: str | None = None) -> list[dict]:
    """Daily translation counts for activity charts."""
    client = sb._get_client()
    query = client.table("token_transactions").select("created_at").eq("type", "translation")

    if from_date:
        query = query.gte("created_at", from_date)
    if to_date:
        query = query.lte("created_at", to_date)

    result = query.order("created_at", desc=False).execute()

    daily: dict[str, int] = {}
    for txn in (result.data or []):
        date = txn["created_at"][:10]
        daily[date] = daily.get(date, 0) + 1

    return [{"date": d, "translations": c} for d, c in sorted(daily.items())]
