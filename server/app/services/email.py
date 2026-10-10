import smtplib
from email.message import EmailMessage

from app.config import Settings

PURPOSE_SUBJECTS = {
    "verify": "Your Holtia verification code",
    "reset": "Your Holtia password reset code",
}


def send_code_email(
    settings: Settings,
    *,
    to: str,
    code: str,
    purpose: str,
) -> None:
    """Deliver a one-time code. SMTP errors are the caller's to log and absorb."""
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = to
    message["Subject"] = PURPOSE_SUBJECTS[purpose]
    message.set_content(_body(settings, code=code, purpose=purpose))

    with smtplib.SMTP(
        settings.smtp_host,
        settings.smtp_port,
        timeout=settings.smtp_timeout_seconds,
    ) as smtp:
        smtp.starttls()
        smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)


def _body(settings: Settings, *, code: str, purpose: str) -> str:
    lines = [
        f"{PURPOSE_SUBJECTS[purpose]} is {code}.",
        "",
        f"It expires in {settings.email_code_ttl_minutes} minutes and works once.",
    ]
    if purpose == "reset":
        lines += [
            "",
            "If you did not ask to reset your password, ignore this email.",
        ]
    return "\n".join(lines)
