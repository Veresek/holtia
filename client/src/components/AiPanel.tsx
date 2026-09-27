import { useEffect, useId, useRef, type ReactNode } from "react";

import { Icon } from "./Icon";
import { priorityLabel } from "../taskPriority";
import type { AiProposal } from "../types";
import { formatTimeLabel } from "../time";

export interface AiExecutionResult {
  created: { kind: AiProposal["kind"]; title: string }[];
  failed: { kind: AiProposal["kind"]; title: string; message: string }[];
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  items?: AiProposal[];
  execution?: AiExecutionResult;
}

interface AiPanelProps {
  messages: AiChatMessage[];
  sending: boolean;
  executing: boolean;
  error: string | null;
  pendingItems: AiProposal[] | null;
  footer: ReactNode;
  onCreate: () => void;
  onDiscard: () => void;
  onClose: () => void;
}

function kindLabel(kind: AiProposal["kind"]) {
  if (kind === "task") {
    return "Task";
  }
  if (kind === "note") {
    return "Note";
  }
  return "Block";
}

function proposalDetail(item: AiProposal) {
  if (item.kind === "task") {
    const when = item.date ?? "undated";
    return `${priorityLabel(item.priority ?? "medium")} · ${when}`;
  }
  if (item.kind === "note") {
    return "markdown note";
  }
  return `${item.date} ${formatTimeLabel(item.start)}–${formatTimeLabel(item.end)}`;
}

function ProposalList({
  items,
  labelledBy,
}: {
  items: AiProposal[];
  labelledBy: string;
}) {
  return (
    <ul aria-labelledby={labelledBy} className="mt-2 space-y-2">
      {items.map((item, index) => (
        <li
          key={`${item.kind}-${item.title}-${index}`}
          className="rounded-md border border-line bg-paper px-3 py-2"
        >
          <p className="text-xs text-ink-faint">{kindLabel(item.kind)}</p>
          <p className="mt-1 text-sm text-ink">{item.title}</p>
          <p className="mt-0.5 text-xs text-ink-soft">{proposalDetail(item)}</p>
        </li>
      ))}
    </ul>
  );
}

export function AiPanel({
  messages,
  sending,
  executing,
  error,
  pendingItems,
  footer,
  onCreate,
  onDiscard,
  onClose,
}: AiPanelProps) {
  const headingId = useId();
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [messages, sending, error]);

  const pendingMessageId =
    pendingItems && pendingItems.length > 0
      ? [...messages]
          .reverse()
          .find(
            (message) =>
              message.role === "assistant" &&
              message.items &&
              message.items.length > 0,
          )?.id
      : undefined;

  let status: ReactNode = null;
  if (sending) {
    status = (
      <p className="text-sm text-ink-soft" role="status">
        Planning…
      </p>
    );
  } else if (executing) {
    status = (
      <p className="text-sm text-ink-soft" role="status">
        Creating items…
      </p>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className="fixed z-30 flex flex-col overflow-hidden rounded-lg border border-line bg-paper-raised animate-rise-in top-12 right-3 bottom-[calc(4rem+env(safe-area-inset-bottom))] left-3 md:top-4 md:right-4 md:bottom-4 md:left-auto md:w-96"
      id="ai-panel"
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <h2 className="font-serif text-lg text-ink" id={headingId}>
          Assistant
        </h2>
        <button
          aria-label="Close assistant"
          className="rounded-md p-1 text-ink-soft hover:text-ink"
          onClick={onClose}
          type="button"
        >
          <Icon name="close" className="size-5" />
        </button>
      </div>
      <div
        className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4"
        ref={logRef}
      >
        {messages.length === 0 && !sending ? (
          <p className="text-sm text-ink-soft">
            Ask for tasks, notes, or a one-off block. You will preview
            everything before it is created.
          </p>
        ) : null}
        {messages.map((message) =>
          message.role === "user" ? (
            <div className="flex justify-end" key={message.id}>
              <p className="max-w-[85%] rounded-lg bg-paper px-3 py-2 text-sm whitespace-pre-wrap text-ink">
                {message.text}
              </p>
            </div>
          ) : (
            <article
              className="max-w-[85%] border-l-2 border-moss pl-3"
              key={message.id}
            >
              <p className="font-serif text-sm text-ink-soft">Holtia</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-ink">
                {message.text}
              </p>
              {message.items && message.items.length > 0 ? (
                <ProposalList items={message.items} labelledBy={headingId} />
              ) : null}
              {message.execution ? (
                <div className="mt-2 space-y-1 text-sm">
                  {message.execution.created.length > 0 ? (
                    <p className="text-moss">
                      Created{" "}
                      {message.execution.created
                        .map((item) => item.title)
                        .join(", ")}
                      .
                    </p>
                  ) : null}
                  {message.execution.failed.length > 0 ? (
                    <p role="alert" className="text-rust">
                      Could not create{" "}
                      {message.execution.failed
                        .map((item) => `${item.title} (${item.message})`)
                        .join("; ")}
                      .
                    </p>
                  ) : null}
                </div>
              ) : null}
              {message.id === pendingMessageId ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-md bg-moss px-4 py-2 text-sm font-medium text-paper-raised hover:bg-moss-hover disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={executing}
                    onClick={onCreate}
                    type="button"
                  >
                    {executing ? "Creating items…" : "Create items"}
                  </button>
                  <button
                    className="rounded-md border border-line px-4 py-2 text-sm text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={executing}
                    onClick={onDiscard}
                    type="button"
                  >
                    Discard
                  </button>
                </div>
              ) : null}
            </article>
          ),
        )}
        {status}
        {error ? (
          <p className="text-sm text-rust" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {footer}
    </section>
  );
}
