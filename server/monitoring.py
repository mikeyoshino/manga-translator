import os
import logging
import sentry_sdk

logger = logging.getLogger(__name__)


def init_sentry(service: str = "api"):
    dsn = os.getenv("SENTRY_DSN", "")
    if not dsn:
        logger.info("SENTRY_DSN not set — Sentry disabled")
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("SENTRY_ENVIRONMENT", "development"),
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.2")),
        send_default_pii=False,
        server_name=service,
    )
    logger.info("Sentry initialized for service=%s env=%s",
                service, os.getenv("SENTRY_ENVIRONMENT", "development"))
