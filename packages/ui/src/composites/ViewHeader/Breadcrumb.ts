import { createMenu, setIcon, setTooltip } from '#platform'
import { showMenuBelow } from '#dom'
import { renderGlyph } from '../properties/optionList'

export interface CrumbAncestor {
  title: string
  /** `newTab` is set when the reader held the modifier key. */
  onOpen: (newTab: boolean) => void
}

export interface CrumbMode {
  icon: string
  label: string
  tooltip: string
  onOpen: (anchor: HTMLElement) => void
}

export interface BreadcrumbProps {
  icon?: string
  color?: string
  ancestors: CrumbAncestor[]
  title: string
  /** A short count after the title, such as "+3" for the sub-projects in view. */
  badge?: string
  /** Tints the title, for a view whose projects a parent path can't describe. */
  scoped?: boolean
  /** Given, the title opens a switcher anchored to it. */
  onSwitch?: (anchor: HTMLElement) => void
  switchLabel?: string
  foldLabel: string
  mode?: CrumbMode
}

/**
 * Where the reader is and how they are looking at it: the ancestors, the current title,
 * and the view mode as the last crumb. A view of several projects shows a `scoped` title
 * with no ancestors instead. Under `.pm-vh--terse` the mode keeps only its icon and
 * under `.pm-vh--bare` it goes, and under `.pm-vh--folded` the ancestors collapse into one
 * button that lists them in a menu.
 */
export function renderBreadcrumb(parent: HTMLElement, props: BreadcrumbProps): HTMLElement {
  const nav = parent.createEl('nav', { cls: 'pm-crumbs' })
  const lead = nav.createSpan('pm-crumbs-glyph')
  renderGlyph(lead, { icon: props.icon, color: props.color })

  if (props.ancestors.length) {
    const fold = nav.createEl('button', { cls: 'pm-crumb pm-crumb-fold', attr: { 'aria-label': props.foldLabel } })
    setIcon(fold, 'ellipsis')
    setTooltip(fold, props.foldLabel)
    fold.addEventListener('click', () => {
      const menu = createMenu()
      for (const ancestor of props.ancestors) {
        menu.addItem((item) =>
          item
            .setTitle(ancestor.title)
            .setIcon('corner-left-up')
            .onClick((e) => ancestor.onOpen(e instanceof MouseEvent && (e.ctrlKey || e.metaKey)))
        )
      }
      showMenuBelow(menu, fold)
    })
    appendSeparator(nav, 'pm-crumb-fold-sep')

    const list = nav.createSpan('pm-crumb-ancestors')
    for (const ancestor of props.ancestors) {
      const crumb = list.createEl('button', { cls: 'pm-crumb pm-crumb--ancestor', text: ancestor.title })
      crumb.addEventListener('click', (e) => ancestor.onOpen(e.ctrlKey || e.metaKey))
      appendSeparator(list)
    }
  }

  const current = nav.createEl('button', { cls: 'pm-crumb pm-crumb--current' })
  current.toggleClass('pm-crumb--scoped', !!props.scoped)
  current.createSpan({ cls: 'pm-crumb-title', text: props.title })
  if (props.badge) current.createSpan({ cls: 'pm-crumb-badge', text: props.badge })
  if (props.onSwitch) {
    const onSwitch = props.onSwitch
    setIcon(current.createSpan('pm-crumb-chevron'), 'chevron-down')
    if (props.switchLabel) setTooltip(current, props.switchLabel)
    current.addEventListener('click', () => onSwitch(current))
  } else {
    current.disabled = true
  }

  if (props.mode) {
    const mode = props.mode
    appendSeparator(nav, 'pm-crumb-mode-sep')
    const crumb = nav.createEl('button', { cls: 'pm-crumb pm-crumb--mode', attr: { 'aria-label': mode.tooltip } })
    setIcon(crumb.createSpan('pm-crumb-icon'), mode.icon)
    crumb.createSpan({ cls: 'pm-crumb-mode-label', text: mode.label })
    setIcon(crumb.createSpan('pm-crumb-chevron'), 'chevron-down')
    setTooltip(crumb, mode.tooltip)
    crumb.addEventListener('click', () => mode.onOpen(crumb))
  }
  return nav
}

function appendSeparator(parent: HTMLElement, cls?: string): void {
  const sep = parent.createSpan({ cls: ['pm-crumb-sep', ...(cls ? [cls] : [])] })
  setIcon(sep, 'chevron-right')
}
