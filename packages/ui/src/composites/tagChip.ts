import { stringToColor, t } from '@dotpm/core'
import { Chip } from '#primitives/Chip'

/** A tag taken from an ancestor is drawn dashed and muted, so it reads as not the task's own. */
export function renderTagChip(parent: HTMLElement, tag: string, colored: boolean, inherited = false): Chip {
  const chip = new Chip(parent).setLabel(tag).setVariant('outline').setTag()
  if (colored) chip.setDot(true).setColor(stringToColor(tag))
  if (inherited) chip.setInherited(t('chip.inheritedTooltip'))
  return chip
}
