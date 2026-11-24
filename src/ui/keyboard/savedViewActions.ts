import { Notice, type App } from 'obsidian'
import { t } from '@dotpm/core'
import { safeAsync } from '@dotpm/ui'
import { promptText } from '../ModalFactory'
import { openChoice, type Choice } from './choice'

/** A list to pick the saved view from, the built-in one first; null picks the built-in view. */
export function askSavedView(
  app: App,
  views: { id: string; name: string }[],
  activeId: string | null,
  builtInName: string,
  select: (id: string | null) => void
): void {
  const current = t('keyboard.currentView')
  const choices: Choice<string | null>[] = [
    { label: builtInName, detail: activeId === null ? current : undefined, value: null },
    ...views.map((view) => ({ label: view.name, detail: view.id === activeId ? current : undefined, value: view.id }))
  ]
  openChoice(app, t('keyboard.pickSavedView'), choices, select)
}

/** Asks for a name, then saves the current state under it; says so when there is nothing to save. */
export function askSaveView(app: App, canSave: boolean, save: (name: string) => Promise<void>): void {
  if (!canSave) {
    new Notice(t('header.nothingToSave'))
    return
  }
  void safeAsync(async () => {
    const name = await promptText(app, t('header.saveAsNewTitle'), t('header.viewName'))
    if (name) await save(name)
  })()
}
