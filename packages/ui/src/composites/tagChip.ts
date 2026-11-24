import { stringToColor } from '@dotpm/core'
import { Chip } from '#primitives/Chip'

/**
 * A tag taken from an ancestor swaps the colored dot for a "passed down" arrow in the same
 * color and is drawn dashed and italic, so it reads as not the task's own at a glance.
 */
export function renderTagChip(parent: HTMLElement, tag: string, colored: boolean, inherited = false): Chip {
  const chip = new Chip(parent).setLabel(tag).setVariant('outline').setTag()
  if (colored) chip.setColor(stringToColor(tag))
  if (inherited) chip.setLeadingIcon('corner-down-right').setInherited()
  else if (colored) chip.setDot(true)
  return chip
}
