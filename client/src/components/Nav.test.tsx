import { useState } from "react";
import { fireEvent, screen } from "@testing-library/react";
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

  it("collapses the desktop sidebar to an icon rail", () => {
    function Harness() {
      const [collapsed, setCollapsed] = useState(false);
      return (
        <Nav collapsed={collapsed} onCollapsedChange={setCollapsed} />
      );
    }

    renderWithRouter(<Harness />);

    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(navigation).toHaveClass("w-64");
    expect(screen.getByText("Holtia")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tasks" })).toHaveTextContent(
      "Tasks",
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toHaveClass("w-16");
    expect(screen.queryByText("Holtia")).not.toBeInTheDocument();
    const tasksLink = screen.getByRole("link", { name: "Tasks" });
    expect(tasksLink.querySelector(".sr-only")).toHaveTextContent("Tasks");
    expect(tasksLink.querySelector(".truncate")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});
