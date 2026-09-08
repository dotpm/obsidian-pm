// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'

describe('dom shim', () => {
  it('creates elements with classes, text and attributes appended to the parent', () => {
    const parent = createDiv()
    const el = parent.createEl('button', { cls: ['a', 'b'], text: 'Go', attr: { 'data-x': 1, hidden: null } })
    expect(el.parentElement).toBe(parent)
    expect(el.className).toBe('a b')
    expect(el.textContent).toBe('Go')
    expect(el.getAttribute('data-x')).toBe('1')
    expect(el.hasAttribute('hidden')).toBe(false)
  })

  it('treats a string option as a class and honours prepend and parent', () => {
    const parent = createDiv()
    parent.createSpan('first')
    const early = parent.createSpan({ cls: 'early', prepend: true })
    expect(parent.firstElementChild).toBe(early)
    const elsewhere = createDiv()
    const child = parent.createDiv({ parent: elsewhere })
    expect(child.parentElement).toBe(elsewhere)
  })

  it('empties, sets text and toggles classes', () => {
    const el = createDiv({ cls: 'x' })
    el.createSpan({ text: 'one' })
    el.createSpan({ text: 'two' })
    el.empty()
    expect(el.childNodes.length).toBe(0)
    el.setText('Plain')
    expect(el.getText()).toBe('Plain')
    el.toggleClass('on', true)
    el.toggleClass('x', false)
    expect(el.hasClass('on')).toBe(true)
    expect(el.hasClass('x')).toBe(false)
    el.addClass('p q')
    expect(el.classList.contains('q')).toBe(true)
  })

  it('sets css custom properties and styles', () => {
    const el = createDiv()
    el.setCssProps({ '--pm-chip-color': 'red' })
    el.setCssStyles({ width: '10px' })
    expect(el.style.getPropertyValue('--pm-chip-color')).toBe('red')
    expect(el.style.width).toBe('10px')
  })

  it('finds descendants and matching parents', () => {
    const root = createDiv({ cls: 'root' })
    const row = root.createDiv({ cls: 'row' })
    const cell = row.createSpan({ cls: 'cell' })
    expect(root.find('.cell')).toBe(cell)
    expect(root.findAll('span')).toEqual([cell])
    expect(cell.matchParent('.row')).toBe(row)
    expect(cell.matchParent('.root', row)).toBeNull()
  })

  it('shows and hides through the display property', () => {
    const el = document.body.createDiv()
    el.hide()
    expect(el.isShown()).toBe(false)
    el.show()
    expect(el.isShown()).toBe(true)
    el.detach()
    expect(el.isConnected).toBe(false)
  })
})
