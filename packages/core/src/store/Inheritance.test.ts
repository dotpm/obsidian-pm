import { describe, expect, it } from 'vitest'
import { makeDefaultFilter, makeDefaultInheritance, makeTask, type InheritanceConfig, type Task } from '../types'
import { filterValue } from './FilterFields'
import {
  applyInheritance,
  effectiveCustomFields,
  effectiveCustomValue,
  effectiveTags,
  hydrateInheritanceConfig,
  inherits,
  isInheritedField,
  resolveInheritanceConfig,
  tagKey,
  withInherits
} from './Inheritance'
import { matchesQuery } from './TaskFilter'

const ALL: InheritanceConfig = {
  tags: { inherit: true, except: [] },
  properties: { inherit: true, except: [] }
}

function branch(): { root: Task; child: Task; grandchild: Task } {
  const grandchild = makeTask({ id: 'g', title: 'Grandchild' })
  const child = makeTask({ id: 'c', title: 'Child', subtasks: [grandchild] })
  const root = makeTask({ id: 'r', title: 'Root', subtasks: [child] })
  return { root, child, grandchild }
}

describe('inherits', () => {
  it('inherits what is not listed when inherit is on, and only what is listed when it is off', () => {
    expect(inherits({ inherit: true, except: ['a'] }, 'a')).toBe(false)
    expect(inherits({ inherit: true, except: ['a'] }, 'b')).toBe(true)
    expect(inherits({ inherit: false, except: ['a'] }, 'a')).toBe(true)
    expect(inherits({ inherit: false, except: ['a'] }, 'b')).toBe(false)
  })

  it('compares names through the key function', () => {
    expect(inherits({ inherit: false, except: ['#Client'] }, 'client', tagKey)).toBe(true)
  })
})

describe('withInherits', () => {
  it('lists a name only when it goes against the default', () => {
    expect(withInherits({ inherit: false, except: [] }, 'a', true)).toEqual({ inherit: false, except: ['a'] })
    expect(withInherits({ inherit: false, except: [] }, 'a', false)).toEqual({ inherit: false, except: [] })
    expect(withInherits({ inherit: true, except: [] }, 'a', false)).toEqual({ inherit: true, except: ['a'] })
  })

  it('takes a name back out of the list', () => {
    expect(withInherits({ inherit: false, except: ['a', 'b'] }, 'a', false)).toEqual({ inherit: false, except: ['b'] })
  })
})

describe('resolveInheritanceConfig', () => {
  it('lets a project replace tags and properties independently', () => {
    const global: InheritanceConfig = {
      tags: { inherit: true, except: [] },
      properties: { inherit: false, except: [] }
    }
    const own = { properties: { inherit: true, except: ['x'] } }
    expect(resolveInheritanceConfig(global, own)).toEqual({
      tags: { inherit: true, except: [] },
      properties: { inherit: true, except: ['x'] }
    })
  })

  it('falls back to inheriting nothing when settings predate the option', () => {
    expect(resolveInheritanceConfig(undefined, undefined)).toEqual(makeDefaultInheritance())
  })
})

describe('hydrateInheritanceConfig', () => {
  it('keeps well-formed rules and drops the rest', () => {
    expect(
      hydrateInheritanceConfig({
        tags: { inherit: true, except: ['a', 3, 'a', ''] },
        properties: { inherit: 'yes' }
      })
    ).toEqual({ tags: { inherit: true, except: ['a'] } })
    expect(hydrateInheritanceConfig('nope')).toEqual({})
  })
})

describe('applyInheritance', () => {
  it('inherits nothing by default', () => {
    const { root, grandchild } = branch()
    root.tags = ['a']
    applyInheritance([root], makeDefaultInheritance())
    expect(grandchild.inherited).toBeUndefined()
    expect(effectiveTags(grandchild)).toEqual([])
  })

  it('hands tags down every level, and not up or sideways', () => {
    const { root, child, grandchild } = branch()
    const sibling = makeTask({ id: 's' })
    root.tags = ['a']
    child.tags = ['b']
    applyInheritance([root, sibling], ALL)

    expect(effectiveTags(root)).toEqual(['a'])
    expect(effectiveTags(child)).toEqual(['b', 'a'])
    expect(effectiveTags(grandchild)).toEqual(['a', 'b'])
    expect(effectiveTags(sibling)).toEqual([])
    expect(child.tags).toEqual(['b'])
  })

  it('keeps a tag the task holds itself out of the inherited ones, ignoring case and #', () => {
    const { root, child } = branch()
    root.tags = ['Client']
    child.tags = ['#client']
    applyInheritance([root], ALL)
    expect(child.inherited).toBeUndefined()
    expect(effectiveTags(child)).toEqual(['#client'])
  })

  it('inherits only the listed tags when the rule is off', () => {
    const { root, grandchild } = branch()
    root.tags = ['client', 'internal']
    applyInheritance([root], { ...ALL, tags: { inherit: false, except: ['client'] } })
    expect(effectiveTags(grandchild)).toEqual(['client'])
  })

  it('leaves the listed tags out when the rule is on', () => {
    const { root, grandchild } = branch()
    root.tags = ['client', 'internal']
    applyInheritance([root], { ...ALL, tags: { inherit: true, except: ['internal'] } })
    expect(effectiveTags(grandchild)).toEqual(['client'])
  })

  it('does not pass a tag the rule excludes through a task that holds it', () => {
    const { root, child, grandchild } = branch()
    root.tags = ['a']
    child.tags = ['internal']
    applyInheritance([root], { ...ALL, tags: { inherit: true, except: ['internal'] } })
    expect(effectiveTags(grandchild)).toEqual(['a'])
  })

  it('gives a property to a subtask that has none', () => {
    const { root, child, grandchild } = branch()
    root.customFields = { team: 'art' }
    applyInheritance([root], ALL)

    expect(effectiveCustomValue(child, 'team')).toBe('art')
    expect(effectiveCustomValue(grandchild, 'team')).toBe('art')
    expect(isInheritedField(grandchild, 'team')).toBe(true)
    expect(isInheritedField(root, 'team')).toBe(false)
    expect(child.customFields).toEqual({})
  })

  it('lets a task keep its own value and passes that one down instead', () => {
    const { root, child, grandchild } = branch()
    root.customFields = { team: 'art' }
    child.customFields = { team: 'qa' }
    applyInheritance([root], ALL)

    expect(isInheritedField(child, 'team')).toBe(false)
    expect(effectiveCustomValue(child, 'team')).toBe('qa')
    expect(effectiveCustomValue(grandchild, 'team')).toBe('qa')
  })

  it('treats a cleared value as unset but false and 0 as values', () => {
    const { root, child } = branch()
    root.customFields = { a: 'x', b: true, c: 5 }
    child.customFields = { a: '', b: false, c: 0 }
    applyInheritance([root], ALL)

    expect(effectiveCustomValue(child, 'a')).toBe('x')
    expect(effectiveCustomValue(child, 'b')).toBe(false)
    expect(effectiveCustomValue(child, 'c')).toBe(0)
  })

  it('adds up list properties instead of replacing them', () => {
    const { root, child, grandchild } = branch()
    root.customFields = { areas: ['ui', 'api'] }
    child.customFields = { areas: ['db', 'ui'] }
    applyInheritance([root], ALL)

    expect(effectiveCustomValue(child, 'areas')).toEqual(['db', 'ui', 'api'])
    expect(effectiveCustomValue(grandchild, 'areas')).toEqual(['db', 'ui', 'api'])
    expect(child.customFields.areas).toEqual(['db', 'ui'])
  })

  it('honours the property rule per field', () => {
    const { root, child } = branch()
    root.customFields = { team: 'art', budget: 10 }
    applyInheritance([root], { ...ALL, properties: { inherit: false, except: ['team'] } })

    expect(effectiveCustomFields(child)).toEqual({ team: 'art' })
  })

  it('clears what an earlier run left behind', () => {
    const { root, child } = branch()
    root.tags = ['a']
    applyInheritance([root], ALL)
    expect(child.inherited).toBeDefined()

    applyInheritance([root], makeDefaultInheritance())
    expect(child.inherited).toBeUndefined()

    root.tags = ['a']
    applyInheritance([root], ALL)
    root.tags = []
    applyInheritance([root], ALL)
    expect(child.inherited).toBeUndefined()
  })

  it('returns the task own values untouched when there is nothing to add', () => {
    const task = makeTask({ tags: ['a'], customFields: { x: 1 } })
    expect(effectiveTags(task)).toBe(task.tags)
    expect(effectiveCustomFields(task)).toBe(task.customFields)
  })
})

describe('filtering on inherited values', () => {
  const ctx = {
    statuses: [],
    customFields: [{ id: 'team', name: 'Team', type: 'text' as const }]
  }

  it('matches a subtask on a tag or property of its ancestor', () => {
    const { root, grandchild } = branch()
    root.tags = ['client']
    root.customFields = { team: 'art' }
    applyInheritance([root], ALL)

    expect(filterValue(grandchild, 'tag', ctx)).toEqual(['client'])
    expect(filterValue(grandchild, 'cf:team', ctx)).toBe('art')
    const byTag = {
      filter: { ...makeDefaultFilter(), conditions: [{ field: 'tag', op: 'any' as const, value: ['client'] }] },
      text: ''
    }
    expect(matchesQuery(grandchild, byTag, ctx)).toBe(true)
    expect(matchesQuery(grandchild, { filter: makeDefaultFilter(), text: 'art' }, ctx)).toBe(true)
  })
})
