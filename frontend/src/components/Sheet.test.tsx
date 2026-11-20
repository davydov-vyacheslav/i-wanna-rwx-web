import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Sheet } from './Sheet'

function Host() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Sheet title="T" closeLabel="Close" onClose={() => setOpen(false)}>
          <p>body</p>
        </Sheet>
      )}
    </>
  )
}

describe('Sheet focus return', () => {
  it('returns focus to the tapped opener even when the tap did not focus it (WebKit)', () => {
    render(<Host />)
    const opener = screen.getByRole('button', { name: 'Open' })
    fireEvent.click(opener) // click only: the button never receives focus, like a WebKit tap
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    return Promise.resolve().then(() => expect(document.activeElement).toBe(opener))
  })
})

describe('Sheet and the visual viewport', () => {
  it('follows the visual viewport height and offset (keyboard up) and stops listening on close', () => {
    const vv = Object.assign(new EventTarget(), { height: 400, offsetTop: 12 })
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
    const { container, unmount } = render(
      <Sheet title="T" closeLabel="Close" onClose={() => {}}>
        <p>body</p>
      </Sheet>,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.style.getPropertyValue('--vvh')).toBe('400px')
    vv.height = 300
    vv.offsetTop = 0
    vv.dispatchEvent(new Event('resize'))
    expect(root.style.getPropertyValue('--vvh')).toBe('300px')
    expect(root.style.getPropertyValue('--vvt')).toBe('0px')
    unmount()
    vv.height = 500
    vv.dispatchEvent(new Event('resize'))
    expect(root.style.getPropertyValue('--vvh')).toBe('300px')
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
  })

  it('inert hides the sheet from focus and assistive tech; the footer is outside the scrolling content', () => {
    render(
      <Sheet title="T" closeLabel="Close" onClose={() => {}} inert footer={<button>Pinned</button>}>
        <p>body</p>
      </Sheet>,
    )
    const root = screen.getByText('body').closest('[aria-hidden]') as HTMLElement
    expect(root.hasAttribute('inert')).toBe(true)
    expect(screen.getByText('Pinned').parentElement!.contains(screen.getByText('body'))).toBe(false)
  })
})

describe('Sheet as a dialog', () => {
  it('is a modal dialog that traps Tab; wide screens centre it with md: classes only', () => {
    render(
      <Sheet title="T" closeLabel="Close" onClose={() => {}}>
        <button>inside</button>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog', { name: 'T' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.className).toMatch(/md:max-w-lg/)
    expect(dialog.className).toMatch(/md:rounded-sheet/)
    const close = screen.getByRole('button', { name: 'Close' })
    const inside = screen.getByRole('button', { name: 'inside' })
    inside.focus()
    fireEvent.keyDown(inside, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(inside)
  })
})

describe('focus ring after closing a sheet', () => {
  const ringHidden = (el: Element) => el.hasAttribute('data-pointer-focus')

  it('shows no ring on the returned opener after a click, until it blurs', async () => {
    render(<Host />)
    const opener = screen.getByRole('button', { name: 'Open' })
    fireEvent.pointerDown(opener)
    fireEvent.click(opener, { detail: 1 })
    expect(ringHidden(screen.getByRole('button', { name: 'Close' }))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }), { detail: 1 })
    await Promise.resolve()
    expect(document.activeElement).toBe(opener)
    expect(ringHidden(opener)).toBe(true)
    opener.blur()
    expect(ringHidden(opener)).toBe(false)
  })

  it('keeps the ring when the keyboard closed it (Escape)', async () => {
    render(<Host />)
    const opener = screen.getByRole('button', { name: 'Open' })
    fireEvent.click(opener)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await Promise.resolve()
    expect(document.activeElement).toBe(opener)
    expect(ringHidden(opener)).toBe(false)
  })
})

describe('Sheet title', () => {
  it('wraps by default and stays on one line with the full text in the tooltip when oneLine', () => {
    const { rerender } = render(
      <Sheet title="A very long name" closeLabel="Close" onClose={() => {}}>
        x
      </Sheet>,
    )
    const h = () => screen.getByRole('heading', { level: 2 })
    expect(h().className).not.toContain('truncate')
    expect(h().hasAttribute('title')).toBe(false)
    rerender(
      <Sheet title="A very long name" oneLine closeLabel="Close" onClose={() => {}}>
        x
      </Sheet>,
    )
    expect(h().className).toContain('truncate')
    expect(h().getAttribute('title')).toBe('A very long name')
  })
})
