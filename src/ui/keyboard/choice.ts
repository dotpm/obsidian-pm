import { type App, FuzzySuggestModal, type FuzzyMatch } from 'obsidian'

export interface Choice<T> {
  label: string
  /** Shown under the label, for a person's role or a project's folder. */
  detail?: string
  value: T
}

class ChoiceModal<T> extends FuzzySuggestModal<Choice<T>> {
  constructor(
    app: App,
    private readonly choices: Choice<T>[],
    private readonly choose: (value: T) => void,
    placeholder: string
  ) {
    super(app)
    this.limit = 50
    this.emptyStateText = placeholder
  }

  getItems(): Choice<T>[] {
    return this.choices
  }

  getItemText(item: Choice<T>): string {
    return item.detail ? `${item.label} ${item.detail}` : item.label
  }

  renderSuggestion(match: FuzzyMatch<Choice<T>>, el: HTMLElement): void {
    el.createDiv({ cls: 'pm-choice-label', text: match.item.label })
    if (match.item.detail) el.createDiv({ cls: 'pm-choice-detail', text: match.item.detail })
  }

  onChooseItem(item: Choice<T>): void {
    this.choose(item.value)
  }

  onOpen(): void {
    void super.onOpen()
    this.setPlaceholder(this.emptyStateText)
    this.inputEl.addClass('pm-choice-input')
  }
}

/** One keyboard-first picker behind every action that asks for a value. */
export function openChoice<T>(app: App, placeholder: string, choices: Choice<T>[], choose: (value: T) => void): void {
  if (!choices.length) return
  new ChoiceModal(app, choices, choose, placeholder).open()
}
