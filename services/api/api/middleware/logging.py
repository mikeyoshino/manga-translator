"""
Request logging middleware with correlation IDs and Sentry context.
"""

import time
import uuid
import logging

import sentry_sdk
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from manga_shared.log_config import correlation_id

logger = logging.getLogger("api.middleware")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        req_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        correlation_id.set(req_id)

        with sentry_sdk.new_scope() as scope:
            scope.set_tag("correlation_id", req_id)
            scope.set_tag("method", request.method)
            scope.set_tag("path", request.url.path)
            if hasattr(request.state, "user_id"):
                scope.set_user({"id": request.state.user_id})

            start = time.monotonic()
            try:
                response = await call_next(request)
            except Exception as exc:
                duration_ms = round((time.monotonic() - start) * 1000, 1)
                logger.error(
                    "Request failed: %s %s [%s] %.1fms",
                    request.method, request.url.path, req_id, duration_ms,
                    exc_info=True,
                )
                sentry_sdk.capture_exception(exc)
                raise

            duration_ms = round((time.monotonic() - start) * 1000, 1)
            response.headers["X-Request-ID"] = req_id

            logger.info(
                "Request: %s %s → %d [%s] %.1fms",
                request.method, request.url.path, response.status_code, req_id, duration_ms,
            )
            return response
