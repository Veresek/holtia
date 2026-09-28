import { useState, type ReactElement } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Nav } from "./Nav";
import { ShortcutListProvider } from "./ShortcutList";
import { renderWithRouter } from "../test/render";

function renderNav(ui: ReactElement, route = "/") {
	return renderWithRouter(<ShortcutListProvider>{ui}</ShortcutListProvider>, {
		route,
	});
}

describe("Nav", () => {
	it("puts Account after the main panels on the desktop sidebar", () => {
		renderNav(<Nav />);

		const navigation = screen.getByRole("navigation", {
			name: "Primary navigation",
		});
		const labels = [...navigation.querySelectorAll("a")]
			.map(link => link.textContent?.replace("Holtia", "").trim())
			.filter(Boolean);

		expect(labels).toEqual(["Home", "Calendar", "Tasks", "Notes", "Account"]);
	});

	it("labels mobile navigation and marks the active panel clearly", () => {
		renderNav(<Nav mobile />, "/tasks");

		const navigation = screen.getByRole("navigation", {
			name: "Mobile navigation",
		});
		const active = screen.getByRole("link", { name: "Tasks" });

		expect(navigation).toBeInTheDocument();
		expect(active).toHaveAttribute("aria-current", "page");
		expect(active).toHaveClass("bg-paper", "text-moss");
		expect(
			screen.queryByRole("button", { name: "Keyboard shortcuts" }),
		).not.toBeInTheDocument();
	});

	it("collapses the desktop sidebar to an icon rail", () => {
		function Harness() {
			const [collapsed, setCollapsed] = useState(false);
			return <Nav collapsed={collapsed} onCollapsedChange={setCollapsed} />;
		}

		renderNav(<Harness />);

		const navigation = screen.getByRole("navigation", {
			name: "Primary navigation",
		});
		expect(navigation).toHaveClass("w-64");
		const wordmark = screen.getByText("Holtia");
		expect(wordmark).toHaveClass("opacity-100");
		expect(wordmark).not.toHaveAttribute("aria-hidden");
		expect(screen.queryByText("Collapse")).not.toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Tasks" })).toHaveTextContent(
			"Tasks",
		);

		fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

		expect(
			screen.getByRole("navigation", { name: "Primary navigation" }),
		).toHaveClass("w-16");
		expect(wordmark).toHaveClass("opacity-0", "max-w-0");
		expect(wordmark).toHaveAttribute("aria-hidden", "true");
		const tasksLink = screen.getByRole("link", { name: "Tasks" });
		expect(tasksLink).toHaveTextContent("Tasks");
		expect(tasksLink.querySelector(".sr-only")).toBeNull();
		expect(
			screen.getByRole("button", { name: "Expand sidebar" }),
		).toHaveAttribute("aria-expanded", "false");
		expect(
			screen.getByRole("button", { name: "Keyboard shortcuts" }),
		).toBeInTheDocument();
	});

	it("opens the shortcut list from the desktop sidebar", async () => {
		renderNav(<Nav />);

		const shortcutsButton = screen.getByRole("button", {
			name: "Keyboard shortcuts",
		});
		fireEvent.click(shortcutsButton);

		expect(
			await screen.findByRole("dialog", { name: "Keyboard shortcuts" }),
		).toBeInTheDocument();
		expect(screen.getByText("Go to Home")).toBeInTheDocument();
		expect(shortcutsButton).toHaveClass("bg-paper", "text-moss");

		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		expect(shortcutsButton).not.toHaveClass("bg-paper", "text-moss");
	});
});
