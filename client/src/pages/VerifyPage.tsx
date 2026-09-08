import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import {
  AuthCard,
  authErrorClassName,
  buttonClassName,
  fieldClassName,
} from "../components/AuthCard";

interface VerifyLocationState {
  email?: string;
}

export function VerifyPage() {
  const { verify } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const prefilledEmail =
    (location.state as VerifyLocationState | null)?.email ?? "";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const instanceCode = String(form.get("instanceCode") ?? "");
    setError(null);
    setPending(true);
    try {
      await verify(email, instanceCode);
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

  return (
    <AuthCard
      title="Verify your account"
      description="Enter the instance code supplied by the person hosting Holtia."
      footer={
        <Link className="text-moss hover:text-moss-hover" to="/login">
          Back to login
        </Link>
      }
    >
      <form
        aria-busy={pending}
        onSubmit={(event) => void onSubmit(event)}
      >
        <label className="block text-sm text-ink">
          Email
          <input
            className={fieldClassName}
            autoComplete="email"
            defaultValue={prefilledEmail}
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
        </label>
        <label className="mt-4 block text-sm text-ink">
          Instance code
          <input
            className={fieldClassName}
            autoComplete="off"
            name="instanceCode"
            placeholder="Enter code"
            required
            type="password"
          />
        </label>
        <button className={buttonClassName} disabled={pending} type="submit">
          {pending ? "Verifying…" : "Verify account"}
        </button>
        {error ? (
          <p
            aria-live="assertive"
            className={authErrorClassName}
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </form>
    </AuthCard>
  );
}
