/** Switches to the Settings tab (AppShell follows the URL hash). Callers close their own sheet first. */
export function openSettings() {
  window.location.hash = '#/settings'
}
