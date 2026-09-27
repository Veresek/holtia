import type { AiKey, AiProvider } from "../types";
import { ConfirmDelete } from "./ConfirmDelete";
import { Icon, type IconName } from "./Icon";
import { ItemMenu } from "./ItemMenu";

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  deepseek: "DeepSeek",
  xai: "xAI",
};

const PROVIDER_ICONS: Record<AiProvider, IconName> = {
  openai: "openai",
  anthropic: "anthropic",
  gemini: "gemini",
  deepseek: "deepseek",
  xai: "xai",
};

interface AiKeyItemProps {
  item: AiKey;
  modelLabel: string;
  active?: boolean;
  selectable?: boolean;
  pending?: boolean;
  confirmingDelete?: boolean;
  deleteError?: string | null;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCancelDelete?: () => void;
  onConfirmDelete?: () => void;
}

export function AiKeyItem({
  item,
  modelLabel,
  active = false,
  selectable = false,
  pending = false,
  confirmingDelete = false,
  deleteError = null,
  onSelect,
  onEdit,
  onDelete,
  onCancelDelete,
  onConfirmDelete,
}: AiKeyItemProps) {
  const providerLabel = PROVIDER_LABELS[item.provider];
  const title = `${providerLabel} · ${modelLabel}`;
  const hint = `Key ending in ${item.keyHint}`;
  const summary = `${providerLabel} ${modelLabel}, key ending in ${item.keyHint}`;

  return (
    <article
      className={[
        "flex w-full min-w-0 items-center gap-3 rounded-lg border bg-paper-raised px-3 py-3",
        active ? "border-moss" : "border-line",
      ].join(" ")}
    >
      <Icon
        className="size-8 shrink-0 text-ink"
        name={PROVIDER_ICONS[item.provider]}
      />
      {selectable && onSelect ? (
        <button
          aria-label={`Use ${summary}`}
          className="min-w-0 flex-1 text-left"
          disabled={pending || active}
          onClick={onSelect}
          type="button"
        >
          <p className="text-sm text-ink">{title}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {hint}
            {active ? " · In use" : ""}
          </p>
        </button>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">{title}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {hint}
            {active ? " · In use" : ""}
          </p>
        </div>
      )}
      {onEdit || onDelete ? (
        <ItemMenu
          disabled={pending}
          label={`Actions for ${summary}`}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      ) : null}
      {confirmingDelete && onConfirmDelete && onCancelDelete ? (
        <ConfirmDelete
          confirmLabel="Yes, remove the key"
          description="If this key is in use, another saved key will take its place."
          error={deleteError}
          onCancel={onCancelDelete}
          onConfirm={onConfirmDelete}
          pending={pending}
          pendingLabel="Removing key…"
          title="Remove this API key?"
        />
      ) : null}
    </article>
  );
}

export { PROVIDER_ICONS, PROVIDER_LABELS };
