import type { App } from 'obsidian'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, makeDefaultFilter, makeTask, type PMSettings } from '@dotpm/core'
import { isSnapshot, type Snapshot } from '@dotpm/api'
import { makeFakeApp } from '../../test/fakeVault'
import type PMPlugin from '../main'
import { ProjectScope } from '../store/ProjectScope'
import { ProjectStore } from '../store/ProjectStore'
import { VaultIndex } from '../store/VaultIndex'
import { renderSnapshotHtml } from './html'
import { buildSnapshot } from './snapshot'

const SETTINGS: PMSettings = { ...DEFAULT_SETTINGS, autoSchedule: false }
const TEMPLATE = '<title>__DOTPM_TITLE__</title><script id="s" type="application/json">__DOTPM_SNAPSHOT__</script>'

function fakePlugin(): { plugin: PMPlugin; store: ProjectStore; index: VaultIndex } {
  const { app } = makeFakeApp({ liveMetadataCache: true })
  const typed = app as unknown as App
  const index = new VaultIndex(typed, () => SETTINGS)
  const store = new ProjectStore(typed, () => SETTINGS, index)
  const plugin = { app: typed, index, store, settings: SETTINGS, manifest: { version: '9.9.9' } } as unknown as PMPlugin
  return { plugin, store, index }
}

describe('buildSnapshot', () => {
  let plugin: PMPlugin
  let scope: ProjectScope

  beforeEach(async () => {
    const fake = fakePlugin()
    plugin = fake.plugin
    const project = await fake.store.createProject('Roadmap <b>', 'Projects')
    await fake.store.insertTask(
      project,
      makeTask({ id: 'a', title: 'Alpha', description: 'Body of alpha', due: '2030-02-01' })
    )
    await fake.store.insertTask(project, makeTask({ id: 'a1', title: 'Alpha child', status: 'done' }), 'a')
    fake.index.build()
    scope = new ProjectScope({ kind: 'project', path: project.filePath }, [project], fake.store)
  })

  it('carries the projects, the tasks with bodies, the view state and the icon table', async () => {
    const snapshot = await buildSnapshot(plugin, scope, {
      mode: 'gantt',
      filter: { ...makeDefaultFilter(), statuses: ['todo'] },
      sortKey: 'due',
      sortDir: 'desc'
    })
    expect(isSnapshot(snapshot)).toBe(true)
    expect(snapshot.title).toBe('Roadmap <b>')
    expect(snapshot.generator).toEqual({ name: 'dotpm', version: '9.9.9' })
    expect(snapshot.view).toMatchObject({ mode: 'gantt', sortKey: 'due', sortDir: 'desc', ganttGranularity: 'week' })
    expect(snapshot.view.filter.statuses).toEqual(['todo'])
    expect(snapshot.projects.length).toBe(1)
    const [project] = snapshot.projects
    expect(project.taskCount).toBe(2)
    expect(project.doneCount).toBe(1)
    expect(project.statuses.map((s) => s.id)).toEqual(SETTINGS.statuses.map((s) => s.id))
    expect(project.tasks.map((t) => [t.id, t.parentId])).toEqual([
      ['a', null],
      ['a1', 'a']
    ])
    expect(project.tasks[0].description).toBe('Body of alpha')
    expect(typeof snapshot.icons).toBe('object')
  })
})

describe('renderSnapshotHtml', () => {
  const snapshot = {
    format: 'dotpm-snapshot',
    version: 1,
    title: 'A & <B>',
    projects: [],
    icons: {},
    exportedAt: '',
    generator: { name: 'dotpm', version: '0' },
    primaryProjectId: 'p',
    view: { mode: 'table', filter: makeDefaultFilter(), sortKey: 'title', sortDir: 'asc', ganttGranularity: 'week' },
    settings: {
      priorityIcons: 'chevrons',
      showTagColors: true,
      showSubtreeConnections: true,
      lineBorders: 'none',
      kanbanShowSubtasks: false,
      ganttWeekLabel: 'weekNumber'
    }
  } as Snapshot

  it('escapes the title and keeps task text from closing the script tag', () => {
    const html = renderSnapshotHtml({ ...snapshot, title: 'A & <B> </script><script>alert(1)' }, TEMPLATE)
    expect(html).toContain('<title>A &amp; &lt;B&gt; &lt;/script&gt;&lt;script&gt;alert(1)</title>')
    const open = 'application/json">'
    const json = html.slice(html.indexOf(open) + open.length, html.lastIndexOf('</script>'))
    expect(json).not.toContain('</script>')
    expect(json).toContain('\\u003c/script>')
    expect(JSON.parse(json).title).toBe('A & <B> </script><script>alert(1)')
  })

  it('refuses to render without a viewer', () => {
    expect(() => renderSnapshotHtml(snapshot, '')).toThrow('viewer')
  })
})
