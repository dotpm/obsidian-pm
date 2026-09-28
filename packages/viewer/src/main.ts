import '@dotpm/ui/dom-shim'
import { domPlatform } from '@dotpm/ui/dom-platform'
import { isSnapshot, tasksFromResources, type Snapshot } from '@dotpm/api'
import {
  type ViewMode,
  hydrateFilter,
  hydrateGroup,
  hydrateSort,
  locale,
  setDateFormat,
  setLocale,
  t,
  tn
} from '@dotpm/core'
import {
  renderSnapshotGantt,
  renderSnapshotKanban,
  renderSnapshotTable,
  setPlatform,
  svgEl,
  tableRows,
  ViewSwitcher,
  type ViewModel
} from '@dotpm/ui'

const MODE_IDS: ViewMode[] = ['table', 'gantt', 'kanban']

const modes = (): { id: ViewMode; icon: string; label: string }[] => [
  { id: 'table', icon: 'table', label: t('views.table') },
  { id: 'gantt', icon: 'git-fork', label: t('views.gantt') },
  { id: 'kanban', icon: 'layout-dashboard', label: t('views.kanban') }
]

export function viewModelFromSnapshot(snapshot: Snapshot): ViewModel {
  return {
    projects: snapshot.projects.map((project) => ({
      id: project.id,
      title: project.title,
      color: project.color,
      icon: project.icon,
      tasks: tasksFromResources(project.tasks),
      config: {
        statuses: project.statuses,
        priorities: project.priorities,
        customFields: project.customFields,
        priorityIcons: snapshot.settings.priorityIcons,
        defaultView: snapshot.view.mode,
        autoSchedule: false,
        pullForwardOnEarlyFinish: false,
        autoArchiveDays: 0,
        showSubtreeConnections: snapshot.settings.showSubtreeConnections,
        lineBorders: snapshot.settings.lineBorders,
        kanbanShowSubtasks: snapshot.settings.kanbanShowSubtasks,
        kanbanShowDescriptionPreview: false
      }
    })),
    settings: { ...snapshot.settings, ganttGranularity: snapshot.view.ganttGranularity },
    filter: hydrateFilter(snapshot.view.filter),
    sort: hydrateSort(snapshot.view as unknown as Record<string, unknown>),
    group: hydrateGroup(snapshot.view.group),
    personColors: snapshot.personColors ?? {}
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const ICON_TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect'])
const ICON_ATTRIBUTES = new Set([
  'class',
  'viewBox',
  'width',
  'height',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'fill-rule',
  'clip-rule',
  'opacity',
  'transform',
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'points'
])

function copyIconElement(source: Element): SVGElement | null {
  if (source.namespaceURI !== SVG_NS || !ICON_TAGS.has(source.localName)) return null
  const el = svgEl(source.localName as keyof SVGElementTagNameMap)
  for (const { name, value } of Array.from(source.attributes)) {
    if (ICON_ATTRIBUTES.has(name)) el.setAttribute(name, value)
  }
  for (const child of Array.from(source.children)) {
    const copy = copyIconElement(child)
    if (copy) el.appendChild(copy)
  }
  return el
}

/**
 * An icon from the snapshot, rebuilt from its drawing elements and attributes alone. A hosted
 * snapshot is written by whoever published it, so its markup is never inserted as it came.
 */
export function iconFromMarkup(markup: string): SVGElement | null {
  const root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement
  return root.localName === 'svg' ? copyIconElement(root) : null
}

/** The plain-DOM platform, with icons taken from the glyphs the snapshot carries. */
export function installSnapshotPlatform(snapshot: Snapshot): void {
  setPlatform({
    ...domPlatform,
    setIcon: (el, name) => {
      el.empty()
      const markup = snapshot.icons[name]
      const icon = markup ? iconFromMarkup(markup) : null
      if (icon) el.appendChild(icon)
    }
  })
}

function followSystemTheme(): void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => document.body.toggleClass('theme-dark', query.matches)
  apply()
  query.addEventListener('change', apply)
}

export interface MountOptions {
  /** Where to start; the snapshot's own mode when absent. */
  mode?: ViewMode
  onModeChange?: (mode: ViewMode) => void
}

export function isViewMode(value: string): value is ViewMode {
  return MODE_IDS.some((id) => id === value)
}

export function mount(root: HTMLElement, snapshot: Snapshot, options: MountOptions = {}): void {
  setLocale(snapshot.locale)
  setDateFormat(snapshot.settings.dateFormat)
  installSnapshotPlatform(snapshot)
  const model = viewModelFromSnapshot(snapshot)
  root.empty()
  root.addClass('pm-root', 'pm-snapshot')

  const header = root.createDiv('pm-snapshot-header')
  const primary = model.projects[0]
  if (primary.icon) {
    const glyph = header.createSpan({ cls: 'pm-snapshot-icon' })
    const markup = snapshot.icons[primary.icon]
    const icon = markup ? iconFromMarkup(markup) : null
    if (icon) glyph.appendChild(icon)
    else glyph.setText(primary.icon)
  }
  header.createEl('h1', { text: snapshot.title, cls: 'pm-snapshot-title' })
  const exported = new Date(snapshot.exportedAt)
  header.createDiv({
    cls: 'pm-snapshot-meta',
    text: t('viewer.meta', {
      tasks: tn('count.tasks', tableRows(model).length),
      date: exported.toLocaleDateString(locale()),
      time: exported.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
    })
  })

  const body = root.createDiv('pm-snapshot-body')
  let mode = options.mode ?? snapshot.view.mode
  const paint = (): void => {
    body.empty()
    body.removeClass('pm-gantt-view', 'pm-kanban-view')
    if (mode === 'table') renderSnapshotTable(body, model)
    else if (mode === 'gantt') renderSnapshotGantt(body, model)
    else renderSnapshotKanban(body, model)
  }
  new ViewSwitcher<ViewMode>(header, {
    options: modes(),
    active: mode,
    onChange: (next) => {
      mode = next
      options.onModeChange?.(next)
      paint()
    }
  })
  paint()
}

export function readEmbeddedSnapshot(doc: Document): Snapshot | null {
  const el = doc.getElementById('dotpm-snapshot')
  if (!el) return null
  try {
    const parsed: unknown = JSON.parse(el.textContent ?? '')
    return isSnapshot(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * The snapshot embedded in the page, or else the one the root's `data-snapshot` URL points at,
 * which is how a hosted page too large to inline carries it.
 */
export async function loadSnapshot(doc: Document): Promise<Snapshot | null> {
  const embedded = readEmbeddedSnapshot(doc)
  if (embedded) return embedded
  const url = doc.getElementById('app')?.dataset['snapshot']
  if (!url) return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const parsed: unknown = await response.json()
    return isSnapshot(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app')
  if (!root) return
  const snapshot = await loadSnapshot(document)
  if (!snapshot) {
    root.setText(t('viewer.noSnapshot'))
    return
  }
  followSystemTheme()
  document.title = snapshot.title
  const requested = window.location.hash.slice(1)
  mount(root, snapshot, {
    mode: isViewMode(requested) ? requested : undefined,
    onModeChange: (mode) => window.history.replaceState(null, '', `#${mode}`)
  })
}

if (typeof document !== 'undefined' && document.getElementById('app')) void boot()
