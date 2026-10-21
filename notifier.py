# ── notifier.py ───────────────────────────────────────────────────────────────
# Desktop notification service using plyer with graceful fallback.

import logging

logger = logging.getLogger(__name__)


def send_notification(title: str, message: str, app_name: str = "PM Tool", timeout: int = 5):
    """Sends a native desktop notification."""
    try:
        from plyer import notification
        notification.notify(
            title=title,
            message=message,
            app_name=app_name,
            timeout=timeout,
        )
    except Exception as e:
        logger.warning("Could not send system notification via plyer: %s", e)
