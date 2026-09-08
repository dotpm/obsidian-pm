import type { App } from 'obsidian'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, makeTask, type PMSettings } from '@dotpm/core'
import { ApiRequestError } from '@dotpm/api'
import { makeFakeApp } from '../../test/fakeVault'
import type PMPlugin from '../main'
import { ProjectStore } from '../store/ProjectStore'
import { VaultIndex } from '../store/VaultIndex'
import { LocalApi } from './LocalApi'

const SETTINGS: PMSettings = { ...DEFAULT_SETTINGS, autoSchedule: false }

function newApi(): { api: LocalApi; store: ProjectStore; index: VaultIndex; refreshes: () => number } {
  const { app } = makeFakeApp({ liveMetadataCache: true })
  const typed = app as unknown as App
  const index = new VaultIndex(typed, () => SETTINGS)
  const store = new ProjectStore(typed, () => SETTINGS, index)
  let refreshed = 0
  const plugin = {
    app: typed,
    index,
    store,
    settings: SETTINGS,
    refreshViews: () => {
      refreshed++
    }
  } as unknown as PMPlugin
  return { api: new LocalApi(plugin), store, index, refreshes: () => refreshed }
}

async function rejectsWith(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(ApiRequestError)
  await expect(promise).rejects.toMatchObject({ code })
}

describe('LocalApi over the vault', () => {
  let api: LocalApi
  let store: ProjectStore
  let index: VaultIndex
  let refreshes: () => number
  let projectId: string

  beforeEach(async () => {
    ;({ api, store, index, refreshes } = newApi())
    const project = await store.createProject('Roadmap', 'Projects')
    await store.insertTask(project, makeTask({ id: 'a', title: 'Alpha', due: '2030-02-01' }))
    await store.insertTask(project, makeTask({ id: 'b', title: 'Beta' }))
    await store.insertTask(project, makeTask({ id: 'a1', title: 'Alpha child' }), 'a')
    index.build()
    projectId = project.id
  })

  it('lists projects from the index and reads them with their config', async () => {
    const projects = await api.listProjects()
    expect(projects).toEqual([expect.objectContaining({ id: projectId, title: 'Roadmap', taskCount: 3, doneCount: 0 })])
    const project = await api.getProject(projectId)
    expect(project.statuses.map((s) => s.id)).toEqual(SETTINGS.statuses.map((s) => s.id))
    await rejectsWith(api.getProject('missing'), 'not_found')
  })

  it('reads tasks with parents and positions', async () => {
    const tasks = await api.listTasks(projectId)
    expect(tasks.map((t) => [t.id, t.parentId, t.position])).toEqual([
      ['a', null, 0],
      ['a1', 'a', 0],
      ['b', null, 1]
    ])
    expect(await api.getTask('a1')).toMatchObject({ id: 'a1', projectId, parentId: 'a', due: '' })
    await rejectsWith(api.getTask('nope'), 'not_found')
  })

  it('searches through the index', async () => {
    expect((await api.searchTasks({ query: 'alpha' })).map((t) => t.id)).toEqual(['a', 'a1'])
    expect((await api.searchTasks({ query: 'alpha', limit: 1 })).map((t) => t.id)).toEqual(['a'])
    expect((await api.searchTasks({ status: 'todo', projectId })).length).toBe(3)
  })

  it('creates and updates through the store and refreshes the views', async () => {
    const created = await api.createTask(projectId, {
      title: 'Gamma',
      parentId: 'b',
      priority: 'high',
      description: 'Body text'
    })
    expect(created).toMatchObject({ title: 'Gamma', parentId: 'b', priority: 'high', position: 0 })
    expect(await api.getTask(created.id)).toMatchObject({ title: 'Gamma', description: 'Body text' })
    expect((await api.listTasks(projectId)).find((task) => task.id === created.id)?.description).toBe('Body text')

    await rejectsWith(api.createTask(projectId, { title: 'Orphan', parentId: 'nope' }), 'not_found')
    await rejectsWith(api.createTask(projectId, { title: 'Bad', status: 'nope' }), 'invalid')

    const before = await api.getTask('a')
    await rejectsWith(api.updateTask('a', { title: 'Alpha!' }, 'stale'), 'conflict')
    const updated = await api.updateTask('a', { title: 'Alpha!', status: 'done' }, before.updatedAt)
    expect(updated).toMatchObject({ title: 'Alpha!', status: 'done' })
    expect(updated.completed).not.toBe('')
    expect(refreshes()).toBeGreaterThanOrEqual(2)
  })

  it('moves between parents, reorders among siblings, and refuses cycles', async () => {
    expect(await api.moveTask('b', { parentId: 'a' })).toMatchObject({ parentId: 'a', position: 1 })
    expect(await api.moveTask('b', { before: 'a1' })).toMatchObject({ parentId: 'a', position: 0 })
    await rejectsWith(api.moveTask('a', { parentId: 'a1' }), 'invalid')
    await rejectsWith(api.moveTask('a1', { after: 'zzz' }), 'not_found')
    expect(await api.moveTask('a1', { parentId: null })).toMatchObject({ parentId: null, position: 1 })
  })

  it('archives, unarchives and deletes', async () => {
    expect(await api.archiveTask('b', true)).toMatchObject({ archived: true })
    expect((await api.listTasks(projectId)).map((t) => t.id)).toEqual(['a', 'a1'])
    expect((await api.listTasks(projectId, true)).map((t) => t.id)).toEqual(['a', 'a1', 'b'])
    expect(await api.archiveTask('b', false)).toMatchObject({ archived: false })
    await api.deleteTask('a')
    expect((await api.listTasks(projectId)).map((t) => t.id)).toEqual(['b'])
    await rejectsWith(api.deleteTask('a'), 'not_found')
  })

  it('records what changed for pollers', async () => {
    const off = api.attach()
    const start = await api.changes(null)
    expect(start).toEqual({ cursor: expect.any(Number), changes: [], reset: false })

    await api.listTasks(projectId)
    await api.updateTask('b', { title: 'Beta 2' })
    await api.deleteTask('a1')
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    const page = await api.changes(start.cursor)
    expect(page.reset).toBe(false)
    expect(page.changes.map((c) => [c.kind, c.op, c.id])).toEqual(
      expect.arrayContaining([
        ['task', 'upsert', 'b'],
        ['task', 'delete', 'a1']
      ])
    )
    expect(page.changes.every((c) => c.projectId === projectId)).toBe(true)
    expect((await api.changes(page.cursor)).changes).toEqual([])
    expect((await api.changes(-5)).reset).toBe(true)
    off()
  })
})
