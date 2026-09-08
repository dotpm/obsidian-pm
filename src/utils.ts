import { Platform } from 'obsidian'
import type { PMSettings } from '@dotpm/core'

export function saveShortcutLabel(modifier: PMSettings['editorSaveModifier']): string {
  if (modifier === 'Shift') return 'Shift+Enter'
  return Platform.isMacOS ? 'Cmd+Enter' : 'Ctrl+Enter'
}
