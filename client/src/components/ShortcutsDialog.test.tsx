import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SHORTCUTS } from "../shortcuts";
import { ShortcutsDialog } from "./ShortcutsDialog";

describe("ShortcutsDialog", () => {
  it("lists every shortcut from the catalog", () => {
    render(<ShortcutsDialog onClose={() => {}} />);

    expect(
      screen.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeInTheDocument();
    for (const shortcut of SHORTCUTS) {
      expect(screen.getByText(shortcut.label)).toBeInTheDocument();
    }
    const expected = new Map<string, number>();
    for (const shortcut of SHORTCUTS) {
      expected.set(
        shortcut.keysLabel,
        (expected.get(shortcut.keysLabel) ?? 0) + 1,
      );
    }
    for (const [label, count] of expected) {
      expect(screen.getAllByText(label)).toHaveLength(count);
    }
  });
});
