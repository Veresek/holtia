import type { ReactNode } from "react";

export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-rust">
      {" *"}
    </span>
  );
}

export function FieldLabel({
  htmlFor,
  required = false,
  children,
  className = "block text-sm font-medium text-ink",
}: {
  htmlFor: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor}>{children}</label>
      {required ? <RequiredMark /> : null}
    </div>
  );
}

export function fieldClass(invalid: boolean, extra = "") {
  return [
    "mt-1 w-full rounded-md border bg-paper px-3 py-2 text-sm text-ink",
    invalid ? "border-rust focus:border-rust" : "border-line focus:border-lichen",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p className="mt-1 text-sm text-rust" id={id} role="alert">
      {message}
    </p>
  );
}
