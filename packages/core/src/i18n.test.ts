import { afterEach, describe, expect, it } from 'vitest'
import en from './locales/en.json'
import { catalogs, locale, setLocale, t, tn, type Messages } from './i18n'

const placeholders = (template: string) =>
  [...template.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join()
const pluralGroup = (key: string) => {
  const match = /^(.*)\.(zero|one|two|few|many|other)$/.exec(key)
  return match ? { prefix: match[1], category: match[2] } : null
}
const englishTemplate = (key: string): string | undefined => {
  if (key in en) return en[key as keyof typeof en]
  const group = pluralGroup(key)
  return group ? englishTemplate(`${group.prefix}.other`) : undefined
}
const entries = Object.entries(catalogs).flatMap(([tag, catalog]) =>
  Object.entries(catalog).map(([key, value]) => ({ tag, key, value }))
)

describe('locale catalogs', () => {
  it('only hold keys that English defines', () => {
    const unknown = entries
      .filter(({ key }) => englishTemplate(key) === undefined)
      .map(({ tag, key }) => `${tag}: ${key}`)
    expect(unknown).toEqual([])
  })

  it('use the same placeholders as English', () => {
    const mismatched = entries
      .filter(({ key, value }) => placeholders(value) !== placeholders(englishTemplate(key) ?? ''))
      .map(({ tag, key }) => `${tag}: ${key}`)
    expect(mismatched).toEqual([])
  })

  it('cover every plural category their language uses', () => {
    const groups = new Map<string, string[]>()
    for (const { tag, key } of entries) {
      const group = pluralGroup(key)
      if (!group) continue
      const id = `${tag}: ${group.prefix}`
      groups.set(id, [...(groups.get(id) ?? []), group.category])
    }
    const incomplete = [...groups].filter(([id, categories]) => {
      const expected = new Intl.PluralRules(id.split(':')[0]).resolvedOptions().pluralCategories
      return categories.sort().join() !== [...expected].sort().join()
    })
    expect(incomplete).toEqual([])
  })
})

describe('t', () => {
  afterEach(() => {
    delete catalogs['xx']
    delete catalogs['pt']
    setLocale('en')
  })

  it('interpolates named placeholders and formats numbers for the locale', () => {
    setLocale('de')
    expect(t('import.importedWithSkipped.other', { count: 1234, skipped: 2 })).toBe('Imported 1.234 tasks (2 skipped)')
  })

  it('leaves a placeholder in place when its value is missing', () => {
    expect(t('import.importedWithSkipped.one', { count: 1 })).toBe('Imported 1 task ({skipped} skipped)')
  })

  it('falls back to English for a key the locale does not translate', () => {
    catalogs['xx'] = { 'table.archivedTasks.other': 'xx {count}' }
    setLocale('xx')
    expect(t('table.archivedTasks.other', { count: 2 })).toBe('xx 2')
    expect(t('table.unarchivedTasks.other', { count: 2 })).toBe('Unarchived 2 tasks')
  })

  it('resolves a regional tag to its base language and an unknown tag to English', () => {
    const pt: Messages = { 'table.archivedTasks.other': 'pt {count}' }
    catalogs['pt'] = pt
    setLocale('pt-BR')
    expect(locale()).toBe('pt-BR')
    expect(t('table.archivedTasks.other', { count: 3 })).toBe('pt 3')
    setLocale('tlh')
    expect(t('table.archivedTasks.other', { count: 3 })).toBe('Archived 3 tasks')
  })

  it('recovers from an invalid tag', () => {
    setLocale('not a tag')
    expect(locale()).toBe('en')
  })
})

describe('tn', () => {
  afterEach(() => {
    delete catalogs['ru']
    delete catalogs['zh']
    setLocale('en')
  })

  it('picks the plural form for the count', () => {
    expect(tn('table.archivedTasks', 1)).toBe('Archived 1 task')
    expect(tn('table.archivedTasks', 0)).toBe('Archived 0 tasks')
    expect(tn('table.archivedTasks', 5)).toBe('Archived 5 tasks')
  })

  it('merges extra params with the count', () => {
    expect(tn('settings.remappedTasks', 2, { from: 'Blocked', to: 'To do' })).toBe(
      "Remapped 2 tasks from 'Blocked' to 'To do'."
    )
  })

  it('uses the categories of the active language and falls back to other', () => {
    catalogs['ru'] = {
      'table.archivedTasks.one': 'ru one {count}',
      'table.archivedTasks.few': 'ru few {count}',
      'table.archivedTasks.other': 'ru other {count}'
    }
    setLocale('ru')
    expect(tn('table.archivedTasks', 1)).toBe('ru one 1')
    expect(tn('table.archivedTasks', 3)).toBe('ru few 3')
    expect(tn('table.archivedTasks', 5)).toBe('ru other 5')
    expect(tn('table.archivedTasks', 21)).toBe('ru one 21')
    expect(tn('table.unarchivedTasks', 3)).toBe('Unarchived 3 tasks')
  })

  it('uses the single form of a language without plurals', () => {
    catalogs['zh'] = { 'table.archivedTasks.other': '已归档 {count} 个任务' }
    setLocale('zh')
    expect(tn('table.archivedTasks', 1)).toBe('已归档 1 个任务')
    expect(tn('table.archivedTasks', 12)).toBe('已归档 12 个任务')
  })
})
