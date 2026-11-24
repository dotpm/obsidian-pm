import type { InheritedShare } from '@dotpm/core'
import { setIcon } from '#platform'

/**
 * Marks a value an ancestor contributes, the way an inherited tag is marked: an arrow in
 * front and, when the whole value is inherited, italics. A list that only gains entries
 * from ancestors gets the arrow alone, since part of it is the task's own.
 */
export function markInherited(el: HTMLElement, share: InheritedShare): void {
  if (share === 'none') return
  el.addClass('pm-inherited')
  el.toggleClass('pm-inherited--full', share === 'full')
  const arrow = el.createSpan({ cls: 'pm-inherited-arrow' })
  setIcon(arrow, 'corner-down-right')
  el.prepend(arrow)
}
