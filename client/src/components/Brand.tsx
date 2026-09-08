import { Link } from "react-router-dom";

import logo from "../assets/icons/logo.svg";

interface BrandProps {
  to?: string;
}

export function Brand({ to = "/" }: BrandProps) {
  return (
    <Link className="flex items-center gap-2.5 text-ink" to={to}>
      <img
        alt=""
        className="size-9 rounded-md"
        src={logo}
      />
      <span className="font-serif text-[1.35rem] leading-none">Holtia</span>
    </Link>
  );
}
