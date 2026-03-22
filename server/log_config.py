"""
Re-exports logging config from manga_shared for backward compatibility.

All definitions now live in packages/shared/manga_shared/log_config.py.
"""

from manga_shared.log_config import (  # noqa: F401
    correlation_id,
    JSONFormatter,
    setup_logging,
)
