// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('runs its click handler from the keyboard', () => {
    const onClick = vi.fn<() => void>()
    const button = new IconButton(document.body.createDiv()).setIcon('x').setTooltip('Remove').onClick(onClick)
    expect(button.el.getAttribute('tabindex')).toBe('0')
    expect(button.el.getAttribute('aria-label')).toBe('Remove')

    button.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    button.el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
    button.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    expect(onClick).toHaveBeenCalledTimes(2)
  })
})
