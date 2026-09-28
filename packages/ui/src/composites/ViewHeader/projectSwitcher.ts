import { setIcon } from '#platform'
import { Popover } from '#primitives/Popover'
import { t } from '@dotpm/core'
import { renderGlyph } from '../properties/optionList'

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
export function openProjectSwitcher(anchor: HTMLElement, props: ProjectSwitcherProps): Popover {
  const pop = new Popover({ anchor, width: 280 })
  const search = pop.contentEl.createEl('input', {
    cls: 'pm-pop-field',
    attr: { placeholder: t('header.goToProject'), spellcheck: 'false' }
  })
  const list = pop.contentEl.createDiv('pm-pop-list')
  const renderList = () => {
    list.empty()
    const query = search.value.trim().toLowerCase()
    for (const project of props.projects) {
      if (query && !project.title.toLowerCase().includes(query)) continue
      const row = list.createEl('button', { cls: 'pm-pop-item pm-switcher-row' })
      row.setCssProps({ '--depth': String(query ? 0 : project.depth) })
      if (project.isParent) setIcon(row.createSpan('pm-switcher-glyph'), 'corner-left-up')
      else renderGlyph(row.createSpan('pm-switcher-glyph'), { icon: project.icon, color: project.color })
      row.createSpan({ cls: 'pm-pop-item-label', text: project.title })
      if (project.isParent) row.createSpan({ cls: 'pm-switcher-note', text: t('header.parent') })
      const check = row.createSpan({ cls: 'pm-pop-check' })
      setIcon(check, 'check')
      if (!project.isCurrent) check.addClass('pm-pop-check--hidden')
      row.addEventListener('click', (e) => {
        pop.close()
        if (!project.isCurrent) props.onPick(project.path, e.ctrlKey || e.metaKey)
      })
    }
  }
  search.addEventListener('input', renderList)
  renderList()

  const all = pop.contentEl.createEl('button', { cls: 'pm-pop-item pm-switcher-all' })
  setIcon(all.createSpan('pm-switcher-glyph'), 'library')
  all.createSpan({ cls: 'pm-pop-item-label', text: t('scope.all') })
  all.addEventListener('click', () => {
    pop.close()
    props.onAllProjects()
  })
  pop.open()
  search.focus()
  return pop
}
