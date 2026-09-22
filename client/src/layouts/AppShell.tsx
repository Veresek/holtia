import { useState } from "react";
import { Outlet } from "react-router-dom";

import { AiBar } from "../components/AiBar";
import {
  Nav,
  readNavCollapsed,
  writeNavCollapsed,
} from "../components/Nav";
import { OfflineBanner } from "../components/OfflineBanner";
import { AiSettingsProvider } from "../hooks/useAiSettings";

export function AppShell() {
  const [navCollapsed, setNavCollapsed] = useState(readNavCollapsed);

  function handleNavCollapsedChange(collapsed: boolean) {
    setNavCollapsed(collapsed);
    writeNavCollapsed(collapsed);
  }

  return (
    <AiSettingsProvider>
      <div className="flex h-dvh overflow-hidden bg-paper text-ink">
        <a
          className="fixed left-4 top-4 z-50 -translate-y-20 rounded-md bg-moss px-4 py-2 text-sm font-medium text-paper-raised transition-transform focus:translate-y-0"
          href="#main-content"
        >
          Skip to content
        </a>
        <Nav
          collapsed={navCollapsed}
          onCollapsedChange={handleNavCollapsedChange}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <OfflineBanner />
          <AiBar />
          <main
            className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-20 md:pb-0"
            id="main-content"
            tabIndex={-1}
          >
            <Outlet />
          </main>
        </div>
        <div className="fixed inset-x-0 bottom-0 z-20 md:hidden">
          <Nav mobile />
        </div>
      </div>
    </AiSettingsProvider>
  );
}
