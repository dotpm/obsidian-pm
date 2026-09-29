import { Popover } from '#primitives/Popover'
import { type ProjectListFilter, type ProjectProgress, PROJECT_PROGRESS, countProjectFilters, t } from '@dotpm/core'
import { renderOptionRow } from '../properties/optionList'

export interface ProjectFilterProps {
  /** Edited in place. */
  filter: ProjectListFilter
  /** How many projects are at each stage, for the counts beside them. */
  progress: Record<ProjectProgress, number>
  tags: { tag: string; count: number }[]
  onChange: () => void
}

const progressLabel = (stage: ProjectProgress): string =>
  ({
    'not-started': t('projectFilter.notStarted'),
    'in-progress': t('projectFilter.inProgress'),
    complete: t('projectFilter.complete')
  })[stage]

/** The project list's filter: a checklist of progress stages and one of tags, each with its project count. */
export function openProjectFilterPopover(anchor: HTMLElement, props: ProjectFilterProps): Popover {
  const pop = new Popover({ anchor, width: 260 })
  const body = pop.contentEl.createDiv('pm-project-filter')
  const { filter } = props

  /** `list` with `value` added, or taken out when it was there; undefined once empty. */
  const toggled = <T extends string>(list: T[] | undefined, value: T): T[] | undefined => {
    const next = list?.includes(value) ? list.filter((entry) => entry !== value) : [...(list ?? []), value]
    return next.length ? next : undefined
  }
  const changed = (): void => {
    if (!filter.tags) Reflect.deleteProperty(filter, 'tags')
    if (!filter.progress) Reflect.deleteProperty(filter, 'progress')
    render()
    props.onChange()
  }

  const render = (): void => {
    body.empty()
    const head = body.createDiv('pm-sort-pop-head')
    head.createSpan({ cls: 'pm-pop-heading', text: t('columns.progress') })
    const clear = head.createEl('button', { cls: 'pm-sort-pop-reset', text: t('filter.clearAll') })
    clear.disabled = countProjectFilters(filter) === 0
    clear.addEventListener('click', () => {
      filter.tags = undefined
      filter.progress = undefined
      changed()
    })
    for (const stage of PROJECT_PROGRESS) {
      renderOptionRow(body, {
        label: progressLabel(stage),
        note: String(props.progress[stage]),
        selected: filter.progress?.includes(stage) ?? false,
        onPick: () => {
          filter.progress = toggled(filter.progress, stage)
          changed()
        }
      })
    }

    body.createDiv({ cls: 'pm-pop-heading pm-project-filter-head', text: t('taskForm.tags') })
    if (!props.tags.length) body.createDiv({ cls: 'pm-pop-empty', text: t('projectFilter.noTags') })
    for (const { tag, count } of props.tags) {
      renderOptionRow(body, {
        label: `#${tag}`,
        note: String(count),
        selected: filter.tags?.includes(tag) ?? false,
        onPick: () => {
          filter.tags = toggled(filter.tags, tag)
          changed()
        }
      })
    }
  }

  render()
  pop.open()
  return pop
}
