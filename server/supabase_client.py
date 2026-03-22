"""
Re-exports Supabase client from manga_shared for backward compatibility.

All definitions now live in packages/shared/manga_shared/supabase_client.py.
"""

from manga_shared.supabase_client import (  # noqa: F401
    _get_client,
    get_user_balance,
    get_user_profile,
    deduct_tokens,
    credit_tokens,
    update_user_profile,
    get_transactions,
)
