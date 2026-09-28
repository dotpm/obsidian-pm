/**
 * Classes the header adds one at a time while its row overflows: the query and option
 * labels and the count drop first, then the mode, saved view and scope labels, then the
 * breadcrumb folds its ancestors, then the primary action loses its label. The title
 * truncates only after the last one.
 */
const COMPACT_LEVELS = ['pm-vh--icons', 'pm-vh--terse', 'pm-vh--folded', 'pm-vh--tight']

/**
 * The one row every task view shows, as fixed slots the orchestrator fills: context
 * (breadcrumb and scope), view (saved view and count), query, view options and actions.
 * An empty slot takes no space. `bar` holds the optional second row for applied filters.
 */
export class ViewHeader {
  readonly el: HTMLElement
  readonly context: HTMLElement
  readonly view: HTMLElement
  readonly query: HTMLElement
  readonly options: HTMLElement
  readonly actions: HTMLElement
  readonly bar: HTMLElement
  private readonly row: HTMLElement
  private readonly observer: ResizeObserver

  constructor(parentEl: HTMLElement) {
    this.el = parentEl.createDiv('pm-vh')
    this.row = this.el.createDiv({ cls: 'pm-vh-row', attr: { role: 'toolbar' } })
    this.context = this.row.createDiv('pm-vh-slot pm-vh-context')
    this.view = this.row.createDiv('pm-vh-slot pm-vh-view')
    this.row.createDiv('pm-vh-spacer')
    this.query = this.row.createDiv('pm-vh-slot pm-vh-query')
    this.options = this.row.createDiv('pm-vh-slot pm-vh-options')
    this.actions = this.row.createDiv('pm-vh-slot pm-vh-actions')
    this.bar = this.el.createDiv('pm-vh-bar')
    this.observer = new ResizeObserver(() => this.fit())
    this.observer.observe(this.row)
  }

  /** Picks the richest level that fits. Call after changing what a slot holds. */
  fit(): void {
    this.el.removeClasses(COMPACT_LEVELS)
    this.el.addClass('pm-vh--measuring')
    for (const level of COMPACT_LEVELS) {
      if (this.row.scrollWidth <= this.row.clientWidth) break
      this.el.addClass(level)
    }
    this.el.removeClass('pm-vh--measuring')
  }

  destroy(): void {
    this.observer.disconnect()
    this.el.remove()
  }
}
