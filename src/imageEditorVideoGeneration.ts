import { HOST_VIDEO_MEDIA } from './mediaMetadata'
import type {
  CanvasFlowEdge,
  CanvasFlowNode,
  GenerationTask,
  ImageEditorVideoGenerateRequest,
  MediaMetadata,
  VideoAspectRatio,
  VideoGenerationParams,
  VideoResolution,
} from './types'

const DEFAULT_MODEL_ID = 'seedance-2'
const DEFAULT_DURATION = 5
const DEFAULT_RESOLUTION: VideoResolution = '720p'
const MAX_DURATION = 15
const SUPPORTED_RESOLUTIONS = new Set<VideoResolution>(['480p', '720p', '1080p', '4K'])
const SUPPORTED_RATIOS: Array<[VideoAspectRatio, number]> = [
  ['1:1', 1],
  ['9:16', 9 / 16],
  ['16:9', 16 / 9],
  ['3:4', 3 / 4],
  ['4:3', 4 / 3],
  ['21:9', 21 / 9],
]
const SUPPORTED_RATIO_NAMES = new Set<string>(SUPPORTED_RATIOS.map(([ratio]) => ratio))

export interface ImageEditorVideoGenerationPlanOptions {
  canvasId: string
  request: ImageEditorVideoGenerateRequest
  sourceNodes: CanvasFlowNode[]
  insertionPosition: { x: number; y: number }
  createdAt: number
  batchKey?: string
  startIndex?: number
}

export interface ImageEditorVideoGenerationPlan {
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  tasks: GenerationTask[]
  sourceNodeIds: string[]
}

function isSupportedRatio(value: string): value is VideoAspectRatio {
  return SUPPORTED_RATIO_NAMES.has(value)
}

function exactRatio(width: number, height: number): VideoAspectRatio {
  const ratio = width / height
  return SUPPORTED_RATIOS.find(([, value]) => Math.abs(value - ratio) < 0.001)?.[0] ?? 'auto'
}

function videoRatio(request: ImageEditorVideoGenerateRequest, width: number, height: number): VideoAspectRatio {
  if (request.aspectRatio && isSupportedRatio(request.aspectRatio)) return request.aspectRatio
  return exactRatio(width, height)
}

function videoResolution(value: ImageEditorVideoGenerateRequest['resolution']): VideoResolution {
  return value && SUPPORTED_RESOLUTIONS.has(value) ? value : DEFAULT_RESOLUTION
}

function previewMedia(request: ImageEditorVideoGenerateRequest, width: number, height: number, duration: number): MediaMetadata {
  return {
    ...structuredClone(HOST_VIDEO_MEDIA),
    posterUrl: request.coverDataUrl,
    width,
    height,
    duration,
  }
}

export function buildImageEditorVideoGenerationPlan({
  canvasId,
  request,
  sourceNodes,
  insertionPosition,
  createdAt,
  batchKey = String(createdAt),
  startIndex = 0,
}: ImageEditorVideoGenerationPlanOptions): ImageEditorVideoGenerationPlan {
  const prompt = request.prompt.trim()
  if (!prompt) return { nodes: [], edges: [], tasks: [], sourceNodeIds: [] }

  const width = Math.max(1, Math.round(Number.isFinite(request.width) ? request.width : 1))
  const height = Math.max(1, Math.round(Number.isFinite(request.height) ? request.height : 1))
  const count = request.count === 2 ? 2 : 1
  const durationCandidate = Number.isFinite(request.duration) ? request.duration as number : DEFAULT_DURATION
  const duration = Math.min(MAX_DURATION, Math.max(1, durationCandidate))
  const resolution = videoResolution(request.resolution)
  const modelId = request.modelId?.trim() || DEFAULT_MODEL_ID
  const safeStartIndex = Number.isFinite(startIndex) ? Math.max(0, Math.round(startIndex)) : 0
  const sourceNodeById = new Map(sourceNodes
    .filter((node) => node.data.nodeType === 'image')
    .map((node) => [node.id, node]))
  const sourceNodeIds = Array.from(new Set(request.sourceNodeIds))
    .filter((nodeId) => sourceNodeById.has(nodeId))
  const singleSourceTitle = sourceNodeIds.length === 1
    ? sourceNodeById.get(sourceNodeIds[0])?.data.title
    : undefined
  const videoGeneration: VideoGenerationParams = {
    ratio: videoRatio(request, width, height),
    resolution,
    count,
    duration,
    webSearch: false,
    generateAudio: false,
  }
  const media = previewMedia(request, width, height, duration)
  const createdAtLabel = new Date(createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const baseTitle = singleSourceTitle ? `${singleSourceTitle} · 视频新版本` : '图片编辑器视频结果'

  const nodes = Array.from({ length: count }, (_, index): CanvasFlowNode => {
    const ordinal = safeStartIndex + index
    const outputNodeId = `image-editor-video-generation-${batchKey}-${index}`
    return {
      id: outputNodeId,
      type: 'video',
      position: {
        x: insertionPosition.x + ordinal * 500,
        y: insertionPosition.y,
      },
      selected: index === 0,
      data: {
        nodeType: 'video',
        title: count > 1 || safeStartIndex > 0 ? `${baseTitle} ${ordinal + 1}` : baseTitle,
        status: 'queued',
        progress: 0,
        sourceKind: 'generated',
        content: '',
        localPrompt: prompt,
        modeId: 'first-frame',
        modelId,
        params: { ...videoGeneration },
        videoGeneration: structuredClone(videoGeneration),
        duration,
        media: structuredClone(media),
        favorite: false,
        starterReplaceable: false,
        references: [],
        cost: 35,
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
    data: { relationType: 'generation-input', inputRole: 'first-frame' },
  })))

  const tasks = nodes.map((node): GenerationTask => ({
    id: `task-${node.id}`,
    canvasId,
    nodeId: node.id,
    nodeTitle: node.data.title,
    nodeType: 'video',
    status: 'queued',
    progress: 0,
    effectivePrompt: prompt,
    inputReferenceIds: structuredClone(sourceNodeIds),
    videoGeneration: structuredClone(videoGeneration),
    modeId: 'first-frame',
    modelId,
    params: { ...videoGeneration },
    outputNodeIds: [node.id],
    modelLabel: modelId === DEFAULT_MODEL_ID ? 'Seedance 2.0 · 本地 Mock' : `${modelId} · 本地 Mock`,
    cost: 35,
    createdAt: createdAtLabel,
  }))

  return { nodes, edges, tasks, sourceNodeIds }
}
