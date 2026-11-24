import { Notice, type App } from 'obsidian'
import { t } from '@dotpm/core'
import { safeAsync } from '@dotpm/ui'
import { promptText } from '../ModalFactory'
import { openChoice, type Choice } from './choice'

export interface SavedViewChoices {
  views: { id: string; name: string }[]
  activeId: string | null
  /** The built-in view at the top of the list, which shows everything. */
  builtInName: string
  /** False while nothing differs from the defaults, so there is nothing to save. */
  canSave: boolean
  /** Null picks the built-in view. */
  onSelect: (id: string | null) => void
  onSave: (name: string) => Promise<void>
}

type Pick = { kind: 'view'; id: string | null } | { kind: 'save' }

/** A list to pick the saved view from, the built-in one first, with an entry at the end to save a new one. */
export function askSavedView(app: App, props: SavedViewChoices): void {
  const current = t('keyboard.currentView')
  const choices: Choice<Pick>[] = [
    {
      label: props.builtInName,
      detail: props.activeId === null ? current : undefined,
      value: { kind: 'view', id: null }
    },
    ...props.views.map((view) => ({
      label: view.name,
      detail: view.id === props.activeId ? current : undefined,
      value: { kind: 'view' as const, id: view.id }
    })),
    { label: t('header.saveCurrent'), value: { kind: 'save' } }
  ]
  openChoice(app, t('keyboard.pickSavedView'), choices, (pick) => {
    if (pick.kind === 'view') props.onSelect(pick.id)
    else askName(app, props)
  })
}

/** Asks for a name, then saves the current state under it; says so when there is nothing to save. */
function askName(app: App, props: SavedViewChoices): void {
  if (!props.canSave) {
    new Notice(t('header.nothingToSave'))
    return
  }
  void safeAsync(async () => {
    const name = await promptText(app, t('header.saveAsNewTitle'), t('header.viewName'))
    if (name) await props.onSave(name)
  })()
}
