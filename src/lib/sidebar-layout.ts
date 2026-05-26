export const SIDEBAR_COLLAPSED_STORAGE_KEY = "aria-sidebar-collapsed";

export function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function storeSidebarCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      collapsed ? "true" : "false"
    );
  } catch {
    // Ignore storage failures.
  }
}

export const SIDEBAR_WIDTH = "16rem";
