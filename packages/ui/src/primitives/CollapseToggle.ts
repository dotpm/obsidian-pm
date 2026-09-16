import { t } from '@dotpm/core'
import { setIcon } from '#platform'

export interface CollapseToggleProps {
  collapsed: boolean
  onToggle: (e: MouseEvent) => unknown
  /** What is being collapsed, for the aria label. Defaults to subtasks. */
  subject?: string
}

export class CollapseToggle {
  el: HTMLElement

  constructor(parentEl: HTMLElement, props: CollapseToggleProps) {
    this.el = parentEl.createDiv({ cls: 'tree-item-icon collapse-icon pm-collapse-toggle' })
    setIcon(this.el, 'right-triangle')
    this.el.toggleClass('is-collapsed', props.collapsed)
    const subject = props.subject ?? t('collapse.subtasks')
    this.el.setAttr('aria-label', t(props.collapsed ? 'collapse.expand' : 'collapse.collapse', { subject }))
    this.el.addEventListener('click', props.onToggle)
  }
}
