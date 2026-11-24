import type { Task } from '@dotpm/core'

/** Which set of bindings and actions a surface answers to. */
export type KeyboardContext = 'table' | 'board' | 'timeline' | 'projects' | 'overview'

/** The multi-selection a list exposes. Boards and the project list have none. */
export interface KeyboardSelection {
  ids(): Set<string>
  set(ids: Set<string>): void
  onChange(): void
}

/**
 * What the keyboard layer needs from a view, and nothing else: ids in reading order,
 * which one is active, and how to paint it. The same adapter serves the table, the
 * board, the timeline's label column and the project list.
 */
export interface KeyboardSurface {
  readonly context: KeyboardContext
  /** Table, timeline and project list return one group; the board returns one per column. */
  groups(): string[][]
  activeId(): string | null
  /** The column or group the active occurrence sits in, when that matters. */
  activeGroupKey?(): string | null
  /** The painted occurrence, when the surface tracks one. */
  activePosition?(): { group: number; index: number } | null
  /** Paint and reveal. Virtual windows and collapsed parents are the surface's business. */
  setActive(id: string | null): void
  /**
   * Paint one occurrence when the same id appears more than once, such as a card with
   * two tags or a project in two tag groups. Falls back to `setActive` when absent.
   */
  setActiveAt?(id: string | null, group: number, index: number): void
  selection?(): KeyboardSelection
  pageSize?(): number
  /** A new item made from the surface, such as a card in the active board column. */
  newTaskDefaults?(): Partial<Task> | null
  /** A key that clears something the surface owns, like an in-progress dependency link. */
  cancel?(): boolean
  /** False while a filter makes the tree's collapse state invisible. */
  canCollapse?(): boolean
  expand?(): void | Promise<void>
  collapse?(): void | Promise<void>
}
