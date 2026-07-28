import { describe, expect, it } from 'vitest'
import {
  collectCurrentSourceNodeIds,
  containScale,
  detachImageEditorResultEdges,
  fitZoom,
  isMeaningfulDraw,
  orderPsdLayers,
  scaledExportDimensions,
} from '../imageEditorBehavior'
import { IMAGE_EDITOR_DIMENSIONS } from '../imageEditorModel'

describe('image editor geometry behavior', () => {
  it('contains landscape and portrait images while touching one canvas edge', () => {
    const landscapeScale = containScale(1600, 900, 1000, 1000)
    expect(landscapeScale).toBe(0.625)
    expect(1600 * landscapeScale).toBe(1000)
    expect(900 * landscapeScale).toBeLessThan(1000)

    const portraitScale = containScale(800, 1200, 1000, 600)
    expect(portraitScale).toBe(0.5)
    expect(800 * portraitScale).toBeLessThan(1000)
    expect(1200 * portraitScale).toBe(600)
  })

  it('supports a fractional contain target', () => {
    expect(containScale(1000, 500, 800, 600, 0.75)).toBeCloseTo(0.6)
  })

  it('fits the canvas into 60% of the viewport and clamps to TapNow zoom limits', () => {
    expect(fitZoom(1000, 500, 1200, 900)).toBe(0.72)
    expect(fitZoom(10_000, 10_000, 100, 100)).toBe(0.1)
    expect(fitZoom(10, 10, 10_000, 10_000)).toBe(5)
  })

  it('does not create a shape for a short click or drag', () => {
    expect(isMeaningfulDraw({ x: 20, y: 30 }, { x: 20, y: 30 })).toBe(false)
    expect(isMeaningfulDraw({ x: 0, y: 0 }, { x: 4, y: 4 })).toBe(false)
    expect(isMeaningfulDraw({ x: 0, y: 0 }, { x: 6, y: 6 })).toBe(true)
    expect(isMeaningfulDraw({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toBe(true)
  })

  it('rounds scaled export dimensions and never returns a zero-sized bitmap', () => {
    expect(scaledExportDimensions(801, 601, 0.75)).toEqual({ width: 601, height: 451 })
    expect(scaledExportDimensions(800, 600, 1.5)).toEqual({ width: 1200, height: 900 })
    expect(scaledExportDimensions(1, 1, 0.5)).toEqual({ width: 1, height: 1 })
    expect(scaledExportDimensions(0, -20, 3)).toEqual({ width: 1, height: 1 })
    expect(scaledExportDimensions(800, 600, Number.NaN)).toEqual({ width: 1, height: 1 })
  })

})

describe('image editor lineage behavior', () => {
  it('collects only current object sources, trims ids, and preserves first-seen order', () => {
    expect(collectCurrentSourceNodeIds([
      { sourceNodeId: ' source-b ' },
      { sourceNodeId: 'source-a' },
      { sourceNodeId: 'source-b' },
      { sourceNodeId: '' },
      { sourceNodeId: 42 },
      {},
    ])).toEqual(['source-b', 'source-a'])
  })

  it('excludes the editor output node from source lineage when reopening a result', () => {
    expect(collectCurrentSourceNodeIds([
      { sourceNodeId: 'source-image' },
      { sourceNodeId: 'editor-output' },
      { sourceNodeId: 'source-text' },
    ], ' editor-output ')).toEqual(['source-image', 'source-text'])
  })

  it('drops lineage when its source object has been deleted from the canvas', () => {
    const beforeDelete = [
      { sourceNodeId: 'kept-source' },
      { sourceNodeId: 'deleted-source' },
    ]
    const afterDelete = beforeDelete.slice(0, 1)

    expect(collectCurrentSourceNodeIds(beforeDelete)).toEqual(['kept-source', 'deleted-source'])
    expect(collectCurrentSourceNodeIds(afterDelete)).toEqual(['kept-source'])
  })

  it('keeps saved editor results independent while preserving unrelated canvas edges', () => {
    const edges = [
      { id: 'old-editor-link', target: 'editor-output', data: { relationType: 'image-operation' } },
      { id: 'other-editor-link', target: 'other-output', data: { relationType: 'image-operation' } },
      { id: 'manual-input', target: 'editor-output', data: { relationType: 'generation-input' } },
    ]

    expect(detachImageEditorResultEdges(edges, 'editor-output').map((edge) => edge.id)).toEqual([
      'other-editor-link',
      'manual-input',
    ])
    expect(edges).toHaveLength(3)
  })
})

describe('PSD layer ordering', () => {
  it('writes visible layers from top to bottom and keeps the background last', () => {
    const fabricOrder = [
      { name: 'bottom image' },
      { name: 'middle text' },
      { name: 'top sticker' },
    ]
    const background = { name: 'Background' }

    expect(orderPsdLayers(fabricOrder, background).map((layer) => layer.name)).toEqual([
      'top sticker',
      'middle text',
      'bottom image',
      'Background',
    ])
    expect(fabricOrder.map((layer) => layer.name)).toEqual([
      'bottom image',
      'middle text',
      'top sticker',
    ])
  })

  it('still emits the background for an empty canvas', () => {
    expect(orderPsdLayers([], 'Background')).toEqual(['Background'])
  })
})

describe('TapNow aspect-ratio compatibility', () => {
  it('preserves TapNow current 800x600 landscape mappings without mathematical correction', () => {
    expect(IMAGE_EDITOR_DIMENSIONS['3:2']).toEqual({ width: 800, height: 600 })
    expect(IMAGE_EDITOR_DIMENSIONS['7:4']).toEqual({ width: 800, height: 600 })
  })

  it('preserves TapNow current 600x800 portrait mappings without mathematical correction', () => {
    expect(IMAGE_EDITOR_DIMENSIONS['2:3']).toEqual({ width: 600, height: 800 })
    expect(IMAGE_EDITOR_DIMENSIONS['4:7']).toEqual({ width: 600, height: 800 })
  })
})
