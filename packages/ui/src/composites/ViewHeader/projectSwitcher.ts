import { Checkbox } from '#primitives/Checkbox'
import { Popover } from '#primitives/Popover'
import { t } from '@dotpm/core'
import { renderPopSearch } from '../popoverParts'
import { renderOptionRow } from '../properties/optionList'

export interface SwitcherProject {
  path: string
  title: string
  icon?: string
  color?: string
  /** 0 for the parent and the siblings, 1 for the current project's children. */
  depth: number
  isParent?: boolean
  isCurrent?: boolean
}

export interface ProjectSwitcherProps {
  projects: SwitcherProject[]
  /** Searched instead of `projects` while the field holds a query. */
  searchable?: SwitcherProject[]
  /**
   * The paths of the projects in view. When set, each row gets a checkbox that adds its
   * project to this set or takes it out, edited in place; the last one can't be unchecked.
   */
  shown?: Set<string>
  onPick: (path: string, newTab: boolean) => void
  onAllProjects: () => void
}

/** The current project's parent, siblings and children, searchable, with a way out to every project. */
export function renderProjectSwitcherPanel(parent: HTMLElement, props: ProjectSwitcherProps, close: () => void): void {
  const search = renderPopSearch(parent, t('header.goToProject'), () => renderList())
  const list = parent.createDiv('pm-pop-list')
  const renderList = () => {
    list.empty()
    const query = search.value.trim().toLowerCase()
    const projects = query ? (props.searchable ?? props.projects) : props.projects
    for (const project of projects) {
      if (query && !project.title.toLowerCase().includes(query)) continue
      const line = props.shown ? list.createDiv('pm-switcher-line') : list
      if (props.shown) renderShownBox(line, project, props.shown)
      const row = renderOptionRow(line, {
        label: project.title,
        icon: project.isParent ? 'corner-left-up' : project.icon,
        color: project.isParent ? undefined : project.color,
        note: project.isParent ? t('header.parent') : undefined,
        selected: project.isCurrent,
        onPick: (e) => {
          if (!project.isCurrent) props.onPick(project.path, e.ctrlKey || e.metaKey)
          close()
        }
      })
      row.addClass('pm-switcher-row')
      const indented = props.shown ? line : row
      indented.setCssProps({ '--pm-depth': String(query ? 0 : project.depth) })
    }
  }
  renderList()

  renderOptionRow(parent, {
    label: t('scope.all'),
    icon: 'library',
    onPick: () => {
      props.onAllProjects()
      close()
    }
  }).addClass('pm-switcher-all', 'pm-pop-section')
}

function renderShownBox(parent: HTMLElement, project: SwitcherProject, shown: Set<string>): void {
  const box = new Checkbox(parent)
    .setChecked(shown.has(project.path))
    .setAriaLabel(t('header.showProject', { title: project.title }))
    .onChange((checked) => {
      if (checked) shown.add(project.path)
      else if (shown.size > 1) shown.delete(project.path)
      else box.setChecked(true)
    })
}

/**
 * The switcher in a popover under `anchor`, with its search field focused. With `shown`,
 * `onShow` gets the checked paths when it closes, unless they're unchanged or a row was picked.
 */
export function openProjectSwitcher(
  anchor: HTMLElement,
  props: ProjectSwitcherProps & { onShow?: (paths: string[]) => void }
): Popover {
  const before = props.shown ? [...props.shown] : []
  let picked = false
  const onClose = (): void => {
    const shown = props.shown
    if (picked || !shown || !props.onShow) return
    if (shown.size === before.length && before.every((path) => shown.has(path))) return
    const added = [...shown].filter((path) => !before.includes(path))
    props.onShow([...before.filter((path) => shown.has(path)), ...added])
  }
  const pop = Popover.show({ anchor, width: 280, onClose }, (el, close) =>
    renderProjectSwitcherPanel(
      el,
      {
        ...props,
        onPick: (path, newTab) => {
          picked = true
          props.onPick(path, newTab)
        },
        onAllProjects: () => {
          picked = true
          props.onAllProjects()
        }
      },
      close
    )
  )
  pop.contentEl.find('input.pm-pop-field')?.focus()
  return pop
}
