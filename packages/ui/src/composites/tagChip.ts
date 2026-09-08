import { stringToColor } from '@dotpm/core'
import { Chip } from '../primitives/Chip'

export function renderTagChip(parent: HTMLElement, tag: string, colored: boolean): Chip {
  const chip = new Chip(parent).setLabel(tag).setVariant('outline').setTag()
  if (colored) chip.setDot(true).setColor(stringToColor(tag))
  return chip
}
