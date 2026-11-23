import type { KeyboardSurface } from '#ui/keyboard/types'

export interface SubView {
  render(): void
  /** Re-render in place, keeping scroll and selection. Falls back to render(). */
  refresh?(): void
  destroy?(): void
  /** The surface browsing keys act on, when this view has one. */
  keyboard?: KeyboardSurface
}
