import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import {
  AuthCard,
  authErrorClassName,
  buttonClassName,
  fieldClassName,
} from "../components/AuthCard";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setError(null);
    setPending(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        navigate("/verify", { replace: true, state: { email } });
        return;
      }
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
      title="Welcome back"
      description="Log in to open your day."
      footer={
        <>
          New to Holtia?{" "}
          <Link className="text-moss hover:text-moss-hover" to="/register">
            Create an account
          </Link>
        </>
      }
    >
      <form
        aria-busy={pending}
        onSubmit={(event) => void onSubmit(event)}
      >
        <label className="block text-sm text-ink">
          Email
          <input
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={error !== null}
            autoComplete="email"
            className={fieldClassName}
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
        </label>
        <label className="mt-4 block text-sm text-ink">
          Password
          <input
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={error !== null}
            autoComplete="current-password"
            className={fieldClassName}
            name="password"
            placeholder="Your password"
            required
            type="password"
          />
        </label>
        <button className={buttonClassName} disabled={pending} type="submit">
          {pending ? "Logging in…" : "Log in"}
        </button>
        {error ? (
          <p
            aria-live="assertive"
            className={authErrorClassName}
            id="login-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <Link
          className="mt-4 block text-center text-sm text-moss hover:text-moss-hover"
          to="/reset"
        >
          Reset password
        </Link>
      </form>
    </AuthCard>
  );
}
