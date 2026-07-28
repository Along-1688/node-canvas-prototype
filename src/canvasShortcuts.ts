export const CANVAS_SHORTCUT_ISOLATION_SELECTOR = '[data-isolate-canvas-shortcuts="true"]'

export function areCanvasShortcutsIsolated(root: ParentNode = document) {
  return Boolean(root.querySelector(CANVAS_SHORTCUT_ISOLATION_SELECTOR))
}

export function isCanvasShortcutTargetInteractive(target: EventTarget | null) {
  return target instanceof HTMLElement
    && target.matches('input, textarea, select, button, a, summary, [contenteditable="true"], [role="button"], [role="menuitem"], [role="option"]')
}

export function isPlaylistDeleteShortcutTarget(target: EventTarget | null, key: string) {
  if (key !== 'Delete' && key !== 'Backspace') return false
  if (!(target instanceof HTMLElement)) return false
  if (target.matches('input, textarea, select, [contenteditable="true"]')) return false
  return Boolean(target.closest('.canvas-playlist'))
}
