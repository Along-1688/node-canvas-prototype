import { describe, expect, it } from 'vitest'
import { canFavoriteMediaNode, canUploadToEmptyMediaNode, shouldSyncNodeToAssets } from '../assetEligibility'
import type { CanvasNodeData } from '../types'

function mediaData(overrides: Partial<CanvasNodeData> = {}): CanvasNodeData {
  return {
    nodeType: 'image',
    title: '素材',
    status: 'success',
    sourceKind: 'generated',
    content: '素材内容',
    ...overrides,
  }
}

describe('asset eligibility', () => {
  it('allows ordinary model results to be favorited and synced to assets', () => {
    const data = mediaData()

    expect(canFavoriteMediaNode(data)).toBe(true)
    expect(shouldSyncNodeToAssets(data)).toBe(true)
  })

  it.each([
    ['本地上传', mediaData({ sourceKind: 'upload' })],
    ['图片编辑器', mediaData({ imageOperation: { operation: 'image-editor', aspectRatio: 'custom' } })],
    ['旧版图片合成', mediaData({ imageOperation: { operation: 'image-compose', aspectRatio: 'custom' } })],
  ])('keeps %s outside favorites and the asset library', (_label, data) => {
    expect(canFavoriteMediaNode(data)).toBe(false)
    expect(shouldSyncNodeToAssets(data)).toBe(false)
  })

  it('keeps upload as the fallback for media nodes without generation inputs', () => {
    expect(canUploadToEmptyMediaNode(mediaData({ status: 'ready', content: '' }))).toBe(true)
    expect(canUploadToEmptyMediaNode(mediaData({
      status: 'ready',
      content: '',
      references: [{ nodeId: 'upstream-text', nodeType: 'text', label: '上游文本', content: '一段提示词' }],
    }))).toBe(false)
  })
})
