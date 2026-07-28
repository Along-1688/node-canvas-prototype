import type {
  CanvasFlowEdge,
  CanvasFlowNode,
  GenerationTask,
  ImageEditorImageGenerateRequest,
  ImageGenerationParams,
  ImageOperationResult,
  MediaMetadata,
} from './types'

const DEFAULT_EDITOR_GENERATION: ImageGenerationParams = {
  ratio: 'auto',
  resolution: '2K',
  count: 1,
  styleCategory: 'all',
  camera: {
    body: 'Red V-Raptor',
    lens: 'Arri Signature Prime',
    focalLength: '24mm',
    aperture: 'f/4',
  },
  enhancePrompt: false,
  webSearch: false,
}

const SUPPORTED_RATIOS: Array<[ImageGenerationParams['ratio'], number]> = [
  ['1:1', 1],
  ['9:16', 9 / 16],
  ['16:9', 16 / 9],
  ['3:2', 3 / 2],
  ['2:3', 2 / 3],
  ['3:4', 3 / 4],
  ['4:3', 4 / 3],
  ['21:9', 21 / 9],
]
const SUPPORTED_RATIO_NAMES = new Set<string>(SUPPORTED_RATIOS.map(([ratio]) => ratio))

export interface ImageEditorGenerationPlanOptions {
  canvasId: string
  request: ImageEditorImageGenerateRequest
  sourceNodes: CanvasFlowNode[]
  insertionPosition: { x: number; y: number }
  createdAt: number
  batchKey?: string
  startIndex?: number
}

export interface ImageEditorGenerationPlan {
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  tasks: GenerationTask[]
  sourceNodeIds: string[]
}

function greatestCommonDivisor(left: number, right: number): number {
  return right === 0 ? left : greatestCommonDivisor(right, left % right)
}

function exactGenerationRatio(width: number, height: number): ImageGenerationParams['ratio'] {
  const ratio = width / height
  return SUPPORTED_RATIOS.find(([, value]) => Math.abs(value - ratio) < 0.001)?.[0] ?? 'auto'
}

function isSupportedGenerationRatio(value: string): value is ImageGenerationParams['ratio'] {
  return SUPPORTED_RATIO_NAMES.has(value)
}

function generationRatio(
  aspectRatio: ImageEditorImageGenerateRequest['aspectRatio'],
  width: number,
  height: number,
): ImageGenerationParams['ratio'] {
  if (aspectRatio && isSupportedGenerationRatio(aspectRatio)) return aspectRatio
  return exactGenerationRatio(width, height)
}

function aspectRatioLabel(width: number, height: number) {
  const divisor = greatestCommonDivisor(width, height)
  return `${width / divisor}:${height / divisor}`
}

function dataUrlMimeType(dataUrl: string) {
  return dataUrl.match(/^data:([^;,]+)/)?.[1] ?? 'image/png'
}

export function buildImageEditorGenerationPlan({
  canvasId,
  request,
  sourceNodes,
  insertionPosition,
  createdAt,
  batchKey = String(createdAt),
  startIndex = 0,
}: ImageEditorGenerationPlanOptions): ImageEditorGenerationPlan {
  const prompt = request.prompt.trim()
  if (!prompt) return { nodes: [], edges: [], tasks: [], sourceNodeIds: [] }

  const width = Math.max(1, Math.round(Number.isFinite(request.width) ? request.width : 1))
  const height = Math.max(1, Math.round(Number.isFinite(request.height) ? request.height : 1))
  const count = Math.min(4, Math.max(1, Math.round(Number.isFinite(request.count) ? request.count : 1)))
  const safeStartIndex = Number.isFinite(startIndex) ? Math.max(0, Math.round(startIndex)) : 0
  const resultRowGap = Math.max(290, Math.min(760, Math.round(360 * height / width + 80)))
  const sourceNodeById = new Map(sourceNodes
    .filter((node) => node.data.nodeType === 'image')
    .map((node) => [node.id, node]))
  const sourceNodeIds = Array.from(new Set(request.sourceNodeIds))
    .filter((nodeId) => sourceNodeById.has(nodeId))
  const singleSourceTitle = sourceNodeIds.length === 1
    ? sourceNodeById.get(sourceNodeIds[0])?.data.title
    : undefined
  const media: MediaMetadata = {
    url: request.coverDataUrl,
    posterUrl: request.coverDataUrl,
    mimeType: dataUrlMimeType(request.coverDataUrl),
    width,
    height,
  }
  const imageGeneration: ImageGenerationParams = {
    ...structuredClone(DEFAULT_EDITOR_GENERATION),
    ratio: generationRatio(request.aspectRatio, width, height),
    count: count as ImageGenerationParams['count'],
  }
  const imageOperation: ImageOperationResult = {
    operation: 'prompt-regenerate',
    prompt,
    aspectRatio: aspectRatioLabel(width, height),
    resolution: '2K',
  }
  const createdAtLabel = new Date(createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const baseTitle = singleSourceTitle ? `${singleSourceTitle} · 新版本` : '图片编辑器生成结果'

  const nodes = Array.from({ length: count }, (_, index): CanvasFlowNode => {
    const ordinal = safeStartIndex + index
    const outputNodeId = `image-editor-generation-${batchKey}-${index}`
    return {
      id: outputNodeId,
      type: 'image',
      position: {
        x: insertionPosition.x + Math.floor(ordinal / 2) * 420,
        y: insertionPosition.y + (ordinal % 2) * resultRowGap,
      },
      selected: index === 0,
      style: { width: 360 },
      data: {
        nodeType: 'image',
        title: count > 1 || safeStartIndex > 0 ? `${baseTitle} ${ordinal + 1}` : baseTitle,
        status: 'queued',
        progress: 0,
        sourceKind: 'generated',
        content: '正在根据图片编辑器 Prompt 生成',
        localPrompt: prompt,
        modeId: 'text-to-image',
        modelId: request.modelId || 'gemini-banana-2',
        imageGeneration: structuredClone(imageGeneration),
        imageOperation: structuredClone(imageOperation),
        media: structuredClone(media),
        favorite: false,
        starterReplaceable: false,
        references: [],
        cost: 0,
      },
    }
  })

  const edges = nodes.flatMap((node) => sourceNodeIds.map((sourceNodeId): CanvasFlowEdge => ({
    id: `edge-${sourceNodeId}-${node.id}`,
    source: sourceNodeId,
    sourceHandle: 'output',
    target: node.id,
    targetHandle: 'input',
    type: 'canvas',
    selected: false,
    data: { relationType: 'generation-input', operation: 'prompt-regenerate' },
  })))

  const tasks = nodes.map((node, index): GenerationTask => ({
    id: `task-${node.id}`,
    canvasId,
    nodeId: node.id,
    nodeTitle: node.data.title,
    nodeType: 'image',
    status: 'queued',
    progress: 0,
    effectivePrompt: prompt,
    inputReferenceIds: structuredClone(sourceNodeIds),
    imageGeneration: structuredClone(imageGeneration),
    imageOperation: structuredClone(imageOperation),
    outputNodeIds: [node.id],
    outputMedia: structuredClone(media),
    modelLabel: 'Gemini Banana 2 · 本地 Mock',
    cost: 0,
    createdAt: createdAtLabel,
    params: { resultIndex: index + 1, resultCount: count },
  }))

  return { nodes, edges, tasks, sourceNodeIds }
}
