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

  describe('focus on close', () => {
    const openWithField = (anchor: HTMLElement): { popover: Popover; field: HTMLInputElement } => {
      const popover = new Popover({ anchor })
      const field = popover.contentEl.createEl('input')
      popover.open()
      field.focus()
      return { popover, field }
    }

    it('goes back to the trigger that had focus when it opened', () => {
      const anchor = document.createElement('button')
      document.body.append(anchor)
      anchor.focus()
      const { popover } = openWithField(anchor)
      popover.close()
      expect(document.activeElement).toBe(anchor)
    })

    it('stays on the page when a hotkey opened it from there, so Enter cannot press the anchor', () => {
      const anchor = document.createElement('button')
      document.body.append(anchor)
      expect(document.activeElement).toBe(document.body)
      const { popover } = openWithField(anchor)
      popover.close(true)
      expect(document.activeElement).toBe(document.body)
    })

    it('goes back to what had focus before, even when that is not the anchor', () => {
      const anchor = document.createElement('button')
      const before = document.createElement('button')
      document.body.append(anchor, before)
      before.focus()
      const { popover } = openWithField(anchor)
      popover.close()
      expect(document.activeElement).toBe(before)
    })

    it('falls back to the anchor when what had focus is gone', () => {
      const anchor = document.createElement('button')
      const before = document.createElement('button')
      document.body.append(anchor, before)
      before.focus()
      const { popover } = openWithField(anchor)
      before.remove()
      popover.close()
      expect(document.activeElement).toBe(anchor)
    })

    it('leaves focus alone when it had already moved elsewhere', () => {
      const anchor = document.createElement('button')
      const elsewhere = document.createElement('button')
      document.body.append(anchor, elsewhere)
      anchor.focus()
      const { popover } = openWithField(anchor)
      elsewhere.focus()
      popover.close()
      expect(document.activeElement).toBe(elsewhere)
    })
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
