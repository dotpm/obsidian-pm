import {
  ButtonComponent,
  ExtraButtonComponent,
  getIconIds,
  Menu,
  Notice,
  parseYaml,
  Platform,
  setIcon,
  setTooltip,
  stringifyYaml
} from 'obsidian'
import { setYamlCodec } from '@dotpm/core'
import { setPlatform } from '@dotpm/ui'

/** Hands the core and ui packages Obsidian's own YAML, icons, components and menus. */
export function installObsidianPlatform(): void {
  setYamlCodec({ parse: parseYaml, stringify: stringifyYaml })
  setPlatform({
    setIcon,
    setTooltip,
    iconIds: getIconIds,
    isPhone: () => Platform.isPhone,
    createButton: (parent) => new ButtonComponent(parent),
    createExtraButton: (parent) => new ExtraButtonComponent(parent),
    createMenu: () => new Menu(),
    showNotice: (message) => {
      new Notice(message)
    },
    activeWindow: () => activeWindow,
    activeDocument: () => activeDocument
  })
}
