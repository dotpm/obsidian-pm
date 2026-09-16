import { Component, ItemView, MarkdownRenderer, type ViewStateResult, WorkspaceLeaf } from 'obsidian'
import type PMPlugin from '#main'
import { formatDateLong, parseChangelog, releaseNotesSince, t } from '@dotpm/core'
import { EmptyState } from '@dotpm/ui'

export const PM_RELEASE_NOTES_VIEW_TYPE = 'pm-release-notes'

export const RELEASES = parseChangelog(__CHANGELOG__)

const CHANGELOG_URL = 'https://github.com/dotpm/obsidian-pm/blob/main/CHANGELOG.md'

/** `since` is the version an update came from; without it the view shows the running version's notes. */
export interface ReleaseNotesState {
  since?: string
  [key: string]: unknown
}

export class ReleaseNotesView extends ItemView {
  plugin: PMPlugin
  private state: ReleaseNotesState = {}
  private notes = new Component()

  constructor(leaf: WorkspaceLeaf, plugin: PMPlugin) {
    super(leaf)
    this.plugin = plugin
    this.navigation = false
  }

  getViewType(): string {
    return PM_RELEASE_NOTES_VIEW_TYPE
  }
  getDisplayText(): string {
    return t('releaseNotes.title')
  }
  getIcon(): string {
    return 'gift'
  }

  async setState(state: ReleaseNotesState, result: ViewStateResult): Promise<void> {
    this.state = state
    await this.render()
    await super.setState(state, result)
  }

  getState(): ReleaseNotesState {
    return this.state
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass('pm-release-notes')
    await this.render()
  }

  onClose(): Promise<void> {
    this.notes.unload()
    this.contentEl.empty()
    return Promise.resolve()
  }

  private async render(): Promise<void> {
    const version = this.plugin.manifest.version
    const releases = releaseNotesSince(RELEASES, version, this.state.since ?? '')
    this.notes.unload()
    this.notes.load()
    this.contentEl.empty()

    const page = this.contentEl.createDiv('pm-release-notes-page')
    page.createEl('h1', { text: t('releaseNotes.heading', { version }) })
    if (releases.length === 0) {
      new EmptyState(page).setTitle(t('releaseNotes.empty')).setBody(t('releaseNotes.emptyBody', { version }))
    }
    const rendering = releases.map((release) => {
      const section = page.createDiv('pm-release-notes-release')
      section.createEl('h2', { text: release.version })
      if (release.date) section.createDiv({ cls: 'pm-release-notes-date', text: formatDateLong(release.date) })
      return MarkdownRenderer.render(this.app, release.body, section.createDiv('markdown-rendered'), '', this.notes)
    })
    page.createEl('a', { cls: 'pm-release-notes-link', text: 'Full changelog', href: CHANGELOG_URL })
    await Promise.all(rendering)
  }
}
