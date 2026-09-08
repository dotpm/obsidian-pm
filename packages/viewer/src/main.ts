import '@dotpm/ui/dom-shim'
import { domPlatform } from '@dotpm/ui/dom-platform'
import { isSnapshot, tasksFromResources, type Snapshot } from '@dotpm/api'
import type { ViewMode } from '@dotpm/core'
import {
  renderSnapshotGantt,
  renderSnapshotKanban,
  renderSnapshotTable,
  setPlatform,
  tableRows,
  ViewSwitcher,
  type SortKey,
  type ViewModel
} from '@dotpm/ui'

const MODES: { id: ViewMode; icon: string; label: string }[] = [
  { id: 'table', icon: 'table', label: 'Table' },
  { id: 'gantt', icon: 'git-fork', label: 'Gantt' },
  { id: 'kanban', icon: 'layout-dashboard', label: 'Board' }
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
    filter: snapshot.view.filter,
    sortKey: snapshot.view.sortKey as SortKey,
    sortDir: snapshot.view.sortDir
  }
}

/** The plain-DOM platform, with icons taken from the glyphs the snapshot carries. */
export function installSnapshotPlatform(snapshot: Snapshot): void {
  const parser = new DOMParser()
  setPlatform({
    ...domPlatform,
    setIcon: (el, name) => {
      el.empty()
      const markup = snapshot.icons[name]
      if (!markup) return
      const svg = parser.parseFromString(markup, 'image/svg+xml').documentElement
      if (svg.nodeName !== 'svg') return
      el.appendChild(document.importNode(svg, true))
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
  return MODES.some((option) => option.id === value)
}

export function mount(root: HTMLElement, snapshot: Snapshot, options: MountOptions = {}): void {
  installSnapshotPlatform(snapshot)
  const model = viewModelFromSnapshot(snapshot)
  root.empty()
  root.addClass('pm-root', 'pm-snapshot')

  const header = root.createDiv('pm-snapshot-header')
  const primary = model.projects[0]
  if (primary.icon) {
    const glyph = header.createSpan({ cls: 'pm-snapshot-icon' })
    if (snapshot.icons[primary.icon]) {
      const svg = new DOMParser().parseFromString(snapshot.icons[primary.icon], 'image/svg+xml').documentElement
      glyph.appendChild(document.importNode(svg, true))
    } else {
      glyph.setText(primary.icon)
    }
  }
  header.createEl('h1', { text: snapshot.title, cls: 'pm-snapshot-title' })
  const exported = new Date(snapshot.exportedAt)
  header.createDiv({
    cls: 'pm-snapshot-meta',
    text: `${tableRows(model).length} tasks · exported ${exported.toLocaleDateString()} ${exported.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
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
    options: MODES,
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

function boot(): void {
  const root = document.getElementById('app')
  if (!root) return
  const snapshot = readEmbeddedSnapshot(document)
  if (!snapshot) {
    root.setText('This page holds no readable snapshot.')
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

if (typeof document !== 'undefined' && document.getElementById('app')) boot()
