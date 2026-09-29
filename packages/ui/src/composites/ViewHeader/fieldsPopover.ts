import { ChipButton } from '#primitives/ChipButton'
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
import { renderPopHead } from '../popoverParts'
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
export function renderFieldsPanel(parent: HTMLElement, props: FieldsPopoverProps): void {
  const root = parent.createDiv('pm-fields-pop')
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
      renderPopHead(body, { title: t('header.hiddenFields'), section: true })
      renderVisibilityList(body, {
        rows: hidden.map((id) => ({ id, label: label(id), hidden: true })),
        showLabel: t('header.showField'),
        hideLabel: t('header.hideField'),
        onToggle: toggle
      })
    }

    const foot = body.createDiv('pm-fields-foot pm-pop-section')
    if (isTable) {
      new ChipButton(foot)
        .setVariant('flat')
        .setLabel(t('header.resetWidths'))
        .setDisabled(!fields.table?.widths)
        .onClick(() => {
          delete list().widths
          changed()
        })
    }
    new ChipButton(foot)
      .setVariant('flat')
      .setLabel(t('header.hideAll'))
      .setDisabled(shown.every((id) => isLockedField(mode, id)))
      .onClick(() => {
        list().visible = []
        changed()
      })
  }

  render()
}

/** The fields panel in a popover under `anchor`. */
export function openFieldsPopover(anchor: HTMLElement, props: FieldsPopoverProps): Popover {
  const pop = new Popover({ anchor, width: 320 })
  renderFieldsPanel(pop.contentEl, props)
  pop.open()
  return pop
}
