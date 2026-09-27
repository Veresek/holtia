import { NavLink } from "react-router-dom";

import { Brand } from "./Brand";
import { Icon, type IconName } from "./Icon";
import { useOpenShortcuts } from "./ShortcutList";

const items: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/calendar", label: "Calendar", icon: "calendar" },
  { to: "/tasks", label: "Tasks", icon: "tasks" },
  { to: "/notes", label: "Notes", icon: "notes" },
];

const accountItem = {
  to: "/account",
  label: "Account",
  icon: "account" as const,
};

const NAV_COLLAPSED_KEY = "holtia.navCollapsed";
const navEase = "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]";
const labelEase = "duration-200 ease-out";

export function readNavCollapsed(): boolean {
  try {
    return window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeNavCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Private mode or blocked storage — keep the in-memory toggle.
  }
}

interface NavProps {
  mobile?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

function NavItem({
  item,
  mobile,
  collapsed,
}: {
  item: { to: string; label: string; icon: IconName; end?: boolean };
  mobile: boolean;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      title={collapsed && !mobile ? item.label : undefined}
      className={({ isActive }) =>
        [
          mobile
            ? "mx-0.5 my-1 flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-xs font-medium transition-colors"
            : [
                "flex items-center rounded-md py-3 transition-[padding,gap,color,background-color]",
                navEase,
                collapsed
                  ? "justify-center gap-0 px-2"
                  : "gap-3 px-3.5 text-base",
              ].join(" "),
          isActive
            ? "bg-paper text-moss"
            : "text-ink-soft hover:text-ink",
        ].join(" ")
      }
    >
      <Icon name={item.icon} className="size-5 shrink-0" />
      <span
        className={
          mobile
            ? "truncate"
            : [
                "overflow-hidden whitespace-nowrap transition-[max-width,opacity]",
                labelEase,
                collapsed
                  ? "max-w-0 opacity-0"
                  : "max-w-[9rem] truncate opacity-100",
              ].join(" ")
        }
      >
        {item.label}
      </span>
    </NavLink>
  );
}

export function Nav({
  mobile = false,
  collapsed = false,
  onCollapsedChange,
}: NavProps) {
  const openShortcuts = useOpenShortcuts();
  const allItems = [...items, accountItem];

  return (
    <nav
      aria-label={mobile ? "Mobile navigation" : "Primary navigation"}
      className={
        mobile
          ? "grid h-16 grid-cols-5 border-t border-line bg-paper-deep px-1 pb-[env(safe-area-inset-bottom)] md:hidden"
          : [
              "relative hidden shrink-0 flex-col overflow-hidden border-r border-line bg-paper-deep py-5 md:flex",
              "transition-[width,padding] motion-reduce:transition-none",
              navEase,
              collapsed ? "w-16 px-2" : "w-64 px-5",
            ].join(" ")
      }
    >
      {!mobile && (
        <div
          className={[
            "relative mb-10 transition-[min-height]",
            navEase,
            collapsed ? "min-h-[5.25rem]" : "min-h-9 px-2",
          ].join(" ")}
        >
          <div
            className={[
              "flex",
              collapsed ? "justify-center" : "justify-start",
            ].join(" ")}
          >
            <Brand compact={collapsed} />
          </div>
          {onCollapsedChange ? (
            <button
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={[
                "absolute z-10 flex size-9 items-center justify-center rounded-md text-ink-soft transition-[top,left,right,transform,color] hover:text-ink motion-reduce:transition-none",
                navEase,
                collapsed
                  ? "top-12 left-1/2 -translate-x-1/2"
                  : "top-0 right-2 translate-x-0",
              ].join(" ")}
              onClick={() => onCollapsedChange(!collapsed)}
              type="button"
            >
              <Icon
                className={[
                  "size-4 transition-transform motion-reduce:transition-none",
                  navEase,
                  collapsed ? "rotate-180" : "rotate-0",
                ].join(" ")}
                name="chevronLeft"
              />
            </button>
          ) : null}
        </div>
      )}

      <div className={mobile ? "contents" : "flex flex-col gap-1"}>
        {(mobile ? allItems : items).map((item) => (
          <NavItem
            collapsed={collapsed}
            item={item}
            key={item.to}
            mobile={mobile}
          />
        ))}
      </div>

      {!mobile && (
        <div
          className={[
            "mt-auto flex gap-1",
            collapsed ? "flex-col items-center" : "items-center",
          ].join(" ")}
        >
          <div className={collapsed ? "w-full" : "min-w-0 flex-1"}>
            <NavItem collapsed={collapsed} item={accountItem} mobile={false} />
          </div>
          <button
            aria-label="Keyboard shortcuts"
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line text-sm text-ink-soft hover:text-ink"
            onClick={openShortcuts}
            title="Keyboard shortcuts"
            type="button"
          >
            ?
          </button>
        </div>
      )}
    </nav>
  );
}
