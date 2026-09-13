import { setIcon } from '#platform'
import { t } from '@dotpm/core'

export interface CollapseToggleProps {
  collapsed: boolean
  onToggle: (e: MouseEvent) => unknown
  /** What is being collapsed, as a translatable key for the aria label. Defaults to Subtasks. */
  subject?: string
}

export class CollapseToggle {
  el: HTMLElement

  constructor(parentEl: HTMLElement, props: CollapseToggleProps) {
    this.el = parentEl.createDiv({ cls: 'tree-item-icon collapse-icon pm-collapse-toggle' })
    setIcon(this.el, 'right-triangle')
    this.el.toggleClass('is-collapsed', props.collapsed)
    const subject = props.subject ?? 'Subtasks'
    this.el.setAttr(
      'aria-label',
      t('{action} {subject}', {
        action: props.collapsed ? t('Expand') : t('Collapse'),
        subject: t(subject)
      })
    )
    this.el.addEventListener('click', props.onToggle)
  }
}
