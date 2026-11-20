/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(resolve(__dirname, file))
const manifest = JSON.parse(read('../public/manifest.webmanifest').toString())

// width and height are the two big-endian uint32 at bytes 16 and 20 of a PNG
function pngSize(file: string) {
  const png = read(`../public/${file.replace(/^\//, '')}`)
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`
}

describe('web app manifest', () => {
  it('declares icons that exist with the declared size and purpose', () => {
    expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toEqual(['any', 'any', 'maskable'])
    for (const icon of manifest.icons) {
      expect(pngSize(icon.src)).toBe(icon.sizes)
    }
  })

  it('has the icons linked from index.html at their sizes', () => {
    expect(pngSize('apple-touch-icon.png')).toBe('180x180')
    expect(pngSize('favicon.png')).toBe('48x48')
  })

  it('starts at the root scope', () => {
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
  })

  it('uses the light background token as theme and background colour', () => {
    const light = /--bg:\s*(#[0-9a-f]{6})/i.exec(read('theme.css').toString())![1]
    expect(manifest.theme_color).toBe(light)
    expect(manifest.background_color).toBe(light)
  })
})
