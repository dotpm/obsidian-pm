import { zh } from './zh'

/**
 * User-facing text is translated gettext-style: the English copy is the key, so `t()` in
 * the English locale returns the key itself and a locale only ships the strings it rewords.
 * Placeholders are `{name}` and are filled from the params object.
 */
export type Locale = 'en' | 'zh'

export type I18nParams = Record<string, string | number>

const dictionaries: Record<Locale, Record<string, string> | null> = {
  en: null,
  zh
}

let currentLocale: Locale = 'en'

export function setLocale(locale: Locale): void {
  if (locale in dictionaries) currentLocale = locale
}

export function getLocale(): Locale {
  return currentLocale
}

function lookup(text: string): string {
  if (currentLocale === 'en') return text
  return dictionaries[currentLocale]?.[text] ?? text
}

function interpolate(text: string, params: I18nParams | undefined): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

/** Translates a string, filling `{name}` placeholders from `params`. */
export function t(text: string, params?: I18nParams): string {
  return interpolate(lookup(text), params)
}

/**
 * Translates a countable string. English picks `one` or `other` by the count; locales
 * without inflection look `other` up as a single unchanging phrase.
 */
export function tn(n: number, one: string, other: string, params?: I18nParams): string {
  const text = currentLocale === 'en' ? (n === 1 ? one : other) : lookup(other)
  return interpolate(text, { n, ...params })
}
