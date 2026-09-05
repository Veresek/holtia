import { useState, type FormEvent } from "react";

import { aiApi } from "../api/ai";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import {
  authErrorClassName,
  buttonClassName,
  fieldClassName,
} from "../components/AuthCard";
import { AiKeyItem, PROVIDER_LABELS } from "../components/AiKeyItem";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { Dialog } from "../components/Dialog";
import { useAiSettings } from "../hooks/useAiSettings";
import type { AiKey, AiProvider } from "../types";

const PROVIDERS = Object.keys(PROVIDER_LABELS) as AiProvider[];

export function AccountPage() {
  const { user, logout, deleteAccount } = useAuth();
  const { settings, loading: settingsLoading, setSettings } = useAiSettings();
  const [pendingAction, setPendingAction] = useState<
    "logout" | "delete" | "save-ai" | "delete-ai" | "activate-ai" | null
  >(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingKeyId, setConfirmingKeyId] = useState<string | null>(null);
  const [editingKeyId, setEditingKeyId] = useState<string | null | "new">(null);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");

  const models = settings?.models[provider] ?? [];
  const keys = settings?.keys ?? [];
  const activeKey =
    keys.find((item) => item.id === settings?.activeKeyId) ?? null;
  const editingExisting =
    editingKeyId && editingKeyId !== "new"
      ? (keys.find((item) => item.id === editingKeyId) ?? null)
      : null;

  function modelLabel(item: AiKey) {
    return (
      settings?.models[item.provider]?.find((option) => option.id === item.model)
        ?.label ?? item.model
    );
  }

  function closeKeyForm() {
    setEditingKeyId(null);
    setAiError(null);
    setApiKey("");
  }

  function openAddKeyForm() {
    if (!settings?.enabled) {
      return;
    }
    setProvider("openai");
    setModel(settings.models.openai?.[0]?.id ?? "");
    setApiKey("");
    setAiError(null);
    setEditingKeyId("new");
  }

  function openEditKeyForm(item: AiKey) {
    if (!settings?.enabled) {
      return;
    }
    setProvider(item.provider);
    const options = settings.models[item.provider] ?? [];
    setModel(
      options.some((option) => option.id === item.model)
        ? item.model
        : (options[0]?.id ?? ""),
    );
    setApiKey("");
    setAiError(null);
    setEditingKeyId(item.id);
  }

  async function handleLogout() {
    setError(null);
    setPendingAction("logout");
    try {
      await logout();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "You could not be logged out. Please try again.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete() {
    setError(null);
    setPendingAction("delete");
    try {
      await deleteAccount();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Your account could not be deleted. Please try again.",
      );
      setPendingAction(null);
    }
  }

  async function handleSaveAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const adding = editingKeyId === "new";
    if (adding && !apiKey.trim()) {
      setAiError("Enter an API key to save.");
      return;
    }
    setAiError(null);
    setPendingAction("save-ai");
    try {
      const next = adding
        ? await aiApi.createKey({
            provider,
            model,
            apiKey: apiKey.trim(),
          })
        : await aiApi.updateKey(String(editingKeyId), {
            provider,
            model,
            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          });
      setSettings(next);
      closeKeyForm();
    } catch (caught) {
      setAiError(
        caught instanceof ApiError
          ? caught.message
          : "The API key could not be saved.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDeleteAi(keyId: string) {
    setAiError(null);
    setPendingAction("delete-ai");
    try {
      const next = await aiApi.removeKey(keyId);
      setSettings(next);
      setConfirmingKeyId(null);
    } catch (caught) {
      setAiError(
        caught instanceof ApiError
          ? caught.message
          : "The API key could not be removed.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleActivateAi(keyId: string) {
    setAiError(null);
    setPendingAction("activate-ai");
    try {
      setSettings(await aiApi.activateKey(keyId));
    } catch (caught) {
      setAiError(
        caught instanceof ApiError
          ? caught.message
          : "That API key could not be selected.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  const pending = pendingAction !== null;
  const keyFormOpen = editingKeyId !== null;

  return (
    <div
      aria-busy={pending || settingsLoading}
      className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8 md:py-12"
    >
      <div className="grid min-w-0 gap-12 md:grid-cols-2 md:grid-rows-[auto_1fr] md:items-start md:gap-x-12 md:gap-y-0 lg:gap-x-16">
        <div className="min-w-0 md:col-start-2 md:row-start-1">
          <p className="text-sm text-ink-soft">Your instance</p>
          <h1 className="mt-2 font-serif text-3xl md:text-4xl">Account</h1>
          <p className="mt-6 text-sm text-ink">{user?.email}</p>
          {user?.verifiedAt ? null : (
            <p className="mt-2 text-sm text-ink-soft">
              This account is not verified yet.
            </p>
          )}
          <button
            className={buttonClassName}
            disabled={pending}
            onClick={() => void handleLogout()}
            type="button"
          >
            {pendingAction === "logout" ? "Logging out…" : "Log out"}
          </button>
          {error && !confirmingDelete ? (
            <p aria-live="assertive" className={authErrorClassName} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <section
          aria-labelledby="ai-assistant-title"
          className="min-w-0 border-t border-line pt-8 md:col-start-1 md:row-start-1 md:row-span-2 md:border-t-0 md:pt-0"
        >
          <h2 className="font-serif text-2xl" id="ai-assistant-title">
            AI assistant
          </h2>
          {settingsLoading && !settings ? (
            <p className="mt-2 text-sm text-ink-soft">
              Loading assistant settings…
            </p>
          ) : null}
          {settings && !settings.enabled ? (
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              The assistant is not enabled on this instance.
            </p>
          ) : null}
          {settings?.enabled ? (
            <>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Bring your own OpenAI, xAI, or Google Gemini keys. Trium stores
                them encrypted on this instance and never shows them again.
              </p>
              <h3 className="mt-6 text-sm font-medium text-ink">In use</h3>
              {activeKey ? (
                <div className="mt-2">
                  <AiKeyItem
                    active
                    item={activeKey}
                    modelLabel={modelLabel(activeKey)}
                  />
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink-soft">No API key in use.</p>
              )}
              <button
                className="mt-5 w-full rounded-md bg-moss px-4 py-2.5 text-sm font-medium text-paper-raised hover:bg-moss-hover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending}
                onClick={openAddKeyForm}
                type="button"
              >
                Add API key
              </button>
              {keys.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {keys.map((item) => (
                    <li key={item.id}>
                      <AiKeyItem
                        active={item.id === settings.activeKeyId}
                        confirmingDelete={confirmingKeyId === item.id}
                        deleteError={
                          confirmingKeyId === item.id ? aiError : null
                        }
                        item={item}
                        modelLabel={modelLabel(item)}
                        onCancelDelete={() => {
                          setConfirmingKeyId(null);
                          setAiError(null);
                        }}
                        onConfirmDelete={() => void handleDeleteAi(item.id)}
                        onDelete={() => {
                          setConfirmingKeyId(item.id);
                          setAiError(null);
                        }}
                        onEdit={() => openEditKeyForm(item)}
                        onSelect={() => void handleActivateAi(item.id)}
                        pending={pending}
                        selectable
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
              {aiError && !confirmingKeyId && !keyFormOpen ? (
                <p
                  aria-live="assertive"
                  className="mt-3 text-sm text-rust"
                  role="alert"
                >
                  {aiError}
                </p>
              ) : null}
              {keyFormOpen ? (
                <Dialog
                  onClose={() => {
                    if (pendingAction !== "save-ai") {
                      closeKeyForm();
                    }
                  }}
                  title={editingExisting ? "Edit API key" : "Add API key"}
                >
                  <form onSubmit={(event) => void handleSaveAi(event)}>
                    <label className="block text-sm text-ink">
                      Provider
                      <select
                        className={fieldClassName}
                        disabled={pending}
                        onChange={(event) => {
                          const next = event.target.value as AiProvider;
                          setProvider(next);
                          setModel(settings.models[next]?.[0]?.id ?? "");
                        }}
                        value={provider}
                      >
                        {PROVIDERS.map((option) => (
                          <option key={option} value={option}>
                            {PROVIDER_LABELS[option]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-4 block text-sm text-ink">
                      Model
                      <select
                        className={fieldClassName}
                        disabled={pending || models.length === 0}
                        onChange={(event) => setModel(event.target.value)}
                        value={model}
                      >
                        {models.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-4 block text-sm text-ink">
                      API key
                      <input
                        autoComplete="off"
                        className={fieldClassName}
                        disabled={pending}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder={
                          editingExisting
                            ? "Paste a new key to replace the saved one"
                            : "Paste your API key"
                        }
                        type="password"
                        value={apiKey}
                      />
                    </label>
                    {aiError ? (
                      <p
                        aria-live="assertive"
                        className="mt-3 text-sm text-rust"
                        role="alert"
                      >
                        {aiError}
                      </p>
                    ) : null}
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        className="rounded-md border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={pending}
                        onClick={closeKeyForm}
                        type="button"
                      >
                        Cancel
                      </button>
                      <button
                        className="rounded-md bg-moss px-4 py-2 text-sm font-medium text-paper-raised hover:bg-moss-hover disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={pending}
                        type="submit"
                      >
                        {pendingAction === "save-ai" ? "Saving…" : "Save key"}
                      </button>
                    </div>
                  </form>
                </Dialog>
              ) : null}
            </>
          ) : null}
        </section>
        <section
          aria-labelledby="danger-zone-title"
          className="border-t border-line pt-8 md:col-start-2 md:row-start-2 md:mt-8"
        >
          <h2 className="font-serif text-2xl text-rust" id="danger-zone-title">
            Delete account
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            Permanently delete your account, all of its data, and every active
            session. This cannot be undone.
          </p>
          <button
            className="mt-5 rounded-md border border-rust/40 px-4 py-2 text-sm text-rust hover:bg-paper-raised disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending}
            onClick={() => {
              setConfirmingDelete(true);
              setError(null);
            }}
            type="button"
          >
            Delete my account
          </button>
          {confirmingDelete ? (
            <ConfirmDelete
              confirmLabel="Yes, delete my account"
              description="Choose cancel to keep your account and all of its data."
              error={error}
              onCancel={() => {
                setConfirmingDelete(false);
                setError(null);
              }}
              onConfirm={() => void handleDelete()}
              pending={pendingAction === "delete"}
              pendingLabel="Deleting account…"
              title="Delete your account permanently?"
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
