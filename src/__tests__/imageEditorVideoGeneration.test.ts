import { describe, expect, it } from 'vitest'
import { buildImageEditorVideoGenerationPlan } from '../imageEditorVideoGeneration'
import type { CanvasFlowNode, ImageEditorVideoGenerateRequest, MediaNodeType } from '../types'

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

const baseRequest: ImageEditorVideoGenerateRequest = {
  mediaType: 'video',
  prompt: ' 让镜头缓慢推进 ',
  count: 2,
  coverDataUrl: 'data:image/png;base64,editor-cover',
  width: 800,
  height: 450,
  aspectRatio: '16:9',
  sourceNodeIds: ['saved-editor-image', 'saved-editor-image', 'missing', 'text-source'],
  outputNodeId: 'saved-editor-image',
}

describe('image editor outer-canvas video generation', () => {
  it('creates queued Seedance video nodes, tasks and first-frame input edges', () => {
    const plan = buildImageEditorVideoGenerationPlan({
      canvasId: 'canvas-1',
      request: baseRequest,
      sourceNodes: [
        sourceNode('saved-editor-image', 'image', '刚保存的编辑结果'),
        sourceNode('text-source', 'text', '镜头说明'),
      ],
      insertionPosition: { x: 620, y: 240 },
      createdAt: 1_720_000_000_000,
      batchKey: 'editor-video-batch',
    })

    expect(plan.sourceNodeIds).toEqual(['saved-editor-image'])
    expect(plan.nodes.map((node) => node.position)).toEqual([
      { x: 620, y: 240 },
      { x: 1120, y: 240 },
    ])
    expect(plan.nodes[0]).toMatchObject({
      id: 'image-editor-video-generation-editor-video-batch-0',
      type: 'video',
      selected: true,
      data: {
        nodeType: 'video',
        title: '刚保存的编辑结果 · 视频新版本 1',
        status: 'queued',
        progress: 0,
        localPrompt: '让镜头缓慢推进',
        modeId: 'first-frame',
        modelId: 'seedance-2',
        duration: 5,
        videoGeneration: {
          ratio: '16:9',
          resolution: '720p',
          count: 2,
          duration: 5,
        },
        media: {
          posterUrl: baseRequest.coverDataUrl,
          width: 800,
          height: 450,
          duration: 5,
        },
      },
    })
    expect(plan.edges).toHaveLength(2)
    expect(plan.edges[0]).toMatchObject({
      source: 'saved-editor-image',
      target: plan.nodes[0].id,
      data: { relationType: 'generation-input', inputRole: 'first-frame' },
    })
    expect(plan.tasks[0]).toMatchObject({
      canvasId: 'canvas-1',
      nodeId: plan.nodes[0].id,
      nodeType: 'video',
      status: 'queued',
      effectivePrompt: '让镜头缓慢推进',
      inputReferenceIds: ['saved-editor-image'],
      modeId: 'first-frame',
      modelId: 'seedance-2',
      modelLabel: 'Seedance 2.0 · 本地 Mock',
    })
  })

  it('uses explicit video parameters and continues later batches without overlap', () => {
    const plan = buildImageEditorVideoGenerationPlan({
      canvasId: 'canvas-1',
      request: {
        ...baseRequest,
        count: 1,
        modelId: 'video-model-b',
        duration: 12,
        resolution: '1080p',
        aspectRatio: 'custom',
        width: 600,
        height: 800,
        sourceNodeIds: [],
      },
      sourceNodes: [],
      insertionPosition: { x: 500, y: 300 },
      createdAt: 1,
      startIndex: 2,
    })

    expect(plan.nodes).toHaveLength(1)
    expect(plan.nodes[0].position).toEqual({ x: 1500, y: 300 })
    expect(plan.nodes[0].data.videoGeneration).toMatchObject({
      ratio: '3:4',
      resolution: '1080p',
      count: 1,
      duration: 12,
    })
    expect(plan.nodes[0].data.modelId).toBe('video-model-b')
  })

  it('rejects a blank prompt', () => {
    expect(buildImageEditorVideoGenerationPlan({
      canvasId: 'canvas-1',
      request: { ...baseRequest, prompt: '   ' },
      sourceNodes: [],
      insertionPosition: { x: 0, y: 0 },
      createdAt: 1,
    })).toEqual({ nodes: [], edges: [], tasks: [], sourceNodeIds: [] })
  })
})
