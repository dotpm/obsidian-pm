// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Popover } from './Popover'

afterEach(() => {
  Popover.closeAll()
  document.body.innerHTML = ''
})

describe('Popover', () => {
  it('closes itself on Escape before the host dialog sees the key', () => {
    const anchor = document.createElement('button')
    document.body.append(anchor)
    const popover = new Popover({ anchor })
    popover.contentEl.createDiv({ text: 'content' })
    popover.open()

    const host = vi.fn<() => void>()
    document.addEventListener('keydown', host)
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)

    expect(popover.isOpen).toBe(false)
    expect(host).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
    document.removeEventListener('keydown', host)
  })

  it('lets the host know the next Escape was already consumed', () => {
    const anchor = document.createElement('button')
    document.body.append(anchor)
    const popover = new Popover({ anchor })
    popover.open()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(Popover.consumeEscape()).toBe(true)
    expect(Popover.consumeEscape()).toBe(false)
  })

  it('closes the topmost popover inside a container', () => {
    const modal = document.createElement('div')
    modal.className = 'modal'
    const anchor = document.createElement('button')
    modal.append(anchor)
    document.body.append(modal)

    const popover = new Popover({ anchor })
    popover.open()
    expect(Popover.closeWithin(modal)).toBe(true)
    expect(popover.isOpen).toBe(false)
    expect(Popover.closeWithin(modal)).toBe(false)
  })
})
