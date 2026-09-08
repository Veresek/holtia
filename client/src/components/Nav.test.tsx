import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Nav } from "./Nav";
import { renderWithRouter } from "../test/render";

describe("Nav", () => {
  it("puts Account after the main panels on the desktop sidebar", () => {
    renderWithRouter(<Nav />);

    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    const labels = [...navigation.querySelectorAll("a")]
      .map((link) => link.textContent?.replace("Holtia", "").trim())
      .filter(Boolean);

    expect(labels).toEqual(["Home", "Calendar", "Tasks", "Notes", "Account"]);
  });

  it("labels mobile navigation and marks the active panel clearly", () => {
    renderWithRouter(<Nav mobile />, { route: "/tasks" });

    const navigation = screen.getByRole("navigation", {
      name: "Mobile navigation",
    });
    const active = screen.getByRole("link", { name: "Tasks" });

    expect(navigation).toBeInTheDocument();
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveClass("bg-paper", "text-moss");
  });
});
