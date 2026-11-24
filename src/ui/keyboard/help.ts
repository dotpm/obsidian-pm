import { type App, Modal } from 'obsidian'
import { t, type MessageKey } from '@dotpm/core'
import {
  ACTION_SECTIONS,
  CONTEXT_LABELS,
  KEYMAP,
  actionLabel,
  isActionAvailable,
  type ActionId,
  type KeyboardSection
} from './keymap'
import { formatKey } from './keys'
import type { KeyboardContext, KeyboardSurface } from './types'

const SECTION_LABELS: Record<KeyboardSection, MessageKey> = {
  navigation: 'keyboard.section.navigation',
  selection: 'keyboard.section.selection',
  tasks: 'keyboard.section.tasks',
  projects: 'keyboard.section.projects',
  view: 'keyboard.section.view'
}

const SECTIONS: KeyboardSection[] = ['navigation', 'selection', 'tasks', 'projects', 'view']

export class KeyboardHelpModal extends Modal {
  constructor(
    app: App,
    private readonly context: KeyboardContext,
    private readonly surface: KeyboardSurface | null,
    private readonly hasHandler: (action: ActionId) => boolean
  ) {
    super(app)
  }

  onOpen(): void {
    this.contentEl.empty()
    this.contentEl.addClass('pm-keys')
    this.modalEl.addClass('pm-keys-modal')

    this.contentEl.createEl('h3', { text: t('keyboard.title'), cls: 'pm-keys-title' })
    this.contentEl.createEl('p', { text: t('keyboard.hint') })
    this.contentEl.createEl('p', {
      text: t('keyboard.context', { context: t(CONTEXT_LABELS[this.context]) }),
      cls: 'pm-keys-context'
    })

    const bySection = new Map<KeyboardSection, { action: ActionId; keys: string[] }[]>()
    for (const binding of KEYMAP[this.context]) {
      if (!this.hasHandler(binding.action) || !isActionAvailable(binding.action, this.surface)) continue
      const list = bySection.get(ACTION_SECTIONS[binding.action]) ?? []
      const existing = list.find((entry) => entry.action === binding.action)
      if (existing) existing.keys.push(...binding.keys)
      else list.push({ action: binding.action, keys: [...binding.keys] })
      bySection.set(ACTION_SECTIONS[binding.action], list)
    }

    for (const section of SECTIONS) {
      const rows = bySection.get(section)
      if (!rows?.length) continue
      this.contentEl.createEl('h4', { text: t(SECTION_LABELS[section]), cls: 'pm-keys-section' })
      const table = this.contentEl.createDiv('pm-keys-table')
      for (const row of rows) {
        const line = table.createDiv('pm-keys-row')
        line.createSpan({ text: actionLabel(row.action, this.context), cls: 'pm-keys-label' })
        const keys = line.createSpan('pm-keys-keys')
        for (const key of row.keys) keys.createEl('kbd', { text: formatKey(key) })
      }
    }
  }

  onClose(): void {
    this.contentEl.empty()
  }
}
