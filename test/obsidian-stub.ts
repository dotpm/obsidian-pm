import { parse, stringify } from 'yaml'

// Plugin code schedules timers through `window`, as Obsidian requires. Point it
// at the node globals so tests run without a DOM environment, and so vitest's
// fake timers reach the code under test.
if (!('window' in globalThis)) Object.assign(globalThis, { window: globalThis })

export const parseYaml = (raw: string): unknown => parse(raw)
export const stringifyYaml = (obj: unknown): string => stringify(obj)

export class Notice {
  hide(): void {}
}

export function setIcon(): void {}

export function getIcon(): SVGSVGElement | null {
  return null
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
}

export function parseLinktext(linktext: string): { path: string; subpath: string } {
  const hash = linktext.indexOf('#')
  return hash < 0 ? { path: linktext, subpath: '' } : { path: linktext.slice(0, hash), subpath: linktext.slice(hash) }
}

export class TAbstractFile {
  path = ''
  name = ''
  parent: TFolder | null = null
}

export class TFile extends TAbstractFile {
  basename = ''
  extension = ''
  stat = { ctime: 0, mtime: 0, size: 0 }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = []
  isRoot(): boolean {
    return this.parent === null
  }
}
