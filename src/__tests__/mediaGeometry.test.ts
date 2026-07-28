import { describe, expect, it } from 'vitest'
import { batchMediaPosition, fitMediaAspect, formatMediaResolution } from '../mediaGeometry'

describe('fitMediaAspect', () => {
  it.each([
    [1920, 1080, 440, 248],
    [1600, 1200, 440, 330],
    [1080, 1440, 360, 480],
    [1080, 1920, 270, 480],
  ])('fits %sx%s media without changing its ratio', (width, height, expectedWidth, expectedHeight) => {
    expect(fitMediaAspect(width, height)).toEqual({ width: expectedWidth, height: expectedHeight, ratio: width / height })
  })

  it('uses a 16:9 fallback for missing metadata', () => {
    expect(fitMediaAspect()).toEqual({ width: 440, height: 248, ratio: 16 / 9 })
  })
})

describe('formatMediaResolution', () => {
  it('formats real media dimensions for a compact node header label', () => {
    expect(formatMediaResolution(1248, 1664)).toBe('1248 × 1664')
    expect(formatMediaResolution(1920.4, 1080.4)).toBe('1920 × 1080')
  })

  it('hides incomplete or invalid metadata', () => {
    expect(formatMediaResolution()).toBeNull()
    expect(formatMediaResolution(0, 1080)).toBeNull()
  })
})

describe('batchMediaPosition', () => {
  it('keeps two columns while reserving enough row height for portrait video nodes', () => {
    const origin = { x: 100, y: 200 }
    expect(batchMediaPosition(origin, 0)).toEqual({ x: 100, y: 200 })
    expect(batchMediaPosition(origin, 1)).toEqual({ x: 600, y: 200 })
    expect(batchMediaPosition(origin, 2)).toEqual({ x: 100, y: 760 })
    expect(batchMediaPosition(origin, 4).y - batchMediaPosition(origin, 2).y).toBe(560)
  })
})
