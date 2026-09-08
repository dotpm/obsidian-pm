import { setIcon } from './platform'

const iconNameCache = new Map<string, boolean>()

/** True for a Lucide id like 'flame', false for emoji or plain text. */
export function isIconName(icon: string): boolean {
  let known = iconNameCache.get(icon)
  if (known === undefined) {
    const probe = createSpan()
    setIcon(probe, icon)
    known = probe.childElementCount > 0
    iconNameCache.set(icon, known)
  }
  return known
}

/** "🔴 Critical". Named icons drop out; they can't render as text, so callers use setIcon. */
export function formatBadgeText(icon: string | undefined, label: string): string {
  if (icon && isIconName(icon)) return label
  return [icon, label].filter(Boolean).join(' ')
}
