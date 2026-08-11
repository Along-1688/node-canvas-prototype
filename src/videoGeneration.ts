import type {
  CanvasFlowEdge,
  CanvasFlowNode,
  CanvasNodeData,
  GenerationReferenceRole,
  MediaNodeType,
  MediaMetadata,
  NodeReference,
  PromptAssetReference,
  VideoGenerationMode,
  VideoGenerationParams,
  VideoOperation,
  VideoOperationResult,
} from './types'
import { videoModelCapabilities } from './mockData'

export interface VideoModeRequirement {
  mode: VideoGenerationMode
  requiredRoles: GenerationReferenceRole[]
  acceptsPromptOnly: boolean
}

export type VideoGenerationValidation =
  | { valid: true }
  | {
      valid: false
      code: 'unsupported-mode' | 'first-frame-required' | 'last-frame-required' | 'reference-required'
      reason: string
    }

export interface VideoTaskSnapshot {
  modeId: VideoGenerationMode
  modelId: string
  params: Record<string, string | number | boolean>
  videoGeneration: VideoGenerationParams
  effectivePrompt: string
  inputReferenceIds: string[]
  inputAssetIds: string[]
  inputReferences: NodeReference[]
  promptAssets: PromptAssetReference[]
}

export interface BuildVideoResultOptions {
  content?: string
  params?: Partial<VideoGenerationParams>
}

const videoModes: Record<VideoGenerationMode, VideoModeRequirement> = {
  'first-frame': {
    mode: 'first-frame',
    requiredRoles: ['first-frame'],
    acceptsPromptOnly: false,
  },
  'first-last-frame': {
    mode: 'first-last-frame',
    requiredRoles: ['first-frame', 'last-frame'],
    acceptsPromptOnly: false,
  },
  reference: {
    mode: 'reference',
    requiredRoles: [],
    acceptsPromptOnly: true,
  },
}

const videoOperationLabels: Record<VideoOperation, string> = {
  'super-resolution': '视频超分',
  'frame-interpolation': '视频补帧',
  'subtitle-removal': '智能去字幕',
  'lip-sync': '智能对口型',
  edit: '视频编辑',
}

const videoRatios = new Set<VideoGenerationParams['ratio']>(['auto', '1:1', '9:16', '16:9', '3:4', '4:3', '21:9'])
const videoResolutions = new Set<VideoGenerationParams['resolution']>(['480p', '720p', '1080p', '4K'])
const videoCounts = new Set<VideoGenerationParams['count']>([1, 2, 3, 4])

const videoOperationCosts: Record<VideoOperation, number> = {
  'super-resolution': 13,
  'frame-interpolation': 13,
  'subtitle-removal': 8,
  'lip-sync': 12,
  edit: 36,
}

function isVideoMode(value: string | undefined): value is VideoGenerationMode {
  return Boolean(value && value in videoModes)
}

function referenceType(reference: NodeReference | PromptAssetReference) {
  return 'nodeId' in reference ? reference.nodeType : reference.nodeType ?? 'image'
}

function cloneMedia(media: MediaMetadata | undefined) {
  return media ? { ...media, timelineFrameUrls: media.timelineFrameUrls ? [...media.timelineFrameUrls] : undefined } : undefined
}

function cloneReference(reference: NodeReference): NodeReference {
  return { ...reference, media: cloneMedia(reference.media) }
}

function clonePromptAsset(asset: PromptAssetReference): PromptAssetReference {
  return { ...asset, media: cloneMedia(asset.media) }
}

function assertVideoNode(data: CanvasNodeData) {
  if (data.nodeType !== 'video') throw new TypeError('Video generation helpers require a video node')
}

export function defaultVideoGenerationParams(): VideoGenerationParams {
  return {
    ratio: 'auto',
    resolution: '720p',
    count: 1,
    duration: 8,
    webSearch: false,
    generateAudio: false,
  }
}

export function videoModelCapabilityFor(modelId: string | undefined) {
  return videoModelCapabilities.find((model) => model.id === modelId) ?? videoModelCapabilities[0]
}

export function videoOperationCost(operation: VideoOperation | VideoOperationResult) {
  return videoOperationCosts[typeof operation === 'string' ? operation : operation.operation]
}

export function canUseAsVideoReference(data: CanvasNodeData | undefined) {
  if (!data || data.status === 'failed' || data.status === 'queued' || data.status === 'running') return false
  return Boolean((data.content ?? '').trim() || data.media?.url)
}

export function mediaFileExtension(media: MediaMetadata | undefined, nodeType: Exclude<MediaNodeType, 'text'>) {
  const mime = media?.mimeType?.toLowerCase() ?? ''
  const mimeExtensions: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }
  if (mimeExtensions[mime]) return mimeExtensions[mime]
  const urlExtension = media?.url.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i)?.[1]?.toLowerCase()
  if (urlExtension) return urlExtension
  return nodeType === 'video' ? 'mp4' : nodeType === 'audio' ? 'm4a' : 'png'
}

export function videoReferencesForMode(modeId: string | undefined, references: NodeReference[] = []) {
  const mode = isVideoMode(modeId) ? modeId : 'first-last-frame'
  return references.filter((reference) => {
    if (reference.nodeType === 'text') return true
    const role = reference.role ?? 'default'
    if (mode === 'first-frame') return role === 'first-frame'
    if (mode === 'first-last-frame') return role === 'first-frame' || role === 'last-frame'
    return role === 'reference' || role === 'default'
  })
}

export function remapVideoInputRolesForMode(
  targetNodeId: string,
  nextMode: VideoGenerationMode,
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
): CanvasFlowEdge[] {
  const sourceById = new Map(nodes.map((node) => [node.id, node]))
  const inputEdges = edges.filter((edge) => edge.target === targetNodeId && edge.data?.relationType === 'generation-input')
  if (!inputEdges.length) return edges

  if (nextMode === 'reference') {
    return edges.map((edge): CanvasFlowEdge => {
      if (edge.target !== targetNodeId || edge.data?.relationType !== 'generation-input') return edge
      const data: NonNullable<CanvasFlowEdge['data']> = { ...edge.data, inputRole: 'reference' }
      return { ...edge, data }
    })
  }

  const imageEdges = inputEdges.filter((edge) => sourceById.get(edge.source)?.data.nodeType === 'image')
  const first = imageEdges.find((edge) => edge.data?.inputRole === 'first-frame')
    ?? imageEdges.find((edge) => edge.data?.inputRole === 'reference' || edge.data?.inputRole === 'default')
    ?? imageEdges.find((edge) => edge.data?.inputRole === 'last-frame')
  const last = nextMode === 'first-last-frame'
    ? imageEdges.find((edge) => edge.data?.inputRole === 'last-frame' && edge.id !== first?.id)
      ?? imageEdges.find((edge) => (edge.data?.inputRole === 'reference' || edge.data?.inputRole === 'default') && edge.id !== first?.id)
    : undefined
  const roles = new Map<string, GenerationReferenceRole>()
  if (first) roles.set(first.id, 'first-frame')
  if (last) roles.set(last.id, 'last-frame')
  if (!roles.size) return edges

  return edges.map((edge): CanvasFlowEdge => {
    const role = roles.get(edge.id)
    if (!role) return edge
    const data: NonNullable<CanvasFlowEdge['data']> = { ...edge.data!, inputRole: role }
    return { ...edge, data }
  })
}

export function resolveVideoGenerationParams(data: {
  videoGeneration?: Partial<VideoGenerationParams>
  params?: Record<string, string | number | boolean>
  duration?: number
  modelId?: string
} = {}): VideoGenerationParams {
  const defaults = defaultVideoGenerationParams()
  const capability = data.modelId ? videoModelCapabilityFor(data.modelId) : undefined
  const supportedRatios = capability?.ratios ?? [...videoRatios]
  const supportedResolutions = capability?.resolutions ?? [...videoResolutions]
  const maxDuration = capability?.maxDuration ?? 15
  const legacy = data.params ?? {}
  const current = data.videoGeneration ?? {}
  const ratioCandidate = current.ratio ?? legacy.ratio
  const resolutionCandidate = current.resolution ?? legacy.resolution
  const durationCandidate = current.duration ?? legacy.duration ?? data.duration
  const countCandidate = current.count ?? legacy.count
  const webSearchCandidate = current.webSearch ?? legacy.webSearch
  const generateAudioCandidate = current.generateAudio ?? legacy.generateAudio

  return {
    ratio: typeof ratioCandidate === 'string'
      && videoRatios.has(ratioCandidate as VideoGenerationParams['ratio'])
      && supportedRatios.includes(ratioCandidate as VideoGenerationParams['ratio'])
      ? ratioCandidate as VideoGenerationParams['ratio']
      : supportedRatios.includes(defaults.ratio) ? defaults.ratio : supportedRatios[0],
    resolution: typeof resolutionCandidate === 'string'
      && videoResolutions.has(resolutionCandidate as VideoGenerationParams['resolution'])
      && supportedResolutions.includes(resolutionCandidate as VideoGenerationParams['resolution'])
      ? resolutionCandidate as VideoGenerationParams['resolution']
      : supportedResolutions.includes(defaults.resolution) ? defaults.resolution : supportedResolutions[0],
    count: typeof countCandidate === 'number' && videoCounts.has(countCandidate as VideoGenerationParams['count'])
      ? countCandidate as VideoGenerationParams['count']
      : defaults.count,
    duration: typeof durationCandidate === 'number' && Number.isFinite(durationCandidate)
      ? Math.min(maxDuration, Math.max(1, durationCandidate))
      : Math.min(defaults.duration, maxDuration),
    webSearch: typeof webSearchCandidate === 'boolean' ? webSearchCandidate : defaults.webSearch,
    generateAudio: typeof generateAudioCandidate === 'boolean' ? generateAudioCandidate : defaults.generateAudio,
  }
}

export function videoModeRequirements(modeId: string | undefined): VideoModeRequirement | null {
  if (!isVideoMode(modeId)) return null
  const requirement = videoModes[modeId]
  return { ...requirement, requiredRoles: [...requirement.requiredRoles] }
}

export function validateVideoGenerationInputs(
  modeId: string | undefined,
  references: NodeReference[] = [],
  promptAssets: PromptAssetReference[] = [],
  localPrompt = '',
  complianceAssetIds: string[] = [],
): VideoGenerationValidation {
  const requirement = videoModeRequirements(modeId)
  if (!requirement) return { valid: false, code: 'unsupported-mode', reason: '当前视频生成模式暂不支持' }

  const activeReferences = videoReferencesForMode(requirement.mode, references)
  const inputs = [...activeReferences, ...promptAssets]
  const imageInputs = inputs.filter((reference) => referenceType(reference) === 'image')
  const hasPrompt = Boolean(
    localPrompt.trim()
    || activeReferences.some((reference) => reference.nodeType === 'text' && reference.content.trim()),
  )
  const hasCompatibleReference = activeReferences.some((reference) => reference.nodeType !== 'text')
    || promptAssets.length > 0
    || complianceAssetIds.length > 0

  if (requirement.requiredRoles.includes('first-frame')
    && !imageInputs.some((reference) => reference.role === 'first-frame')) {
    return { valid: false, code: 'first-frame-required', reason: '请添加首帧图片' }
  }
  if (requirement.requiredRoles.includes('last-frame')
    && !imageInputs.some((reference) => reference.role === 'last-frame')) {
    return { valid: false, code: 'last-frame-required', reason: '请添加尾帧图片' }
  }
  if (requirement.mode === 'reference' && !hasPrompt && !hasCompatibleReference) {
    return { valid: false, code: 'reference-required', reason: '请添加视频生成参考' }
  }
  return { valid: true }
}

export function shouldShowVideoGenerationPanel(data: CanvasNodeData) {
  if (data.nodeType !== 'video' || data.videoOperation) return false
  return data.sourceKind === 'created' || data.sourceKind === 'generated'
}

export function buildVideoTaskSnapshot(data: CanvasNodeData): VideoTaskSnapshot {
  assertVideoNode(data)
  const modeId = isVideoMode(data.modeId) ? data.modeId : 'first-last-frame'
  const modelId = videoModelCapabilityFor(data.modelId).id
  const videoGeneration = resolveVideoGenerationParams({ ...data, modelId })
  const inputReferences = videoReferencesForMode(modeId, data.references).map(cloneReference)
  const promptAssets = (data.promptAssets ?? []).map(clonePromptAsset)
  const complianceAssetIds = modelId === 'seedance-2' ? [...(data.seedanceComplianceAssetIds ?? [])] : []
  const referencedText = inputReferences
    .filter((reference) => reference.nodeType === 'text')
    .map((reference) => reference.content.trim())
    .filter(Boolean)
  const effectivePrompt = [...referencedText, (data.localPrompt ?? '').trim()].filter(Boolean).join('\n\n')

  return {
    modeId,
    modelId,
    params: { ...(data.params ?? {}), ...videoGeneration },
    videoGeneration,
    effectivePrompt,
    inputReferenceIds: inputReferences.map((reference) => reference.nodeId),
    inputAssetIds: [...new Set([...promptAssets.map((asset) => asset.id), ...complianceAssetIds])],
    inputReferences,
    promptAssets,
  }
}

export function buildVideoResultData(
  source: CanvasNodeData,
  media: MediaMetadata,
  options: BuildVideoResultOptions = {},
): CanvasNodeData {
  assertVideoNode(source)
  if (!media.url.trim()) throw new TypeError('Video result media requires a URL')
  const base = structuredClone(source)
  const videoGeneration = resolveVideoGenerationParams({
    ...base,
    videoGeneration: { ...resolveVideoGenerationParams(base), ...(options.params ?? {}) },
  })

  return {
    ...base,
    status: 'success',
    sourceKind: 'generated',
    content: options.content ?? (base.content?.trim() || '生成的视频结果'),
    progress: 100,
    error: undefined,
    duration: media.duration ?? videoGeneration.duration,
    media: { ...media },
    params: { ...(base.params ?? {}), ...videoGeneration },
    videoGeneration,
    videoOperation: undefined,
  }
}

export function buildVideoDerivativeData(
  source: CanvasNodeData,
  result: VideoOperationResult,
  media: MediaMetadata | undefined = source.media,
): CanvasNodeData {
  assertVideoNode(source)
  const base = structuredClone(source)
  const operation = structuredClone(result)

  return {
    ...base,
    title: `${base.title} · ${videoOperationLabels[operation.operation]}`,
    status: 'success',
    sourceKind: 'generated',
    progress: 100,
    error: undefined,
    favorite: false,
    references: [],
    promptAssets: [],
    duration: media?.duration ?? base.duration,
    media: cloneMedia(media),
    videoOperation: operation,
  }
}

export function videoTimelineTimes(duration: number, frameCount: number) {
  if (frameCount <= 0) return []
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 8
  const inset = Math.min(0.5, safeDuration * 0.08)
  if (frameCount === 1) return [Number(Math.min(inset, safeDuration / 2).toFixed(3))]
  const usableDuration = Math.max(0, safeDuration - inset * 2)
  return Array.from({ length: frameCount }, (_, index) => Number((inset + usableDuration * index / (frameCount - 1)).toFixed(3)))
}

export function videoTimelineFrameUrls(media: MediaMetadata | undefined) {
  const extractedFrames = media?.timelineFrameUrls?.filter(Boolean) ?? []
  if (extractedFrames.length) return extractedFrames
  return media?.posterUrl ? [media.posterUrl] : []
}
