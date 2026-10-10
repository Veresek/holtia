import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { passwordProblem } from "../auth/password";
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
import { PasswordRules } from "../components/PasswordRules";

type ResetStep = "email" | "code";

export function ResetPage() {
  const navigate = useNavigate();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const cameFromCodeStep = useRef(false);
  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showUnmet, setShowUnmet] = useState(false);
  const [sent, setSent] = useState(false);

  // Each step swap unmounts the focused element, so focus moves to the field the
  // user faces next. The ref tells a deliberate Back from the first render,
  // which must not steal focus from the page.
  useEffect(() => {
    if (step === "code") {
      codeInputRef.current?.focus();
      return;
    }
    if (cameFromCodeStep.current) {
      cameFromCodeStep.current = false;
      emailInputRef.current?.focus();
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
      // The “check your email” line would sit next to the failure claiming a
      // code is waiting there.
      setSent(false);
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
          : "Enter the 6-digit code from your email."
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
              aria-describedby={error ? "reset-error" : undefined}
              aria-invalid={error !== null}
              autoComplete="email"
              className={fieldClassName}
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              ref={emailInputRef}
              required
              type="email"
              value={email}
            />
          </label>
          <button className={buttonClassName} disabled={pending} type="submit">
            {pending ? "Sending code…" : "Send code"}
          </button>
          {error ? (
            <p
              aria-live="assertive"
              className={authErrorClassName}
              id="reset-error"
              role="alert"
            >
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
              {...codeInputProps}
              aria-describedby={error ? "reset-error" : undefined}
              aria-invalid={error !== null}
              ref={codeInputRef}
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
              cameFromCodeStep.current = true;
              setError(null);
              setSent(false);
              setStep("email");
            }}
            type="button"
          >
            Back
          </button>
          {error ? (
            <p
              aria-live="assertive"
              className={authErrorClassName}
              id="reset-error"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </form>
      )}
      <p
        aria-live="polite"
        className={sent ? statusClassName : emptyStatusClassName}
        role="status"
      >
        {sent ? "Check your email for the code." : ""}
      </p>
    </AuthCard>
  );
}
