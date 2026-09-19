import type { IconName } from "./Icon";
import { Icon } from "./Icon";

interface PinChipProps {
  icon: IconName;
  label: string;
  onClick?: () => void;
}

export function PinChip({ icon, label, onClick }: PinChipProps) {
  const className = [
    "inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-soft",
    onClick ? "hover:border-lichen hover:text-ink" : "",
  ].join(" ");
  const content = (
    <>
      <Icon className="size-3.5 shrink-0" name={icon} />
      <span className="min-w-0 truncate">{label}</span>
    </>
  );
  if (!onClick) {
    return <p className={className}>{content}</p>;
  }
  return (
    <button
      className={className}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      type="button"
    >
      {content}
    </button>
  );
}
