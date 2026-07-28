import { describe, expect, it } from 'vitest'
import { buildImageEditorGenerationPlan } from '../imageEditorGeneration'
import type { CanvasFlowNode, ImageEditorGenerateRequest, MediaNodeType } from '../types'

function sourceNode(id: string, nodeType: MediaNodeType, title: string): CanvasFlowNode {
  return {
    id,
    type: nodeType,
    position: { x: 0, y: 0 },
    data: {
      nodeType,
      title,
      status: 'success',
      sourceKind: 'upload',
      content: title,
    },
  }
}

const baseRequest: ImageEditorGenerateRequest = {
  prompt: ' 保留主体，改成夜景 ',
  count: 2,
  coverDataUrl: 'data:image/png;base64,editor-cover',
  width: 800,
  height: 450,
  sourceNodeIds: ['source-image', 'source-image', 'missing-source', 'source-text'],
  outputNodeId: 'source-image',
}

describe('image editor outer-canvas generation', () => {
  it('creates independent result nodes, tasks and generation-input lineage', () => {
    const plan = buildImageEditorGenerationPlan({
      canvasId: 'canvas-1',
      request: baseRequest,
      sourceNodes: [
        sourceNode('source-image', 'image', '源图'),
        sourceNode('source-text', 'text', '说明'),
      ],
      insertionPosition: { x: 120, y: 240 },
      createdAt: 1_720_000_000_000,
      batchKey: 'editor-1-batch-1',
      startIndex: 2,
    })

    expect(plan.sourceNodeIds).toEqual(['source-image'])
    expect(plan.nodes).toHaveLength(2)
    expect(plan.tasks).toHaveLength(2)
    expect(plan.edges).toHaveLength(2)
    expect(plan.nodes.map((node) => node.position)).toEqual([
      { x: 540, y: 240 },
      { x: 540, y: 530 },
    ])
    expect(plan.nodes[0]).toMatchObject({
      id: 'image-editor-generation-editor-1-batch-1-0',
      selected: true,
      data: {
        status: 'queued',
        sourceKind: 'generated',
        localPrompt: '保留主体，改成夜景',
        media: {
          url: baseRequest.coverDataUrl,
          width: 800,
          height: 450,
        },
        imageGeneration: { ratio: '16:9', count: 2 },
        imageOperation: {
          operation: 'prompt-regenerate',
          prompt: '保留主体，改成夜景',
          aspectRatio: '16:9',
        },
      },
    })
    expect(plan.edges[0]).toMatchObject({
      source: 'source-image',
      target: plan.nodes[0].id,
      data: { relationType: 'generation-input', operation: 'prompt-regenerate' },
    })
    expect(plan.tasks[0]).toMatchObject({
      canvasId: 'canvas-1',
      nodeId: plan.nodes[0].id,
      status: 'queued',
      effectivePrompt: '保留主体，改成夜景',
      inputReferenceIds: ['source-image'],
      outputNodeIds: [plan.nodes[0].id],
      outputMedia: { url: baseRequest.coverDataUrl },
      modelLabel: 'Gemini Banana 2 · 本地 Mock',
    })
  })

  it('supports standalone generation, clamps result count and rejects a blank prompt', () => {
    const standalone = buildImageEditorGenerationPlan({
      canvasId: 'canvas-1',
      request: { ...baseRequest, count: 99, sourceNodeIds: [] },
      sourceNodes: [],
      insertionPosition: { x: 0, y: 0 },
      createdAt: 1,
    })
    expect(standalone.nodes).toHaveLength(4)
    expect(standalone.tasks).toHaveLength(4)
    expect(standalone.edges).toEqual([])

    const blank = buildImageEditorGenerationPlan({
      canvasId: 'canvas-1',
      request: { ...baseRequest, prompt: '   ' },
      sourceNodes: [],
      insertionPosition: { x: 0, y: 0 },
      createdAt: 1,
    })
    expect(blank).toEqual({ nodes: [], edges: [], tasks: [], sourceNodeIds: [] })
  })

  it('uses enough row spacing for portrait result nodes', () => {
    const portrait = buildImageEditorGenerationPlan({
      canvasId: 'canvas-1',
      request: { ...baseRequest, width: 450, height: 800, sourceNodeIds: [] },
      sourceNodes: [],
      insertionPosition: { x: 100, y: 100 },
      createdAt: 1,
    })

    expect(portrait.nodes.map((node) => node.position)).toEqual([
      { x: 100, y: 100 },
      { x: 100, y: 820 },
    ])
    expect(portrait.nodes[0].data.imageGeneration?.ratio).toBe('9:16')
  })

  it('maps editor-only aspect ratios to supported generation ratios', () => {
    const cases: Array<{
      aspectRatio: NonNullable<ImageEditorGenerateRequest['aspectRatio']>
      width: number
      height: number
      expected: NonNullable<CanvasFlowNode['data']['imageGeneration']>['ratio']
    }> = [
      { aspectRatio: 'custom', width: 800, height: 450, expected: '16:9' },
      { aspectRatio: '7:4', width: 800, height: 600, expected: '4:3' },
      { aspectRatio: '4:7', width: 600, height: 800, expected: '3:4' },
    ]

    for (const { aspectRatio, width, height, expected } of cases) {
      const plan = buildImageEditorGenerationPlan({
        canvasId: 'canvas-1',
        request: { ...baseRequest, aspectRatio, width, height, sourceNodeIds: [] },
        sourceNodes: [],
        insertionPosition: { x: 0, y: 0 },
        createdAt: 1,
      })

      expect(plan.nodes[0].data.imageGeneration?.ratio).toBe(expected)
    }
  })
})
