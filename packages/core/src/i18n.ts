import bn from './locales/bn.json'
import de from './locales/de.json'
import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import it from './locales/it.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'
import pl from './locales/pl.json'
import ptBR from './locales/pt-BR.json'
import ro from './locales/ro.json'
import ru from './locales/ru.json'
import sv from './locales/sv.json'
import zh from './locales/zh.json'

export type MessageKey = keyof typeof en
export type PluralKey = MessageKey extends infer K ? (K extends `${infer Prefix}.other` ? Prefix : never) : never
export type Messages = Partial<Record<MessageKey | `${PluralKey}.${Intl.LDMLPluralRule}`, string>>
type Params = Record<string, string | number>

/** Every bundled locale by its language tag; a partial catalog falls back to English per key. */
export const catalogs: Record<string, Messages> = { bn, de, en, es, fr, it, ja, ko, pl, 'pt-BR': ptBR, ro, ru, sv, zh }

const english: Messages = en
let currentLocale = 'en'
let messages: Messages = en
let pluralRules = new Intl.PluralRules('en')

export function setLocale(tag: string): void {
  let rules: Intl.PluralRules
  try {
    rules = new Intl.PluralRules(tag)
  } catch {
    tag = 'en'
    rules = new Intl.PluralRules(tag)
  }
  currentLocale = tag
  pluralRules = rules
  messages = catalogs[tag] ?? catalogs[tag.split('-')[0]] ?? en
}

export function locale(): string {
  return currentLocale
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    if (value === undefined) return match
    return typeof value === 'number' ? value.toLocaleString(currentLocale) : value
  })
}

export function t(key: MessageKey, params?: Params): string {
  return interpolate(messages[key] ?? en[key], params)
}

/** Picks the CLDR plural form of `key` for `count`, which is also available as `{count}`. */
export function tn(key: PluralKey, count: number, params?: Params): string {
  const exact = `${key}.${pluralRules.select(count)}` as const
  const other = `${key}.other` as MessageKey
  const template = messages[exact] ?? messages[other] ?? english[exact] ?? en[other]
  return interpolate(template, { count, ...params })
}
