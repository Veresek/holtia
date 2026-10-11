import type { InputHTMLAttributes, ReactNode } from "react";

import { Brand } from "./Brand";

interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({
  title,
  description,
  children,
  footer,
}: AuthCardProps) {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 py-10 text-ink">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Brand />
        </div>
        <section className="rounded-lg border border-line bg-paper-raised p-6 md:p-8">
          <h1 className="font-serif text-3xl">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{description}</p>
          <div className="mt-7">{children}</div>
          {footer && (
            <div className="mt-6 border-t border-line pt-5 text-center text-sm text-ink-soft">
              {footer}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export const fieldClassName =
  "mt-2 w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-moss";

export const buttonClassName =
  "mt-6 w-full rounded-md bg-moss px-4 py-2.5 text-sm font-medium text-paper-raised transition hover:bg-moss-hover disabled:cursor-not-allowed disabled:opacity-50";

export const authErrorClassName = "mt-3 text-center text-sm text-rust";

export const secondaryButtonClassName = [
  "mt-3 w-full rounded-md border border-line px-4 py-2 text-sm text-ink-soft",
  "transition hover:border-lichen hover:text-ink",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

export const statusClassName = "mt-3 text-center text-sm text-ink-soft";

// The region itself never unmounts, so its text is announced; while it has no
// text it must not reserve a line of its own.
export const emptyStatusClassName = "text-center text-sm text-ink-soft";

// Verify and reset ask for the same 6-digit field. Spread this and add only
// what a page differs in: its ref and its aria wiring.
export const codeInputProps: InputHTMLAttributes<HTMLInputElement> = {
  autoComplete: "one-time-code",
  className: fieldClassName,
  inputMode: "numeric",
  maxLength: 6,
  name: "code",
  pattern: "[0-9]{6}",
  placeholder: "123456",
  required: true,
  type: "text",
};
