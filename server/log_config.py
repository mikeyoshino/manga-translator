import logging
import json
from contextvars import ContextVar

correlation_id: ContextVar[str] = ContextVar("correlation_id", default="-")


class JSONFormatter(logging.Formatter):
    def format(self, record):
        log = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "correlation_id": correlation_id.get("-"),
        }
        if record.exc_info and record.exc_info[0]:
            log["exception"] = self.formatException(record.exc_info)
        return json.dumps(log)


def setup_logging(level=logging.INFO):
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    logging.root.handlers = [handler]
    logging.root.setLevel(level)
