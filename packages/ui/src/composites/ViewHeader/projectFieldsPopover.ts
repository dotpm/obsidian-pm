import { ChipButton } from '#primitives/ChipButton'
import { Popover } from '#primitives/Popover'
import { type ProjectListField, PROJECT_LIST_FIELDS, t, withFieldShown } from '@dotpm/core'
import { renderPopHead } from '../popoverParts'
import { renderVisibilityList } from '../visibilityList'

export interface ProjectFieldsProps {
  /** The columns shown after the title, in order. */
  shown: ProjectListField[]
  onChange: (shown: ProjectListField[]) => void
}

export const projectFieldLabel = (field: ProjectListField): string =>
  ({
    progress: t('columns.progress'),
    tasks: t('columns.tasks'),
    members: t('columns.members'),
    due: t('columns.due')
  })[field]

const asFields = (ids: string[]): ProjectListField[] =>
  ids.flatMap((id) => PROJECT_LIST_FIELDS.filter((field) => field === id))

/** The project list's columns: the shown ones dragged to reorder, the hidden ones under them, and Show all. */
export function renderProjectFieldsPanel(parent: HTMLElement, props: ProjectFieldsProps): void {
  const body = parent.createDiv('pm-fields-pop')
  let shown = [...props.shown]

  const set = (next: ProjectListField[]): void => {
    shown = next
    props.onChange(next)
    render()
  }
  const toggle = (id: string): void => {
    const [field] = asFields([id])
    set(
      shown.includes(field)
        ? shown.filter((other) => other !== field)
        : withFieldShown(shown, field, PROJECT_LIST_FIELDS)
    )
  }
  const lists = { showLabel: t('header.showField'), hideLabel: t('header.hideField'), onToggle: toggle }

  const render = (): void => {
    body.empty()
    renderVisibilityList(body, {
      ...lists,
      rows: [
        { id: 'project', label: t('columns.project'), hidden: false, locked: true },
        ...shown.map((id) => ({ id, label: projectFieldLabel(id), hidden: false }))
      ],
      lockedLabel: t('header.lockedField'),
      onReorder: (ids) => set(asFields(ids))
    })

    const hidden = PROJECT_LIST_FIELDS.filter((field) => !shown.includes(field))
    if (hidden.length) {
      renderPopHead(body, { title: t('header.hiddenFields'), section: true })
      renderVisibilityList(body, {
        ...lists,
        rows: hidden.map((id) => ({ id, label: projectFieldLabel(id), hidden: true }))
      })
    }

    new ChipButton(body.createDiv('pm-fields-foot pm-pop-section'))
      .setVariant('flat')
      .setLabel(t('header.showAll'))
      .setDisabled(shown.join() === PROJECT_LIST_FIELDS.join())
      .onClick(() => set([...PROJECT_LIST_FIELDS]))
  }

  render()
}

export const openProjectFieldsPopover = (anchor: HTMLElement, props: ProjectFieldsProps): Popover =>
  Popover.show({ anchor, width: 260 }, (el) => renderProjectFieldsPanel(el, props))
