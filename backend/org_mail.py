"""Emails for the organisation layer, sent through Brevo. Nothing here ever raises:
a failed email must never break an application, an approval or an invite."""
import html
import json
import logging
import os
import urllib.request

log = logging.getLogger("genie.mail")
API_URL = "https://api.brevo.com/v3/smtp/email"


def link(path: str) -> str:
    return os.environ.get("FRONTEND_URL", "").rstrip("/") + path


def send_mail(to_email: str, to_name: str, subject: str, body_html: str) -> bool:
    key = os.environ.get("BREVO_API_KEY")
    sender = os.environ.get("MAIL_FROM_EMAIL")
    if not key or not sender or not to_email:
        log.warning("Email not sent: mail settings or recipient missing")
        return False
    payload = {
        "sender": {"name": os.environ.get("MAIL_FROM_NAME", "Team Genie"), "email": sender},
        "to": [{"email": to_email, "name": to_name or to_email}],
        "subject": subject,
        "htmlContent": body_html,
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"api-key": key, "content-type": "application/json", "accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception as exc:
        log.warning("Email failed: %s", exc)
        return False


def _page(paragraphs, button_label=None, button_url=None) -> str:
    e = html.escape
    body = "".join(f"<p style='margin:0 0 14px'>{e(p)}</p>" for p in paragraphs)
    if button_label and button_url:
        body += (
            f"<p style='margin:22px 0'><a href='{e(button_url)}' "
            "style='background:#5b5046;color:#fff;padding:12px 20px;border-radius:6px;"
            f"text-decoration:none'>{e(button_label)}</a></p>"
            f"<p style='margin:0 0 14px;color:#7a6f63;font-size:13px'>If the button does not work, "
            f"copy this link into your browser:<br>{e(button_url)}</p>"
        )
    body += "<p style='color:#7a6f63;font-size:13px'>Team Genie. Genie is not a medical service.</p>"
    return (
        "<div style=\"font-family:Georgia,'Times New Roman',serif;color:#2b2b2b;"
        f"max-width:560px;line-height:1.6\">{body}</div>"
    )


def send_application_received(email: str, contact_name: str, org_name: str) -> bool:
    return send_mail(
        email, contact_name, "We received your application to Genie",
        _page([
            f"Hello {contact_name},",
            f"Thank you for applying on behalf of {org_name}. A member of the Genie team will read "
            "your application and get back to you soon.",
            "Nothing is shared with anyone until we speak with you.",
        ]),
    )


def send_application_alert(org_name: str, kind: str, city: str, country: str,
                           contact_name: str, contact_email: str, message: str) -> bool:
    admin = os.environ.get("ADMIN_EMAIL", "")
    place = ", ".join(x for x in (city, country) if x) or "no place given"
    return send_mail(
        admin, "Genie admin", f"New organisation application: {org_name}",
        _page([
            f"{org_name} ({kind}, {place}) applied.",
            f"Contact: {contact_name}, {contact_email}.",
            f"Message: {message or 'none'}",
            "Review it with GET /admin/org-applications, then approve or reject it.",
        ]),
    )


def send_approved(email: str, contact_name: str, org_name: str, path: str) -> bool:
    url = link(path)
    return send_mail(
        email, contact_name, "Your Genie organisation page is ready",
        _page([
            f"Hello {contact_name},",
            f"{org_name} has been approved. This private link opens your coordination page. "
            "It is the only way in, so please keep it safe and do not forward it.",
            "From there you can add colleagues, open a story for someone in your care (after "
            "they or their family agree), and follow each wish through to a Wish Maker.",
            "Please never put medical record numbers or health details into Genie.",
        ], "Open your Genie page", url),
    )


def send_member_invite(email: str, name: str, org_name: str, role: str, path: str) -> bool:
    url = link(path)
    what = {
        "coordinator": "manage stories, colleagues and settings",
        "volunteer": "open stories and help wishes happen",
        "viewer": "view stories (read-only)",
    }.get(role, "view stories")
    return send_mail(
        email, name, f"You have been added to {org_name} on Genie",
        _page([
            f"Hello {name},",
            f"{org_name} added you to Genie so you can {what}. This private link is your "
            "only way in, so please keep it safe and do not forward it.",
        ], "Open your Genie page", url),
    )