import type { KeyboardSurface } from './types'

interface Position {
  group: number
  index: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

/**
 * Keyboard position over whatever a surface calls its items. It keeps ids, never a DOM
 * node or an index, so a re-render, a filter or a reorder does not move the cursor.
 *
 * Ids may repeat across groups: a board card with two tags sits in two columns, and a
 * project with two tags sits in two groups. The cursor therefore remembers the group and
 * index it is on, and asks the surface to paint that occurrence.
 */
export class FocusCursor {
  /** Where a Shift range starts. */
  private anchor: string | null = null
  /** The last place the cursor stood. */
  private lastPosition: Position = { group: 0, index: 0 }

  constructor(private readonly surface: KeyboardSurface) {}

  private groups(): string[][] {
    return this.surface.groups()
  }

  /** The first occurrence of the active id, when the remembered one no longer holds it. */
  private occurrence(groups: string[][]): Position | null {
    const active = this.surface.activeId()
    if (!active) return null
    const painted = this.surface.activePosition?.()
    if (painted && groups[painted.group]?.[painted.index] === active) return painted
    const last = this.lastPosition
    if (groups[last.group]?.[last.index] === active) return last
    for (let group = 0; group < groups.length; group++) {
      const index = groups[group].indexOf(active)
      if (index !== -1) return { group, index }
    }
    return null
  }

  private nearestNonEmpty(groups: string[][], from: Position): Position | null {
    const group = clamp(from.group, 0, groups.length - 1)
    if (groups[group]?.length) return { group, index: clamp(from.index, 0, groups[group].length - 1) }
    for (let distance = 1; distance < groups.length; distance++) {
      const after = group + distance
      if (after < groups.length && groups[after].length) return { group: after, index: 0 }
      const before = group - distance
      if (before >= 0 && groups[before].length) {
        return { group: before, index: groups[before].length - 1 }
      }
    }
    return null
  }

  /** Where the cursor is, or the nearest surviving place when its id is gone. */
  private position(groups: string[][]): Position | null {
    return this.occurrence(groups) ?? this.nearestNonEmpty(groups, this.lastPosition)
  }

  private firstPosition(groups: string[][]): Position | null {
    for (let group = 0; group < groups.length; group++) {
      if (groups[group].length) return { group, index: 0 }
    }
    return null
  }

  private lastPositionOf(groups: string[][]): Position | null {
    for (let group = groups.length - 1; group >= 0; group--) {
      if (groups[group].length) return { group, index: groups[group].length - 1 }
    }
    return null
  }

  /** One step, crossing into the next non-empty group at either end. */
  private step(groups: string[][], from: Position, delta: 1 | -1): Position | null {
    let group = from.group
    let index = from.index + delta
    while (group >= 0 && group < groups.length) {
      if (index >= 0 && index < groups[group].length) return { group, index }
      if (delta > 0) {
        group++
        index = 0
      } else {
        group--
        if (group >= 0) index = groups[group].length - 1
      }
    }
    return null
  }

  private go(groups: string[][], position: Position): string | null {
    const id = groups[position.group]?.[position.index] ?? null
    if (!id) return null
    this.lastPosition = position
    if (this.surface.setActiveAt) this.surface.setActiveAt(id, position.group, position.index)
    else this.surface.setActive(id)
    return id
  }

  /** Snaps a cursor whose item was filtered, collapsed or deleted to the nearest survivor. */
  reconcile(): void {
    const groups = this.groups()
    if (!this.surface.activeId()) return
    const found = this.occurrence(groups)
    if (found) {
      this.lastPosition = found
      return
    }
    const position = this.nearestNonEmpty(groups, this.lastPosition)
    if (position) this.go(groups, position)
    else this.surface.setActive(null)
  }

  /** Puts the cursor on an id that still exists, for carrying it across a view switch. */
  activate(id: string): boolean {
    const groups = this.groups()
    for (let group = 0; group < groups.length; group++) {
      const index = groups[group].indexOf(id)
      if (index !== -1) {
        this.go(groups, { group, index })
        return true
      }
    }
    return false
  }

  move(delta: number): void {
    this.moveBy(delta)
  }

  private moveBy(count: number): void {
    if (count === 0) return
    const groups = this.groups()
    let steps = count
    if (!this.surface.activeId()) {
      const start = steps > 0 ? this.firstPosition(groups) : this.lastPositionOf(groups)
      if (!start) return
      this.go(groups, start)
      steps -= Math.sign(count)
      if (steps === 0) return
    }
    let position = this.position(groups)
    if (!position) return
    const direction = steps > 0 ? 1 : -1
    for (let i = 0; i < Math.abs(steps); i++) {
      const next = this.step(groups, position, direction)
      if (!next) break
      position = next
    }
    this.go(groups, position)
  }

  moveGroup(delta: 1 | -1): void {
    const groups = this.groups()
    if (!this.surface.activeId()) {
      if (delta > 0) this.first()
      else this.last()
      return
    }
    const position = this.position(groups)
    if (!position) return
    let group = position.group + delta
    while (group >= 0 && group < groups.length && groups[group].length === 0) group += delta
    if (group < 0 || group >= groups.length) return
    this.go(groups, { group, index: clamp(position.index, 0, groups[group].length - 1) })
  }

  first(): void {
    const groups = this.groups()
    const position = this.firstPosition(groups)
    if (position) this.go(groups, position)
  }

  last(): void {
    const groups = this.groups()
    const position = this.lastPositionOf(groups)
    if (position) this.go(groups, position)
  }

  page(delta: 1 | -1): void {
    this.moveBy(delta * (this.surface.pageSize?.() ?? 10))
  }

  /** Moves and paints a range from the anchor. Surfaces without a selection just move. */
  extend(delta: 1 | -1): void {
    const selection = this.surface.selection?.()
    const before = this.surface.activeId()
    if (!selection || !before) {
      this.move(delta)
      if (selection) this.anchor = this.surface.activeId()
      return
    }
    const groups = this.groups()
    const anchor = this.anchor
    this.anchor = anchor && groups.some((group) => group.includes(anchor)) ? anchor : before
    this.move(delta)
    const after = this.surface.activeId()
    if (!after) return
    const group = groups.find((ids) => ids.includes(after))
    if (!group) return
    const from = group.indexOf(this.anchor)
    const to = group.indexOf(after)
    if (from === -1 || to === -1) {
      selection.set(new Set([after]))
      selection.onChange()
      return
    }
    const [low, high] = from < to ? [from, to] : [to, from]
    selection.set(new Set(group.slice(low, high + 1)))
    selection.onChange()
  }

  toggleSelect(): void {
    const selection = this.surface.selection?.()
    if (!selection) return
    if (!this.surface.activeId()) this.move(1)
    const id = this.surface.activeId()
    if (!id) return
    const ids = new Set(selection.ids())
    if (ids.has(id)) ids.delete(id)
    else ids.add(id)
    selection.set(ids)
    selection.onChange()
    this.anchor = id
    this.move(1)
  }

  selectAll(): void {
    const selection = this.surface.selection?.()
    if (!selection) return
    selection.set(new Set(this.groups().flat()))
    selection.onChange()
  }

  clearSelection(): boolean {
    const selection = this.surface.selection?.()
    if (!selection || selection.ids().size === 0) return false
    selection.set(new Set())
    selection.onChange()
    this.anchor = null
    return true
  }

  clearActive(): boolean {
    if (!this.surface.activeId()) return false
    this.surface.setActive(null)
    this.anchor = null
    return true
  }

  targetIds(): string[] {
    const selection = this.surface.selection?.()
    const selected = selection ? [...selection.ids()] : []
    if (selected.length) return selected
    const active = this.surface.activeId()
    return active ? [active] : []
  }
}
