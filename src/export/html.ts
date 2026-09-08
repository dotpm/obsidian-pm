import type { Snapshot } from '@dotpm/api'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * The self-contained page: the viewer template with the title filled in and the snapshot
 * embedded as JSON. Every `<` in the JSON is written as a unicode escape, so no task
 * text can close the script tag or open a comment.
 */
export function renderSnapshotHtml(snapshot: Snapshot, template: string = __VIEWER_TEMPLATE__): string {
  if (!template) throw new Error('this build carries no viewer; run the viewer build first')
  const json = JSON.stringify(snapshot).replace(/</g, '\\u003c')
  return template.split('__DOTPM_TITLE__').join(escapeHtml(snapshot.title)).split('__DOTPM_SNAPSHOT__').join(json)
}
