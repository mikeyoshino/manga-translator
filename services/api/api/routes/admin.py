"""Admin CRM API router: /admin/*"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.services.auth import AuthUser, get_current_user
import api.services.admin_queries as aq
import manga_shared.supabase_client as sb

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_admin(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("/dashboard/stats")
async def dashboard_stats(admin: AuthUser = Depends(require_admin)):
    return aq.get_dashboard_stats()


@router.get("/users")
async def list_users(
    search: str | None = Query(default=None),
    sort: str = Query(default="created_at"),
    order: str = Query(default="desc"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    admin: AuthUser = Depends(require_admin),
):
    return aq.list_users(search=search, limit=limit, offset=offset, sort=sort, order=order)


@router.get("/users/{user_id}")
async def get_user(user_id: str, admin: AuthUser = Depends(require_admin)):
    user = aq.get_user_detail(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/users/{user_id}/transactions")
async def user_transactions(
    user_id: str,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    admin: AuthUser = Depends(require_admin),
):
    return aq.get_user_transactions(user_id, limit=limit, offset=offset)


@router.get("/users/{user_id}/projects")
async def user_projects(
    user_id: str,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    admin: AuthUser = Depends(require_admin),
):
    return aq.get_user_projects(user_id, limit=limit, offset=offset)


class AdjustBalanceRequest(BaseModel):
    amount: int
    reason: str


@router.post("/users/{user_id}/credit")
async def credit_user(user_id: str, body: AdjustBalanceRequest, admin: AuthUser = Depends(require_admin)):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    new_balance = sb.credit_tokens(
        user_id=user_id,
        amount=body.amount,
        type_="admin_credit",
        reference=f"admin:{admin.email}:{body.reason}",
        channel="admin",
    )
    logger.info("Admin %s credited %d tokens to user %s: %s", admin.email, body.amount, user_id, body.reason)
    return {"new_balance": new_balance}


@router.post("/users/{user_id}/deduct")
async def deduct_user(user_id: str, body: AdjustBalanceRequest, admin: AuthUser = Depends(require_admin)):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    success = sb.deduct_tokens(
        user_id=user_id,
        amount=body.amount,
        reference=f"admin:{admin.email}:{body.reason}",
        channel="admin",
    )
    if not success:
        raise HTTPException(status_code=400, detail="Insufficient tokens")
    logger.info("Admin %s deducted %d tokens from user %s: %s", admin.email, body.amount, user_id, body.reason)
    balance = sb.get_user_balance(user_id)
    return {"new_balance": balance}


@router.get("/transactions")
async def list_transactions(
    type: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    admin: AuthUser = Depends(require_admin),
):
    return aq.list_all_transactions(
        type_=type, user_id=user_id, from_date=from_date, to_date=to_date,
        limit=limit, offset=offset,
    )


@router.get("/transactions/summary")
async def transactions_summary(
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    admin: AuthUser = Depends(require_admin),
):
    return aq.get_transactions_summary(from_date=from_date, to_date=to_date)


@router.get("/payments")
async def list_payments(
    status: str | None = Query(default=None),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    admin: AuthUser = Depends(require_admin),
):
    return aq.list_all_payments(
        status=status, from_date=from_date, to_date=to_date,
        limit=limit, offset=offset,
    )


@router.get("/activity/usage")
async def activity_usage(
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    admin: AuthUser = Depends(require_admin),
):
    return aq.get_usage_summary(from_date=from_date, to_date=to_date)
