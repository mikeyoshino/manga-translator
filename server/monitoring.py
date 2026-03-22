"""
Re-exports monitoring from manga_shared for backward compatibility.

All definitions now live in packages/shared/manga_shared/monitoring.py.
"""

from manga_shared.monitoring import init_sentry  # noqa: F401
