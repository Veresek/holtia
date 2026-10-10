import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { passwordProblem } from "../auth/password";
import {
  AuthCard,
  authErrorClassName,
  buttonClassName,
  fieldClassName,
  secondaryButtonClassName,
  statusClassName,
} from "../components/AuthCard";
import { PasswordRules } from "../components/PasswordRules";

type ResetStep = "email" | "code";

export function ResetPage() {
  const navigate = useNavigate();
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showUnmet, setShowUnmet] = useState(false);
  const [sent, setSent] = useState(false);

  // The step swap unmounts the focused button, so focus moves to the code field.
  useEffect(() => {
    if (step === "code") {
      codeInputRef.current?.focus();
    }
  }, [step]);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSent(false);
    setPending(true);
    try {
      await authApi.sendCode({ email, purpose: "reset" });
      setSent(true);
      setStep("code");
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

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "");
    setError(null);
    const problem = passwordProblem(password);
    if (problem) {
      setShowUnmet(true);
      setError(problem);
      return;
    }
    setShowUnmet(false);
    setPending(true);
    try {
      await authApi.reset({ email, code, newPassword: password });
      navigate("/login", { replace: true });
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

  return (
    <AuthCard
      title="Reset your password"
      description={
        step === "email"
          ? "Enter your email and we’ll send a 6-digit code."
          : `We sent a code to ${email}. Enter it with your new password.`
      }
      footer={
        <Link className="text-moss hover:text-moss-hover" to="/login">
          Back to login
        </Link>
      }
    >
      {/* Distinct keys: without them the step swap reuses the email input's DOM
          node, so the code field would arrive holding the email address. */}
      {step === "email" ? (
        <form
          key="email"
          aria-busy={pending}
          onSubmit={(event) => void requestCode(event)}
        >
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
          <button className={buttonClassName} disabled={pending} type="submit">
            {pending ? "Sending code…" : "Send code"}
          </button>
          {error ? (
            <p aria-live="assertive" className={authErrorClassName} role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <form
          key="code"
          aria-busy={pending}
          onSubmit={(event) => void resetPassword(event)}
        >
          <label className="block text-sm text-ink">
            Verification code
            <input
              autoComplete="one-time-code"
              className={fieldClassName}
              inputMode="numeric"
              maxLength={6}
              name="code"
              placeholder="123456"
              pattern="[0-9]{6}"
              ref={codeInputRef}
              required
              type="text"
            />
          </label>
          <label className="mt-4 block text-sm text-ink">
            New password
            <input
              aria-describedby="password-rules"
              autoComplete="new-password"
              className={fieldClassName}
              name="newPassword"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Choose a new password"
              required
              type="password"
              value={password}
            />
          </label>
          <PasswordRules password={password} showUnmet={showUnmet} />
          <button className={buttonClassName} disabled={pending} type="submit">
            {pending ? "Resetting password…" : "Reset password"}
          </button>
          <button
            className={secondaryButtonClassName}
            disabled={pending}
            onClick={() => {
              setError(null);
              setSent(false);
              setStep("email");
            }}
            type="button"
          >
            Back
          </button>
          {error ? (
            <p aria-live="assertive" className={authErrorClassName} role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
      <p aria-live="polite" className={statusClassName} role="status">
        {sent ? "Check your email for the code." : ""}
      </p>
    </AuthCard>
  );
}
