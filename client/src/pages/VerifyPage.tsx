import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import {
  AuthCard,
  authErrorClassName,
  buttonClassName,
  codeInputProps,
  emptyStatusClassName,
  fieldClassName,
  secondaryButtonClassName,
  statusClassName,
} from "../components/AuthCard";

const RESEND_COOLDOWN_SECONDS = 60;

interface VerifyLocationState {
  email?: string;
}

export function VerifyPage() {
  const { verify } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(
    (location.state as VerifyLocationState | null)?.email ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const coolingDown = cooldown > 0;

  useEffect(() => {
    if (!coolingDown) {
      return;
    }
    const id = window.setInterval(() => {
      setCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [coolingDown]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "");
    setError(null);
    setPending(true);
    try {
      await verify(email, code);
      navigate("/", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The request could not be completed.",
      );
    } finally {
      setPending(false);
    }
  }

  async function resendCode() {
    setError(null);
    setSent(false);
    setResending(true);
    try {
      await authApi.sendCode({ email, purpose: "verify" });
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The request could not be completed.",
      );
    } finally {
      setResending(false);
    }
  }

  const resendLabel = coolingDown
    ? `Resend code in ${cooldown}s`
    : resending
      ? "Sending code…"
      : "Resend code";

  return (
    <AuthCard
      title="Verify your account"
      description="Enter the 6-digit code we emailed you."
      footer={
        <Link className="text-moss hover:text-moss-hover" to="/login">
          Back to login
        </Link>
      }
    >
      <form aria-busy={pending} onSubmit={(event) => void onSubmit(event)}>
        <label className="block text-sm text-ink">
          Email
          <input
            autoComplete="email"
            className={fieldClassName}
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
        </label>
        <label className="mt-4 block text-sm text-ink">
          Verification code
          <input
            {...codeInputProps}
            aria-describedby={error ? "verify-error" : undefined}
            aria-invalid={error !== null}
          />
        </label>
        <button className={buttonClassName} disabled={pending} type="submit">
          {pending ? "Verifying…" : "Verify account"}
        </button>
        <button
          className={secondaryButtonClassName}
          disabled={coolingDown || resending || email.trim() === ""}
          onClick={() => void resendCode()}
          type="button"
        >
          {resendLabel}
        </button>
        <p
          aria-live="polite"
          className={sent ? statusClassName : emptyStatusClassName}
          role="status"
        >
          {sent ? "Code sent. Check your email." : ""}
        </p>
        {error ? (
          <p
            aria-live="assertive"
            className={authErrorClassName}
            id="verify-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </form>
    </AuthCard>
  );
}
