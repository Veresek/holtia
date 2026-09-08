import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";

import { aiApi } from "../api/ai";
import { ApiError } from "../api/client";
import { useData, type DataContextValue } from "../data/DataProvider";
import { useAiSettings } from "../hooks/useAiSettings";
import { toTimePayload } from "../time";
import type { AiProposal } from "../types";
import { AiPanel, type AiChatMessage, type AiExecutionResult } from "./AiPanel";
import { Icon } from "./Icon";

function nextId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function createProposal(
  item: AiProposal,
  createTask: DataContextValue["createTask"],
  createNote: DataContextValue["createNote"],
  createBlock: DataContextValue["createBlock"],
) {
  if (item.kind === "task") {
    await createTask({
      title: item.title,
      description: item.description,
      date: item.date,
    });
    return;
  }
  if (item.kind === "note") {
    await createNote({
      title: item.title,
      markdown: item.markdown,
    });
    return;
  }
  await createBlock({
    title: item.title,
    description: item.description,
    date: item.date,
    start: toTimePayload(item.start),
    end: toTimePayload(item.end),
    recurrence: "none",
  });
}

export function AiBar() {
  const { settings, loading } = useAiSettings();
  const { createTask, createNote, createBlock, revalidate } = useData();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<AiProposal[] | null>(null);
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );

  useEffect(() => {
    function goOnline() {
      setOffline(false);
    }
    function goOffline() {
      setOffline(true);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const enabled = settings?.enabled === true;
  const configured = settings?.configured === true;

  async function submitPrompt(event: FormEvent) {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || sending || executing) {
      return;
    }
    if (offline) {
      setError("You are offline. Reconnect to use the assistant.");
      setOpen(true);
      return;
    }
    setOpen(true);
    setSending(true);
    setError(null);
    setPendingItems(null);
    setDraft("");
    setMessages((current) => [
      ...current,
      { id: nextId(), role: "user", text: prompt },
    ]);
    try {
      const plan = await aiApi.plan(prompt);
      setMessages((current) => [
        ...current,
        {
          id: nextId(),
          role: "assistant",
          text: plan.reply,
          items: plan.items,
        },
      ]);
      setPendingItems(plan.items.length > 0 ? plan.items : null);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The assistant could not complete this request.",
      );
    } finally {
      setSending(false);
    }
  }

  function discardPlan() {
    setPendingItems(null);
  }

  async function createItems() {
    if (!pendingItems || executing) {
      return;
    }
    setExecuting(true);
    setError(null);
    const result: AiExecutionResult = { created: [], failed: [] };
    for (const item of pendingItems) {
      try {
        await createProposal(item, createTask, createNote, createBlock);
        result.created.push({ kind: item.kind, title: item.title });
      } catch (caught) {
        result.failed.push({
          kind: item.kind,
          title: item.title,
          message:
            caught instanceof ApiError
              ? caught.message
              : "The item could not be created.",
        });
      }
    }
    await revalidate();
    setMessages((current) => {
      const next = [...current];
      for (let index = next.length - 1; index >= 0; index -= 1) {
        if (next[index].role === "assistant") {
          next[index] = { ...next[index], execution: result };
          break;
        }
      }
      return next;
    });
    setPendingItems(null);
    setExecuting(false);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  if (loading && !settings) {
    return (
      <div className="border-b border-line bg-paper px-4 py-3 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-3 rounded-md border border-line bg-paper-raised px-3 py-2.5 text-ink-faint">
          <Icon name="leaf" className="size-5 shrink-0 text-lichen" />
          <p className="text-sm">Loading assistant…</p>
        </div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="border-b border-line bg-paper px-4 py-3 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-3 rounded-md border border-line bg-paper-raised px-3 py-2.5 text-ink-faint">
          <Icon name="leaf" className="size-5 shrink-0 text-lichen" />
          <input
            aria-label="AI assistant (coming later)"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
            disabled
            placeholder="Ask Holtia to help plan your day…"
            type="text"
          />
          <span className="text-xs text-ink-faint">Coming later</span>
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="border-b border-line bg-paper px-4 py-3 md:px-8">
        <Link
          className="mx-auto flex max-w-6xl items-center gap-3 rounded-md border border-line bg-paper-raised px-3 py-2.5 text-ink-soft hover:border-lichen"
          to="/account"
        >
          <Icon name="leaf" className="size-5 shrink-0 text-lichen" />
          <span className="min-w-0 flex-1 text-sm">
            Set an API key on Account to use the assistant.
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div className="border-b border-line bg-paper">
      <form
        className="px-4 py-3 md:px-8"
        onSubmit={(event) => void submitPrompt(event)}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 rounded-md border border-line bg-paper-raised px-3 py-2.5">
          <Icon name="leaf" className="size-5 shrink-0 text-lichen" />
          <input
            aria-label="AI assistant"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
            id={inputId}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={onInputKeyDown}
            placeholder="Ask Holtia to help plan your day…"
            type="text"
            value={draft}
          />
          <button
            aria-label="Send"
            className="rounded-md p-1 text-moss hover:text-moss-hover disabled:cursor-not-allowed disabled:text-ink-faint"
            disabled={sending || executing || draft.trim().length === 0}
            type="submit"
          >
            <Icon name="send" className="size-5" />
          </button>
        </div>
      </form>
      {open ? (
        <AiPanel
          error={error}
          executing={executing}
          messages={messages}
          onClose={() => setOpen(false)}
          onCreate={() => void createItems()}
          onDiscard={discardPlan}
          pendingItems={pendingItems}
          sending={sending}
        />
      ) : null}
    </div>
  );
}
