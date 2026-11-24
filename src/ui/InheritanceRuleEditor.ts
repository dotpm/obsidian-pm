import { type InheritanceRule, inherits, t, tagKey, withInherits } from '@dotpm/core'
import { Checkbox, Chip } from '@dotpm/ui'

export interface InheritanceRuleEditorOptions {
  rule: InheritanceRule
  /** Called with the rule the user arrived at; the caller stores it and the editor draws it. */
  onChange: (rule: InheritanceRule) => void
  /** What the switch for inheriting everything says. */
  allLabel: string
  /**
   * The names that can be picked, each with its own switch. Without them the rule is
   * edited as a free-form list of tags.
   */
  choices?: { id: string; label: string }[]
  /** Offered while typing a tag. */
  suggestions?: string[]
}

/** Gives each tag input its own suggestion list, since ids are shared across the whole document. */
let tagIdCounter = 0

/**
 * Edits one `InheritanceRule`. The switch decides whether names are inherited unless they
 * are listed or only when they are, and flipping it clears the list, since the same names
 * would mean the opposite.
 */
export function renderInheritanceRuleEditor(container: HTMLElement, opts: InheritanceRuleEditorOptions): void {
  let rule = opts.rule
  const draw = (): void => {
    container.empty()
    const root = container.createDiv('pm-inherit')

    const all = root.createEl('label', { cls: 'pm-inherit-row' })
    new Checkbox(all).setChecked(rule.inherit).onChange((inherit) => commit({ inherit, except: [] }))
    all.createSpan({ text: opts.allLabel })

    if (opts.choices) {
      renderChoices(root, opts.choices)
    } else {
      renderTagList(root)
    }
  }

  const commit = (next: InheritanceRule): void => {
    rule = next
    opts.onChange(next)
    draw()
  }

  const renderChoices = (root: HTMLElement, choices: { id: string; label: string }[]): void => {
    if (!choices.length) {
      root.createDiv({ cls: 'pm-modal-hint', text: t('inheritance.noProperties') })
      return
    }
    const list = root.createDiv('pm-inherit-list')
    for (const choice of choices) {
      const row = list.createEl('label', { cls: 'pm-inherit-row' })
      new Checkbox(row)
        .setChecked(inherits(rule, choice.id))
        .setAriaLabel(choice.label)
        .onChange((value) => commit(withInherits(rule, choice.id, value)))
      row.createSpan({ text: choice.label })
    }
  }

  const renderTagList = (root: HTMLElement): void => {
    const listed = root.createDiv('pm-inherit-list')
    listed.createDiv({
      cls: 'pm-modal-hint',
      text: rule.inherit ? t('inheritance.tagsExcept') : t('inheritance.tagsOnly')
    })
    const chips = listed.createDiv('pm-inherit-tags')
    for (const tag of rule.except) {
      new Chip(chips)
        .setLabel(tag)
        .setVariant('outline')
        .setTag()
        .setRemovable(() => commit(withInherits(rule, tag, rule.inherit, tagKey)), t('common.remove'))
    }

    const input = listed.createEl('input', { type: 'text', cls: 'pm-inherit-input' })
    input.placeholder = t('inheritance.addTag')
    if (opts.suggestions?.length) {
      const options = listed.createEl('datalist', { attr: { id: `pm-inherit-tags-${tagIdCounter++}` } })
      for (const tag of opts.suggestions) options.createEl('option', { value: tag })
      input.setAttribute('list', options.id)
    }
    // `change` fires on Enter and on leaving the box, so a tag is added either way.
    input.addEventListener('change', () => {
      const tag = input.value.trim().replace(/^#/, '')
      if (tag && inherits(rule, tag, tagKey) === rule.inherit) commit(withInherits(rule, tag, !rule.inherit, tagKey))
      else input.value = ''
    })
  }

  draw()
}
