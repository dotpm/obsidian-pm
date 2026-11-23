import {
  type PriorityConfig,
  type PriorityIconSet,
  type TaskPriority,
  getPriorityConfig,
  priorityIcon
} from '@dotpm/core'
import { setIcon, setTooltip } from '#platform'
import { isIconName } from '#icons'

/** What a priority looks like as a lone icon: its glyph, its color, and its name for the tooltip. */
export interface PriorityIndicator {
  icon: string
  color: string
  label: string
}

/** Undefined where the priority has no icon, so a scale past the icon set shows nothing. */
export function priorityIndicatorOf(
  priorities: PriorityConfig[],
  id: TaskPriority,
  iconSet: PriorityIconSet
): PriorityIndicator | undefined {
  const icon = priorityIcon(priorities, id, iconSet)
  if (!icon) return undefined
  const config = getPriorityConfig(priorities, id)
  return { icon, color: config?.color ?? 'var(--text-muted)', label: config?.label ?? id }
}

export function renderPriorityIndicator(parent: HTMLElement, indicator: PriorityIndicator): HTMLElement {
  const el = parent.createSpan({ cls: 'pm-priority-indicator' })
  el.setCssStyles({ color: indicator.color })
  el.setAttribute('aria-label', indicator.label)
  if (isIconName(indicator.icon)) setIcon(el, indicator.icon)
  else el.setText(indicator.icon)
  setTooltip(el, indicator.label)
  return el
}
