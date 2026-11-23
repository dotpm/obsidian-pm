// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Popover } from '#primitives/Popover'
import { renderSelectControl } from './SelectControl'

afterEach(() => {
  Popover.closeAll()
  document.body.innerHTML = ''
})

function open(value: string, search = false) {
  const container = document.createElement('div')
  document.body.append(container)
  const changes: string[] = []
  renderSelectControl({
    container,
    value,
    search,
    options: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' }
    ],
    onChange: (id) => changes.push(id)
  })
  const trigger = container.querySelector<HTMLButtonElement>('button')
  if (!trigger) throw new Error('no trigger')
  trigger.click()
  const items = (): HTMLButtonElement[] => Array.from(document.querySelectorAll<HTMLButtonElement>('.pm-pop-item'))
  return { container, trigger, changes, items }
}

function press(element: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  element.dispatchEvent(event)
  return event
}

describe('SelectControl', () => {
  it('opens on the selected option and walks the list with arrows', () => {
    const { changes, items } = open('b')
    const options = items()
    expect(options).toHaveLength(3)
    expect(document.activeElement).toBe(options[1])

    press(options[1], 'ArrowDown')
    expect(document.activeElement).toBe(options[2])
    press(options[2], 'ArrowUp')
    press(options[1], 'ArrowUp')
    expect(document.activeElement).toBe(options[0])

    options[2].click()
    expect(changes).toEqual(['c'])
    expect(document.querySelector('.pm-pop')).toBeNull()
  })

  it('moves from the search field into the results and picks the first match', () => {
    const { items } = open('b', true)
    const input = document.querySelector<HTMLInputElement>('input.pm-pop-field')
    if (!input) throw new Error('no search field')
    expect(document.activeElement).toBe(input)
    input.value = 'gam'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    press(input, 'ArrowDown')
    expect(document.activeElement).toBe(items()[0])
  })

  it('closes only the picker on Escape', () => {
    const { items } = open('b')
    const host = vi.fn<() => void>()
    document.addEventListener('keydown', host)
    press(items()[1], 'Escape')
    expect(document.querySelector('.pm-pop')).toBeNull()
    expect(host).not.toHaveBeenCalled()
    document.removeEventListener('keydown', host)
  })
})
