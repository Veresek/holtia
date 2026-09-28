import { createContext, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useShortcuts } from "../hooks/useShortcuts";
import { ShortcutsDialog } from "./ShortcutsDialog";

interface ShortcutListContextValue {
	open: boolean;
	openShortcuts: () => void;
}

const ShortcutListContext = createContext<ShortcutListContextValue | null>(
	null,
);

export function ShortcutListProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const navigate = useNavigate();
	const openShortcuts = () => setOpen(true);
	useShortcuts({
		help: () => setOpen(true),
		"go-home": () => navigate("/"),
		"go-calendar": () => navigate("/calendar"),
		"go-tasks": () => navigate("/tasks"),
		"go-notes": () => navigate("/notes"),
		"go-account": () => navigate("/account"),
	});

	return (
		<ShortcutListContext.Provider value={{ open, openShortcuts }}>
			{children}
			{open ? <ShortcutsDialog onClose={() => setOpen(false)} /> : null}
		</ShortcutListContext.Provider>
	);
}

export function useOpenShortcuts() {
	const shortcuts = useContext(ShortcutListContext);
	if (!shortcuts) {
		throw new Error(
			"useOpenShortcuts must be used within ShortcutListProvider.",
		);
	}
	return shortcuts.openShortcuts;
}

export function useShortcutsOpen() {
	const shortcuts = useContext(ShortcutListContext);
	if (!shortcuts) {
		throw new Error(
			"useShortcutsOpen must be used within ShortcutListProvider.",
		);
	}
	return shortcuts.open;
}
