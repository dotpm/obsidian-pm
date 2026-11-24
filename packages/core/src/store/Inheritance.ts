import type { InheritanceConfig, InheritanceRule, InheritedValues, Task } from '../types'
import { makeDefaultInheritance } from '../types'
import { stringifyCustomValue } from '../utils'

/** Obsidian treats `#Art` and `art` as one tag, so a rule does too. */
export function tagKey(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase()
}

/** Whether the rule hands `name` down. `keyOf` decides which spellings name the same thing. */
export function inherits(rule: InheritanceRule, name: string, keyOf: (name: string) => string = String): boolean {
  const key = keyOf(name)
  return rule.inherit !== rule.except.some((entry) => keyOf(entry) === key)
}

/** Returns a rule with `name` set to be inherited or not, leaving the others as they were. */
export function withInherits(
  rule: InheritanceRule,
  name: string,
  value: boolean,
  keyOf: (name: string) => string = String
): InheritanceRule {
  const key = keyOf(name)
  const rest = rule.except.filter((entry) => keyOf(entry) !== key)
  return { inherit: rule.inherit, except: value === rule.inherit ? rest : [...rest, name] }
}

/** Drops anything that is not a rule, so a hand-edited note or settings file can't break a load. */
export function hydrateInheritanceRule(raw: unknown): InheritanceRule | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.inherit !== 'boolean') return undefined
  const except = Array.isArray(r.except) ? r.except.filter((entry): entry is string => typeof entry === 'string') : []
  return { inherit: r.inherit, except: [...new Set(except.filter(Boolean))] }
}

export function hydrateInheritanceConfig(raw: unknown): Partial<InheritanceConfig> {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const out: Partial<InheritanceConfig> = {}
  const tags = hydrateInheritanceRule(r.tags)
  if (tags) out.tags = tags
  const properties = hydrateInheritanceRule(r.properties)
  if (properties) out.properties = properties
  return out
}

/** The project's own rules where it sets them, the global ones everywhere else. */
export function resolveInheritanceConfig(
  global: InheritanceConfig | undefined,
  own: Partial<InheritanceConfig> | undefined
): InheritanceConfig {
  const base = { ...makeDefaultInheritance(), ...global }
  return { tags: own?.tags ?? base.tags, properties: own?.properties ?? base.properties }
}

/** What the ancestors hand down: every inheritable tag and property value, as the child sees it. */
interface Carry {
  tags: string[]
  properties: Record<string, unknown>
}

const NOTHING: Carry = { tags: [], properties: {} }

/** A property holds nothing when it was never set or was cleared back to empty; `false` and `0` are values. */
export function isUnsetValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

/**
 * A task's own value wins over what an ancestor holds. Two lists are the exception: they
 * add up, as tags do. Returns `own` itself when the ancestor adds nothing to it.
 */
function mergeValue(own: unknown, ancestor: unknown): unknown {
  if (isUnsetValue(ancestor)) return own
  if (isUnsetValue(own)) return ancestor
  if (!Array.isArray(own) || !Array.isArray(ancestor)) return own
  const ownList: unknown[] = own
  const held = new Set(ownList.map(stringifyCustomValue))
  const added = (ancestor as unknown[]).filter((value) => !held.has(stringifyCustomValue(value)))
  return added.length ? [...ownList, ...added] : own
}

function mergeTags(own: string[], ancestors: string[]): string[] {
  const held = new Set(own.map(tagKey))
  return ancestors.filter((tag) => !held.has(tagKey(tag)))
}

function nextCarry(task: Task, carry: Carry, merged: Record<string, unknown>, config: InheritanceConfig): Carry {
  const heldAbove = new Set(carry.tags.map(tagKey))
  const ownTags = task.tags.filter((tag) => {
    if (!inherits(config.tags, tag, tagKey) || heldAbove.has(tagKey(tag))) return false
    heldAbove.add(tagKey(tag))
    return true
  })
  return {
    tags: ownTags.length ? [...carry.tags, ...ownTags] : carry.tags,
    properties: { ...carry.properties, ...merged }
  }
}

function resolveTask(
  task: Task,
  carry: Carry,
  config: InheritanceConfig
): { values: InheritedValues | null; next: Carry } {
  const tags = mergeTags(task.tags, carry.tags)
  const gained: Record<string, unknown> = {}
  const effective: Record<string, unknown> = {}
  for (const id of new Set([...Object.keys(carry.properties), ...Object.keys(task.customFields)])) {
    if (!inherits(config.properties, id)) continue
    const own = task.customFields[id]
    const value = mergeValue(own, carry.properties[id])
    if (isUnsetValue(value)) continue
    effective[id] = value
    if (value !== own) gained[id] = value
  }
  const hasGain = tags.length > 0 || Object.keys(gained).length > 0
  return {
    values: hasGain ? { tags, customFields: gained } : null,
    next: nextCarry(task, carry, effective, config)
  }
}

/**
 * Works out what every task in the forest takes from its ancestors, down any number of
 * levels, and stores it on the task as `inherited`. Run it again whenever a task, the tree
 * or a rule changes: it also clears what an earlier run left behind.
 */
export function applyInheritance(roots: Task[], config: InheritanceConfig): void {
  const walk = (tasks: Task[], carry: Carry): void => {
    for (const task of tasks) {
      const { values, next } = resolveTask(task, carry, config)
      if (values) task.inherited = values
      else Reflect.deleteProperty(task, 'inherited')
      if (task.subtasks.length) walk(task.subtasks, next)
    }
  }
  walk(roots, NOTHING)
}

/** Own tags first, then the ones taken from ancestors. */
export function effectiveTags(task: Task): string[] {
  return task.inherited?.tags.length ? [...task.tags, ...task.inherited.tags] : task.tags
}

export function effectiveCustomFields(task: Task): Record<string, unknown> {
  return task.inherited && Object.keys(task.inherited.customFields).length
    ? { ...task.customFields, ...task.inherited.customFields }
    : task.customFields
}

export function effectiveCustomValue(task: Task, fieldId: string): unknown {
  const inherited = task.inherited?.customFields
  return inherited && fieldId in inherited ? inherited[fieldId] : task.customFields[fieldId]
}

/** True when an ancestor contributes to the property, whether it is the whole value or part of it. */
export function isInheritedField(task: Task, fieldId: string): boolean {
  return task.inherited !== undefined && fieldId in task.inherited.customFields
}

/** How much of a property's value comes from ancestors: all of it, only part of a list, or none. */
export type InheritedShare = 'none' | 'partial' | 'full'

export function inheritedShare(task: Task, fieldId: string): InheritedShare {
  if (!isInheritedField(task, fieldId)) return 'none'
  return isUnsetValue(task.customFields[fieldId]) ? 'full' : 'partial'
}
