import { NavLink } from "react-router-dom";

import { Brand } from "./Brand";
import { Icon, type IconName } from "./Icon";

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
          "transition-colors",
          mobile
            ? "mx-0.5 my-1 flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-xs font-medium"
            : collapsed
              ? "flex items-center justify-center rounded-md px-2 py-3"
              : "flex items-center gap-3 rounded-md px-3.5 py-3 text-base",
          isActive
            ? "bg-paper text-moss"
            : "text-ink-soft hover:text-ink",
        ].join(" ")
      }
    >
      <Icon name={item.icon} className="size-5" />
      {collapsed && !mobile ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="truncate">{item.label}</span>
      )}
    </NavLink>
  );
}

export function Nav({
  mobile = false,
  collapsed = false,
  onCollapsedChange,
}: NavProps) {
  const allItems = [...items, accountItem];

  return (
    <nav
      aria-label={mobile ? "Mobile navigation" : "Primary navigation"}
      className={
        mobile
          ? "grid h-16 grid-cols-5 border-t border-line bg-paper-deep px-1 pb-[env(safe-area-inset-bottom)] md:hidden"
          : [
              "hidden shrink-0 flex-col border-r border-line bg-paper-deep md:flex",
              collapsed ? "w-16 px-2 py-5" : "w-64 p-5",
            ].join(" ")
      }
    >
      {!mobile && (
        <div
          className={[
            "mb-10",
            collapsed ? "flex flex-col items-center gap-3" : "px-2",
          ].join(" ")}
        >
          <Brand compact={collapsed} />
          {onCollapsedChange ? (
            <button
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={[
                "rounded-md border border-line text-ink-soft transition-colors hover:border-lichen hover:text-ink",
                collapsed
                  ? "flex size-9 items-center justify-center"
                  : "mt-3 flex w-full items-center justify-center gap-2 px-3 py-2 text-sm",
              ].join(" ")}
              onClick={() => onCollapsedChange(!collapsed)}
              type="button"
            >
              <Icon
                name={collapsed ? "chevronRight" : "chevronLeft"}
                className="size-4"
              />
              {collapsed ? null : <span>Collapse</span>}
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
        <div className="mt-auto">
          <NavItem
            collapsed={collapsed}
            item={accountItem}
            mobile={false}
          />
        </div>
      )}
    </nav>
  );
}
