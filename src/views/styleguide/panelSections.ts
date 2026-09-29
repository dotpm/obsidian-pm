import {
  type FilterCondition,
  type GroupState,
  type NonWorkingDays,
  type ProjectListFilter,
  type SortRule,
  type ViewFields,
  DEFAULT_PRIORITIES,
  DEFAULT_STATUSES,
  filterFieldLabel,
  makeTask
} from '@dotpm/core'
import {
  type FilterSetup,
  type TuneItem,
  Stepper,
  boardColumns,
  boardField,
  groupableFields,
  renderFieldsPanel,
  renderFilterPanel,
  renderGroupPanel,
  renderNonWorkingDaysPanel,
  renderProjectFilterPanel,
  renderProjectSwitcherPanel,
  renderSavedViewsPanel,
  renderSortPanel,
  renderTunePanel,
  renderTuneSheetPanel
} from '@dotpm/ui'

export interface GalleryLayout {
  section: (title: string, id: string) => HTMLElement
  row: (sec: HTMLElement, caption: string) => HTMLElement
}

const noop = (): void => undefined
const noopAsync = (): Promise<void> => Promise.resolve()

const TASKS = [
  makeTask({ id: 'a', status: 'todo', priority: 'high', tags: ['design'], assignees: ['Ada Lovelace'] }),
  makeTask({ id: 'b', status: 'todo', priority: 'medium', tags: ['web'] }),
  makeTask({ id: 'c', status: 'in-progress', priority: 'high', customFields: { client: 'Acme' } }),
  makeTask({ id: 'd', status: 'done', priority: 'low', due: '2030-01-01', customFields: { estimate: 3 } })
]

const CUSTOM_FIELDS = [
  { id: 'estimate', name: 'Estimate', type: 'number' as const },
  { id: 'client', name: 'Client', type: 'select' as const, options: ['Acme', 'Globex'] }
]

/** A fresh setup per panel, since every panel edits its filter in place. */
function setupWith(conditions: FilterCondition[]): FilterSetup {
  return {
    filter: { conditions, showArchived: false },
    tasks: TASKS,
    ctx: { statuses: DEFAULT_STATUSES, customFields: CUSTOM_FIELDS },
    priorities: DEFAULT_PRIORITIES,
    priorityIcons: 'chevrons',
    projects: []
  }
}

/** The chrome a `Popover` gives its content, drawn in place so the panel shows at rest. */
function frame(parent: HTMLElement, width: number): HTMLElement {
  const pop = parent.createDiv('pm-pop pm-sg-pop')
  pop.setCssProps({ '--pop-width': `${width}px` })
  return pop.createDiv('pm-pop-body')
}

/**
 * Every popover's panel, drawn inline in the states a reader meets: the header's
 * popovers, the Tune list and sheet, the project list's filter. Each one is the real
 * `render...Panel` the popover draws, so a screenshot of a section is a screenshot of the
 * popover.
 */
export function renderPanelSections({ section, row }: GalleryLayout): void {
  const filter = section('Filter panel', 'panel-filter')
  const filterRow = row(filter, 'field picker / one condition: operators and values / the applied list')
  renderFilterPanel(frame(filterRow, 300), setupWith([]), noop)
  renderFilterPanel(frame(filterRow, 300), setupWith([{ field: 'status', op: 'any', value: ['todo'] }]), noop, 0)
  renderFilterPanel(
    frame(filterRow, 300),
    setupWith([
      { field: 'status', op: 'any', value: ['todo', 'in-progress'] },
      { field: 'cf:estimate', op: 'between', value: [2, 8] }
    ]),
    noop,
    'list'
  )
  const rangeRow = row(filter, 'a number range and a date range with an open end')
  renderFilterPanel(
    frame(rangeRow, 300),
    setupWith([{ field: 'cf:estimate', op: 'between', value: [null, 5] }]),
    noop,
    0
  )
  renderFilterPanel(
    frame(rangeRow, 300),
    setupWith([{ field: 'due', op: 'between', value: ['2030-01-01', ''] }]),
    noop,
    0
  )

  const sort = section('Sort panel', 'panel-sort')
  const sortRow = row(sort, 'two keys / nothing sorted')
  const sortFields = [
    { id: 'status' as const, label: 'Status', ends: ['To do', 'Done'] as [string, string] },
    { id: 'priority' as const, label: 'Priority', ends: ['Critical', 'Low'] as [string, string] },
    { id: 'due' as const, label: 'Due date' }
  ]
  const twoKeys: SortRule[] = [
    { key: 'priority', dir: 'asc' },
    { key: 'due', dir: 'desc' }
  ]
  renderSortPanel(frame(sortRow, 340), { fields: sortFields, sort: twoKeys, onChange: noop, onReset: noop })
  renderSortPanel(frame(sortRow, 340), { fields: sortFields, sort: [], onChange: noop, onReset: noop })

  const group = section('Group panel', 'panel-group')
  const groupRow = row(group, 'columns by status, one hidden')
  const groupSetup = setupWith([])
  const groupState: GroupState = { field: 'status', columns: { status: { hidden: ['done'] } } }
  renderGroupPanel(frame(groupRow, 300), {
    fields: groupableFields(groupSetup).map((id) => ({ id, label: filterFieldLabel(id, CUSTOM_FIELDS) })),
    group: groupState,
    field: () => boardField(groupSetup, groupState),
    columns: () => boardColumns(groupSetup, groupState, TASKS),
    onChange: noop
  })

  const fields = section('Fields panel', 'panel-fields')
  const fieldsRow = row(fields, 'table columns with widths / board card')
  const catalog = { customFields: CUSTOM_FIELDS, multi: false }
  const tableFields: ViewFields = {
    table: { visible: ['title', 'status', 'due', 'cf:estimate'], widths: { due: 120 } }
  }
  renderFieldsPanel(frame(fieldsRow, 320), { mode: 'table', fields: tableFields, catalog, onChange: noop })
  renderFieldsPanel(frame(fieldsRow, 320), { mode: 'kanban', fields: {}, catalog, onChange: noop })

  const saved = section('Saved views panel', 'panel-saved-views')
  const savedRow = row(saved, 'the active view with unsaved changes / the list at rest')
  const views = [
    { id: 'v1', name: 'Sprint 14', modeIcon: 'kanban', isDefault: true },
    { id: 'v2', name: 'Overdue', modeIcon: 'table' },
    { id: 'v3', name: 'Launch plan', modeIcon: 'chart-gantt' }
  ]
  const savedProps = {
    views,
    canSave: true,
    storageNote: 'Saved in the project note, so it syncs with the vault.',
    onSelect: noop,
    onSave: noopAsync,
    onUpdate: noopAsync,
    onRevert: noop,
    onRename: noopAsync,
    onDelete: noopAsync,
    onReorder: noopAsync,
    onSetDefault: noopAsync
  }
  renderSavedViewsPanel(frame(savedRow, 300), { ...savedProps, activeId: 'v1', changes: ['filter', 'sort'] }, noop)
  renderSavedViewsPanel(frame(savedRow, 300), { ...savedProps, activeId: 'v2', changes: [] }, noop)

  const switcher = section('Project switcher panel', 'panel-switcher')
  renderProjectSwitcherPanel(
    frame(row(switcher, 'parent, siblings with the current one checked, its children'), 280),
    {
      projects: [
        { path: 'acme', title: 'Acme', depth: 0, isParent: true },
        { path: 'web', title: 'Website redesign', icon: 'globe', color: '#5b8def', depth: 0, isCurrent: true },
        { path: 'brand', title: 'Brand refresh', icon: 'palette', color: '#d96ba0', depth: 1 },
        { path: 'app', title: 'Mobile app', icon: 'smartphone', color: '#6bb38f', depth: 0 }
      ],
      onPick: noop,
      onAllProjects: noop
    },
    noop
  )

  const tune = section('Tune panels', 'panel-tune')
  const tuneRow = row(tune, "the Tune list, with the timeline's zoom drawn in its row / the phone's sheet")
  const tuneItems: TuneItem[][] = [
    [{ icon: 'table', label: 'View mode', state: 'Timeline', onOpen: noop }],
    [
      { icon: 'list-filter', label: 'Filter', state: '2', onOpen: noop },
      { icon: 'arrow-down-up', label: 'Sort', state: 'Priority +1', onOpen: noop }
    ],
    [
      {
        icon: 'zoom-in',
        label: 'Zoom',
        control: (parent) =>
          new Stepper(parent, {
            decreaseLabel: 'Zoom out',
            increaseLabel: 'Zoom in',
            resetLabel: 'Reset zoom',
            onDecrease: noop,
            onIncrease: noop,
            onReset: noop
          }).setValue('100%', false, false)
      }
    ]
  ]
  renderTunePanel(frame(tuneRow, 240), tuneItems, noop, tuneRow)
  const sheetSort: SortRule[] = [{ key: 'priority', dir: 'asc' }]
  renderTuneSheetPanel(
    frame(tuneRow, 360),
    {
      tabs: [
        {
          id: 'filter',
          label: 'Filter',
          badge: () => '1',
          render: (parent, changed) =>
            renderFilterPanel(parent, setupWith([{ field: 'status', op: 'any', value: ['todo'] }]), changed, 'list')
        },
        {
          id: 'sort',
          label: 'Sort',
          render: (parent, changed) =>
            renderSortPanel(parent, { fields: sortFields, sort: sheetSort, onChange: changed, onReset: changed })
        }
      ],
      clear: { label: 'Clear all', canClear: () => true, onClear: noop },
      doneLabel: () => 'Show 42 tasks'
    },
    noop
  )

  const days = section('Non-working days panel', 'panel-days')
  const hidden: NonWorkingDays = { weekends: true }
  renderNonWorkingDaysPanel(frame(row(days, 'weekends hidden, two holidays'), 280), {
    days: hidden,
    holidays: ['2030-12-25', '2030-12-26'],
    onChange: noop,
    onHolidaysChange: noop
  })

  const projects = section('Project list filter panel', 'panel-project-filter')
  const projectFilter: ProjectListFilter = { progress: ['in-progress'] }
  renderProjectFilterPanel(frame(row(projects, 'one stage picked, two tags'), 300), {
    filter: projectFilter,
    progress: { 'not-started': 2, 'in-progress': 9, complete: 4 },
    tags: [
      { tag: 'client', count: 5 },
      { tag: 'internal', count: 3 }
    ],
    onChange: noop
  })

  if (activeDocument.activeElement instanceof HTMLElement) activeDocument.activeElement.blur()
}
