import { describe, expect, it } from 'vitest'
import {
  EXPAND_SOURCE_RECT,
  buildGridSlices,
  buildPendingImageEditorData,
  buildPendingUpscaleData,
  buildRepaintResult,
  completePendingImageEditorData,
  completeUpscaleData,
  editableTextLayersForImage,
  frameForExpandRatio,
  gridSlicePosition,
  isQuarterTurn,
  moveExpandRect,
  rectContains,
  resizeExpandRect,
  shouldShowImageGenerationPrompt,
} from '../imageOperations'
import type { CanvasNodeData } from '../types'

const sourceData: CanvasNodeData = {
  nodeType: 'image',
  title: '源图片',
  sourceKind: 'upload',
  status: 'success',
  content: '柴犬棚拍首帧',
  mediaVariant: 'dog',
  favorite: true,
}

const textPosterData: CanvasNodeData = {
  ...sourceData,
  title: '世界杯决赛海报',
  content: '世界杯决赛宣传海报',
  mediaVariant: 'poster',
  detectedTextLayers: ['决战巅峰', '世界杯决赛', '阿根廷 VS 法国'],
}

describe('image expansion geometry', () => {
  it.each(['原图比例', '1:1', '4:3', '3:4', '16:9', '9:16', '自由比例'])('keeps the full source inside the %s frame', (ratio) => {
    const frame = frameForExpandRatio(ratio)
    expect(rectContains(frame, EXPAND_SOURCE_RECT)).toBe(true)
    expect(frame.x).toBeGreaterThanOrEqual(0)
    expect(frame.y).toBeGreaterThanOrEqual(0)
    expect(frame.x + frame.width).toBeLessThanOrEqual(100)
    expect(frame.y + frame.height).toBeLessThanOrEqual(100)
  })

  it('clamps moves without cropping the source', () => {
    const frame = frameForExpandRatio('自由比例')
    const moved = moveExpandRect(frame, 100, -100)
    expect(rectContains(moved, EXPAND_SOURCE_RECT)).toBe(true)
  })

  it.each(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'])('clamps the %s resize handle without cropping the source', (handle) => {
    const frame = frameForExpandRatio('自由比例')
    const dx = handle.includes('w') ? 100 : handle.includes('e') ? -100 : 0
    const dy = handle.includes('n') ? 100 : handle.includes('s') ? -100 : 0
    const resized = resizeExpandRect(frame, handle, dx, dy)
    expect(rectContains(resized, EXPAND_SOURCE_RECT)).toBe(true)
    expect(resized.x).toBeGreaterThanOrEqual(0)
    expect(resized.y).toBeGreaterThanOrEqual(0)
    expect(resized.x + resized.width).toBeLessThanOrEqual(100)
    expect(resized.y + resized.height).toBeLessThanOrEqual(100)
  })
})

describe('grid slicing', () => {
  it.each([[1, 1, 1], [3, 3, 9], [8, 8, 64]])('creates %i×%i independent slices', (columns, rows, count) => {
    expect(buildGridSlices(columns, rows)).toHaveLength(count)
  })

  it('records row, column, background placement and canvas position', () => {
    const slices = buildGridSlices(3, 3)
    expect(slices[0]).toMatchObject({ index: 0, column: 0, row: 0, title: '1-1', backgroundPosition: '0% 0%' })
    expect(slices[4]).toMatchObject({ index: 4, column: 1, row: 1, title: '2-2', backgroundPosition: '50% 50%' })
    expect(slices[8]).toMatchObject({ index: 8, column: 2, row: 2, title: '3-3', backgroundPosition: '100% 100%' })
    expect(gridSlicePosition({ x: 100, y: 200 }, 2, 2)).toEqual({ x: 880, y: 760 })
  })
})

describe('upscale preparation and completion', () => {
  it('creates a selected-node-ready data state with 4K default and no content', () => {
    expect(buildPendingUpscaleData(sourceData)).toMatchObject({
      title: '源图片 · 图片高清',
      sourceKind: 'generated',
      status: 'ready',
      content: '',
      favorite: false,
      imageOperation: { operation: 'upscale', resolution: '4K' },
    })
  })

  it('fills the pending node in place when generation completes', () => {
    const pending = buildPendingUpscaleData(sourceData)
    expect(completeUpscaleData(pending, sourceData, '6K')).toMatchObject({
      status: 'success',
      content: '柴犬棚拍首帧',
      mediaVariant: 'dog',
      imageOperation: { operation: 'upscale', resolution: '6K' },
    })
  })
})

describe('pending image editors', () => {
  it('creates a ready rotation editor node that preserves the source media', () => {
    expect(buildPendingImageEditorData(sourceData, 'rotate')).toMatchObject({
      title: '源图片 · 旋转',
      sourceKind: 'generated',
      status: 'ready',
      content: '柴犬棚拍首帧',
      imageOperation: { operation: 'rotate', angle: 0, flipHorizontal: false, flipVertical: false },
    })
  })

  it('only exposes detected text and completes the same derived node in place', () => {
    expect(editableTextLayersForImage(sourceData)).toEqual([])
    expect(editableTextLayersForImage(textPosterData)).toEqual(['决战巅峰', '世界杯决赛', '阿根廷 VS 法国'])
    const pending = buildPendingImageEditorData(textPosterData, 'edit-text')
    expect(pending.imageOperation?.textLayers).toHaveLength(3)
    expect(completePendingImageEditorData(pending, { textLayers: ['新的标题'] })).toMatchObject({
      status: 'success',
      detectedTextLayers: ['新的标题'],
      imageOperation: { operation: 'edit-text', textLayers: ['新的标题'] },
    })
  })

  it('recognizes quarter turns independently from mirrors', () => {
    expect(isQuarterTurn(0)).toBe(false)
    expect(isQuarterTurn(90)).toBe(true)
    expect(isQuarterTurn(180)).toBe(false)
    expect(isQuarterTurn(270)).toBe(true)
  })
})

describe('image generation prompt visibility', () => {
  it.each([
    ['blank created image', { ...sourceData, sourceKind: 'created', status: 'idle', content: '' }, true],
    ['generated image', { ...sourceData, sourceKind: 'generated' }, true],
    ['regenerated image', { ...sourceData, sourceKind: 'generated', imageOperation: { operation: 'prompt-regenerate' } }, true],
    ['tool-derived grid slice', { ...sourceData, sourceKind: 'generated', imageOperation: { operation: 'grid-split' } }, false],
    ['completed rotation', { ...sourceData, sourceKind: 'generated', imageOperation: { operation: 'rotate', angle: 90 } }, false],
    ['completed relight', { ...sourceData, sourceKind: 'generated', imageOperation: { operation: 'relight' } }, false],
    ['uploaded source', sourceData, false],
    ['pending rotation', { ...sourceData, sourceKind: 'generated', status: 'ready', imageOperation: { operation: 'rotate' } }, false],
    ['pending upscale', { ...sourceData, sourceKind: 'generated', status: 'ready', imageOperation: { operation: 'upscale' } }, false],
  ] as const)('%s resolves consistently', (_label, data, expected) => {
    expect(shouldShowImageGenerationPrompt(data as CanvasNodeData)).toBe(expected)
  })
})

describe('repaint operation snapshots', () => {
  it('serializes brush and smart masks into an immutable operation result', () => {
    const masks = [
      { id: 'brush-1', kind: 'brush' as const, x: 20, y: 30, size: 42 },
      { id: 'smart-1', kind: 'smart' as const, x: 55, y: 45, size: 96, label: '人物' },
    ]
    const result = buildRepaintResult(masks, 'smart', 42, '  替换为浅绿色外套  ')

    expect(result).toEqual({ operation: 'repaint', brushMode: 'smart', brushSize: 42, masks, prompt: '替换为浅绿色外套' })
    masks[0].x = 99
    expect(result.masks?.[0].x).toBe(20)
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })
})
