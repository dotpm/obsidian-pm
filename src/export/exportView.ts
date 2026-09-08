import { Notice, Platform, normalizePath } from 'obsidian'
import { sanitizeFileName } from '@dotpm/core'
import type PMPlugin from '../main'
import { folderOf } from '../store'
import type { ProjectView } from '../views/ProjectView'
import { renderSnapshotHtml } from './html'
import { buildSnapshot } from './snapshot'

/** Writes the view as one HTML file beside the project note and opens it on desktop. */
export async function exportViewAsHtml(plugin: PMPlugin, view: ProjectView): Promise<string> {
  const scope = view.projectScope
  const primary = scope?.primary
  if (!scope || !primary) throw new Error('nothing to export: the view holds no project')
  const snapshot = await buildSnapshot(plugin, scope, view.exportState())
  const html = renderSnapshotHtml(snapshot)
  const folder = folderOf(primary.filePath)
  const path = normalizePath(`${folder ? folder + '/' : ''}${sanitizeFileName(snapshot.title)} snapshot.html`)
  await plugin.app.vault.adapter.write(path, html)
  new Notice(`Saved ${path}`)
  if (Platform.isDesktopApp) {
    const app = plugin.app as typeof plugin.app & { openWithDefaultApp?: (path: string) => Promise<void> }
    await app.openWithDefaultApp?.(path)
  }
  return path
}
