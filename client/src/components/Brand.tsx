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
        compact ? "justify-center" : "gap-2.5",
      ].join(" ")}
      to={to}
    >
      <img alt="" className="size-9 rounded-md" src={logo} />
      {compact ? null : (
        <span className="font-serif text-[1.35rem] leading-none">Holtia</span>
      )}
    </Link>
  );
}
