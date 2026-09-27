import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";

import { aiApi } from "../api/ai";
import { ApiError } from "../api/client";
import { useData, type DataContextValue } from "../data/DataProvider";
import { useAiSettings } from "../hooks/useAiSettings";
import { useShortcuts } from "../hooks/useShortcuts";
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
      priority: item.priority ?? "medium",
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
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

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

  const enabled = settings?.enabled === true;
  const configured = settings?.configured === true;

  function closePanel() {
    restoreFocus.current = true;
    setOpen(false);
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        restoreFocus.current = true;
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      if (inputRef.current) {
        inputRef.current.focus();
        return;
      }
      document
        .getElementById("ai-panel")
        ?.querySelector<HTMLElement>("button, a, input")
        ?.focus();
      return;
    }
    if (restoreFocus.current) {
      restoreFocus.current = false;
      launcherRef.current?.focus();
    }
  }, [open]);

  useShortcuts(
    enabled && configured
      ? {
          "focus-assistant": () => {
            setOpen(true);
            inputRef.current?.focus();
          },
        }
      : {},
  );

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
    const remaining: AiProposal[] = [];
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
        remaining.push(item);
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
    setPendingItems(remaining.length > 0 ? remaining : null);
    setExecuting(false);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closePanel();
    }
  }

  if (loading && !settings) {
    return null;
  }

  if (!enabled) {
    return null;
  }

  const composer: ReactNode = configured ? (
    <form className="border-t border-line p-3" onSubmit={(event) => void submitPrompt(event)}>
      <div className="flex items-center gap-2">
        <input
          aria-label="AI assistant"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          id={inputId}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Ask Holtia to help plan your day…"
          ref={inputRef}
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
  ) : (
    <div className="border-t border-line p-3">
      <Link
        className="text-sm text-moss hover:text-moss-hover"
        to="/account"
      >
        Set an API key on Account to use the assistant.
      </Link>
    </div>
  );

  return (
    <>
      {open ? (
        <>
          <button
            aria-label="Dismiss assistant"
            className="fixed inset-x-0 top-0 z-30 h-12 md:hidden"
            onClick={closePanel}
            type="button"
          />
          <AiPanel
            error={error}
            executing={executing}
            footer={composer}
            messages={messages}
            onClose={closePanel}
            onCreate={() => void createItems()}
            onDiscard={discardPlan}
            pendingItems={pendingItems}
            sending={sending}
          />
        </>
      ) : (
        <button
          aria-label="Open assistant"
          className="fixed right-4 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-30 flex size-11 items-center justify-center rounded-lg border border-line bg-paper-raised text-moss hover:bg-paper-deep md:right-6 md:bottom-6"
          onClick={() => setOpen(true)}
          ref={launcherRef}
          type="button"
        >
          <Icon name="leaf" className="size-5" />
        </button>
      )}
    </>
  );
}
