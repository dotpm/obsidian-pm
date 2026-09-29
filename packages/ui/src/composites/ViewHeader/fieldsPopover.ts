import { Popover } from '#primitives/Popover'
import { SegmentedControl } from '#primitives/SegmentedControl'
import {
  type FieldCatalog,
  type FieldList,
  type ViewFields,
  type ViewMode,
  columnWidth,
  hiddenFields,
  isLockedField,
  shownFields,
  t,
  tidyFields,
  viewFieldLabel
} from '@dotpm/core'
import { renderVisibilityList } from '../visibilityList'

export interface FieldsPopoverProps {
  /** The tab it opens on. */
  mode: ViewMode
  /** Edited in place. */
  fields: ViewFields
  catalog: FieldCatalog
  onChange: () => void
}

const tabs = (): { id: ViewMode; label: string }[] => [
  { id: 'table', label: t('header.fieldsTable') },
  { id: 'kanban', label: t('header.fieldsBoard') },
  { id: 'gantt', label: t('header.fieldsTimeline') }
]

/**
 * Which fields each presentation shows and in what order, one tab per presentation: the
 * table's columns (with their widths), what a board card carries, and the text beside a
 * timeline bar.
 */
export function openFieldsPopover(anchor: HTMLElement, props: FieldsPopoverProps): Popover {
  const pop = new Popover({ anchor, width: 320 })
  const root = pop.contentEl.createDiv('pm-fields-pop')
  const { fields, catalog } = props
  let mode = props.mode

  new SegmentedControl<ViewMode>(root, {
    options: tabs(),
    active: mode,
    onChange: (next) => {
      mode = next
      render()
    }
  }).el.addClass('pm-fields-tabs')
  const body = root.createDiv('pm-fields-body')

  /** The list to edit, starting from what the mode shows now. */
  const list = (): FieldList => (fields[mode] ??= { visible: shownFields(fields, mode, catalog) })

  const changed = (): void => {
    tidyFields(fields, catalog)
    render()
    props.onChange()
  }

  const label = (id: string): string => viewFieldLabel(id, catalog.customFields)
  const toggle = (id: string): void => {
    const shown = shownFields(fields, mode, catalog)
    list().visible = shown.includes(id) ? shown.filter((field) => field !== id) : [...shown, id]
    changed()
  }

  const render = (): void => {
    body.empty()
    const shown = shownFields(fields, mode, catalog)
    const hidden = hiddenFields(fields, mode, catalog)
    const isTable = mode === 'table'
    renderVisibilityList(body, {
      rows: shown.map((id) => ({
        id,
        label: label(id),
        hidden: false,
        locked: isLockedField(mode, id),
        detail: isTable ? String(columnWidth(fields, id) ?? t('header.widthFill')) : undefined
      })),
      showLabel: t('header.showField'),
      hideLabel: t('header.hideField'),
      lockedLabel: t('header.lockedField'),
      onToggle: toggle,
      onReorder: (ids) => {
        list().visible = ids
        changed()
      },
      onDetailEdit: isTable
        ? (id, width) => {
            const own = list()
            own.widths = { ...own.widths, [id]: width }
            changed()
          }
        : undefined
    })

    if (hidden.length) {
      body.createDiv({ cls: 'pm-pop-heading pm-fields-hidden-head', text: t('header.hiddenFields') })
      renderVisibilityList(body, {
        rows: hidden.map((id) => ({ id, label: label(id), hidden: true })),
        showLabel: t('header.showField'),
        hideLabel: t('header.hideField'),
        onToggle: toggle
      })
    }

    const foot = body.createDiv('pm-fields-foot')
    if (isTable) {
      const reset = foot.createEl('button', { cls: 'pm-sort-pop-reset', text: t('header.resetWidths') })
      reset.disabled = !fields.table?.widths
      reset.addEventListener('click', () => {
        delete list().widths
        changed()
      })
    }
    const hideAll = foot.createEl('button', { cls: 'pm-sort-pop-reset', text: t('header.hideAll') })
    hideAll.disabled = shown.every((id) => isLockedField(mode, id))
    hideAll.addEventListener('click', () => {
      list().visible = []
      changed()
    })
  }

  render()
  pop.open()
  return pop
}
