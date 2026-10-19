import logging
import os
import re

import httpx

log = logging.getLogger("genie.mail")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
FAMILY_PATH = "/person/"


def frontend_url() -> str:
    return os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")


def mail_enabled() -> bool:
    return bool(os.environ.get("BREVO_API_KEY") and os.environ.get("MAIL_FROM_EMAIL"))


def looks_like_email(value) -> bool:
    return bool(value and EMAIL_RE.match(value.strip()))


def send_email(to_email: str, subject: str, text: str) -> bool:
    if not mail_enabled():
        log.info("Email not configured, skipping a message")
        return False
    try:
        r = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "api-key": os.environ["BREVO_API_KEY"],
                "accept": "application/json",
                "content-type": "application/json",
            },
            json={
                "sender": {
                    "name": os.environ.get("MAIL_FROM_NAME", "Genie"),
                    "email": os.environ["MAIL_FROM_EMAIL"],
                },
                "to": [{"email": to_email}],
                "subject": subject,
                "textContent": text,
            },
            timeout=10,
        )
    except Exception as exc:
        # The request itself failed (timeout, network). There is no response to read.
        log.warning("Email request failed: %s", exc)
        return False
    if r.status_code >= 300:
        # Brevo explains the problem in the body (for example an unverified sender or a blocked IP).
        log.warning("Email service returned status %s: %s", r.status_code, r.text[:200])
        return False
    return True


def application_text(name: str, link: str) -> str:
    return (
        f"Hello {name},\n\n"
        "Thank you for offering to help families through Genie. Your application has been "
        "received and will be reviewed by our team.\n\n"
        "This is your private link. Use it to see your status, update your profile, and reply "
        "to requests. Please keep it safe and do not share it:\n"
        f"{link}\n\n"
        "If you lose it, you can ask for a new one on the Genie website.\n\n"
        "With thanks,\nThe Genie team"
    )


def admin_new_application_text(name: str, maker_id: str) -> str:
    return (
        f"A new Wish Maker application is waiting for review: {name} ({maker_id}).\n"
        "Open GET /admin/makers to see it."
    )


def review_text(name: str, decision: str) -> str:
    if decision == "approve":
        body = (
            "Your profile has been approved and can now be matched with families. "
            "You can edit, pause, or withdraw it at any time from your private link."
        )
    elif decision == "reject":
        body = "Thank you for applying. We are not able to approve your profile at this time."
    else:
        body = "Your profile has been paused while we review some feedback. We will be in touch."
    return f"Hello {name},\n\n{body}\n\nThe Genie team"


def request_text(name: str) -> str:
    return (
        f"Hello {name},\n\n"
        "A family has asked if you could help with a wish. Open your private Genie link to read "
        "their request and reply. You are free to accept or decline.\n\n"
        f"If you cannot find your link, you can ask for a new one here: {frontend_url()}/maker/recover\n\n"
        "The Genie team"
    )


def reply_text(status: str, link: str) -> str:
    if status == "accepted":
        body = "A Wish Maker has accepted your request. Open Genie to see how to reach them:"
    else:
        body = "A Wish Maker is not able to help with this wish. You are welcome to choose someone else:"
    return f"Hello,\n\n{body}\n{link}\n\nThe Genie team"


def recovery_text(links: list) -> str:
    lines = "\n".join(f"- {name}: {link}" for name, link in links)
    return (
        "Hello,\n\n"
        "Here is your new private Genie link. Any older link no longer works. "
        "Please keep it safe and do not share it:\n"
        f"{lines}\n\n"
        "If you did not ask for this, you can ignore this email.\n\n"
        "The Genie team"
    )