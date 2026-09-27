import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "../components/Dialog";
import { PANEL_SHORTCUT_PRIORITY, useShortcuts } from "./useShortcuts";

function Probe({
  onCreate,
  onSearch,
  onAssistant,
}: {
  onCreate: () => void;
  onSearch: () => void;
  onAssistant: () => void;
}) {
  const [open, setOpen] = useState(false);
  useShortcuts({ create: onCreate, "focus-assistant": onAssistant });
  useShortcuts({ "search-notes": onSearch }, PANEL_SHORTCUT_PRIORITY);

  return (
    <div>
      <input aria-label="Title" />
      <button onClick={() => setOpen(true)} type="button">
        Open dialog
      </button>
      {open ? (
        <Dialog onClose={() => setOpen(false)} title="Edit task">
          <p>Editing</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function press(key: string, target: Element = document.body) {
  fireEvent.keyDown(target, { key });
}

describe("useShortcuts", () => {
  it("ignores typing, modifiers, and an open dialog", () => {
    const onCreate = vi.fn();
    render(
      <Probe onAssistant={vi.fn()} onCreate={onCreate} onSearch={vi.fn()} />,
    );

    press("n", screen.getByRole("textbox", { name: "Title" }));
    press("n");
    expect(onCreate).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.body, { key: "n", ctrlKey: true });
    expect(onCreate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(screen.getByRole("dialog", { name: "Edit task" })).toBeInTheDocument();
    press("n");
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("lets a panel shortcut beat the same key registered globally", () => {
    const onSearch = vi.fn();
    const onAssistant = vi.fn();
    render(
      <Probe onAssistant={onAssistant} onCreate={vi.fn()} onSearch={onSearch} />,
    );

    press("/");

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onAssistant).not.toHaveBeenCalled();
  });
});
