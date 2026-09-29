import { Popover } from '#primitives/Popover'
import { t } from '@dotpm/core'
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
  onPick: (path: string, newTab: boolean) => void
  onAllProjects: () => void
}

/** The current project's parent, siblings and children, searchable, with a way out to every project. */
export function renderProjectSwitcherPanel(parent: HTMLElement, props: ProjectSwitcherProps, close: () => void): void {
  const search = parent.createEl('input', {
    cls: 'pm-pop-field',
    attr: { placeholder: t('header.goToProject'), spellcheck: 'false' }
  })
  const list = parent.createDiv('pm-pop-list')
  const renderList = () => {
    list.empty()
    const query = search.value.trim().toLowerCase()
    for (const project of props.projects) {
      if (query && !project.title.toLowerCase().includes(query)) continue
      const row = renderOptionRow(list, {
        label: project.title,
        icon: project.isParent ? 'corner-left-up' : project.icon,
        color: project.isParent ? undefined : project.color,
        note: project.isParent ? t('header.parent') : undefined,
        selected: project.isCurrent,
        onPick: (e) => {
          close()
          if (!project.isCurrent) props.onPick(project.path, e.ctrlKey || e.metaKey)
        }
      })
      row.addClass('pm-switcher-row')
      row.setCssProps({ '--pm-depth': String(query ? 0 : project.depth) })
    }
  }
  search.addEventListener('input', renderList)
  renderList()

  renderOptionRow(parent, {
    label: t('scope.all'),
    icon: 'library',
    onPick: () => {
      close()
      props.onAllProjects()
    }
  }).addClass('pm-switcher-all')
}

/** The switcher in a popover under `anchor`, with its search field focused. */
export function openProjectSwitcher(anchor: HTMLElement, props: ProjectSwitcherProps): Popover {
  const pop = new Popover({ anchor, width: 280 })
  renderProjectSwitcherPanel(pop.contentEl, props, () => pop.close())
  pop.open()
  pop.contentEl.find('input.pm-pop-field')?.focus()
  return pop
}
