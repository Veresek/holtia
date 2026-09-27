import { Link } from "react-router-dom";

import logo from "../assets/icons/logo.svg";

interface BrandProps {
  to?: string;
  compact?: boolean;
}

export function Brand({ to = "/", compact = false }: BrandProps) {
  return (
    <Link
      aria-label="Holtia"
      className={[
        "flex items-center text-ink",
        compact ? "justify-center gap-0" : "gap-2.5",
      ].join(" ")}
      to={to}
    >
      <img alt="" className="size-9 shrink-0 rounded-md" src={logo} />
      <span
        aria-hidden={compact || undefined}
        className={[
          "overflow-hidden font-serif text-[1.35rem] leading-none whitespace-nowrap transition-[max-width,opacity] duration-200 ease-out motion-reduce:transition-none",
          compact ? "max-w-0 opacity-0" : "max-w-[5.5rem] opacity-100",
        ].join(" ")}
      >
        Holtia
      </span>
    </Link>
  );
}
