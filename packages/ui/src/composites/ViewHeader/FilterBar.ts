import { setIcon } from '#platform'
import { FilterChip } from '#primitives/FilterChip'
import { filterFieldIcon, filterFieldLabel, t, tn } from '@dotpm/core'
import { describeCondition, openFilterPopover, type FilterSetup } from './filterPopover'

export interface FilterBarProps extends FilterSetup {
  summary: string
  onChange: () => void
  onClose: () => void
}

/**
 * The applied filters as one chip per condition, a "+ Filter" picker, the shown count and
 * Clear all. Conditions combine with AND, the values inside one with OR. It edits
 * `filter` in place and reports each change through `onChange`. Chips are updated in
 * place, so a popover anchored to one stays put while it edits that condition. In a narrow
 * header the chips give way to one button naming how many filters apply, which opens them
 * as a list.
 */
export class FilterBar {
  el: HTMLElement
  private chipsEl: HTMLElement
  private chips: FilterChip[] = []
  private archivedChip: FilterChip
  private listBtn: HTMLButtonElement
  private addBtn: HTMLButtonElement
  private summaryEl: HTMLElement
  private clearBtn: HTMLButtonElement

  constructor(
    parentEl: HTMLElement,
    private props: FilterBarProps
  ) {
    this.el = parentEl.createDiv('pm-filter-bar')
    this.listBtn = this.el.createEl('button', { cls: 'pm-filter-bar-list' })
    this.listBtn.addEventListener('click', () =>
      openFilterPopover(this.listBtn, this.props, () => this.changed(), 'list')
    )
    this.chipsEl = this.el.createDiv('pm-filter-bar-chips')
    this.archivedChip = new FilterChip(this.chipsEl)
      .setField(t('common.archived'), 'archive')
      .setOperator('')
      .setValue(t('filter.included'))
      .setRemoveLabel(t('filter.remove', { label: t('common.archived') }))
      .onRemove(() => {
        this.props.filter.showArchived = false
        this.changed()
      })
    this.addBtn = this.chipsEl.createEl('button', { cls: 'pm-filter-bar-add' })
    setIcon(this.addBtn.createSpan('pm-filter-bar-add-icon'), 'plus')
    this.addBtn.createSpan({ text: t('header.filter') })
    this.addBtn.addEventListener('click', () => this.openPicker())

    const end = this.el.createDiv('pm-filter-bar-end')
    this.summaryEl = end.createSpan({ cls: 'pm-filter-bar-summary', text: props.summary })
    this.clearBtn = end.createEl('button', { cls: 'pm-filter-bar-clear', text: t('filter.clearAll') })
    this.clearBtn.addEventListener('click', () => {
      this.props.filter.conditions = []
      this.props.filter.showArchived = false
      this.changed()
    })
    const close = end.createEl('button', {
      cls: 'pm-filter-bar-close clickable-icon',
      attr: { 'aria-label': t('filter.hideBar') }
    })
    setIcon(close, 'x')
    close.addEventListener('click', () => this.props.onClose())
    this.renderChips()
  }

  setSummary(text: string): void {
    this.props.summary = text
    this.summaryEl.setText(text)
  }

  /** Opens the field picker, as the header's Filter button does, or the list when the chips are folded. */
  openPicker(): void {
    const folded = !this.addBtn.offsetParent && !!this.listBtn.offsetParent
    openFilterPopover(
      folded ? this.listBtn : this.addBtn,
      this.props,
      () => this.changed(),
      folded ? 'list' : undefined
    )
  }

  private changed(): void {
    this.renderChips()
    this.props.onChange()
  }

  private renderChips(): void {
    const { filter, ctx } = this.props
    filter.conditions.forEach((condition, index) => {
      let chip = this.chips[index]
      if (!chip) {
        chip = new FilterChip(this.chipsEl)
          .onEdit((anchor) => openFilterPopover(anchor, this.props, () => this.changed(), index))
          .onRemove(() => {
            this.props.filter.conditions.splice(index, 1)
            this.changed()
          })
        this.chipsEl.insertBefore(chip.el, this.archivedChip.el)
        this.chips.push(chip)
      }
      const label = filterFieldLabel(condition.field, ctx.customFields)
      const { op, value } = describeCondition(this.props, condition)
      chip
        .setField(label, filterFieldIcon(condition.field, ctx.customFields))
        .setOperator(op)
        .setValue(value)
        .setRemoveLabel(t('filter.remove', { label }))
    })
    for (const extra of this.chips.splice(filter.conditions.length)) extra.el.remove()
    this.archivedChip.el.toggleClass('pm-hidden', !filter.showArchived)
    const count = filter.conditions.length + (filter.showArchived ? 1 : 0)
    this.listBtn.setText(count ? tn('filter.count', count) : t('filter.addFilter'))
    this.clearBtn.toggleClass('pm-hidden', filter.conditions.length === 0 && !filter.showArchived)
  }
}
