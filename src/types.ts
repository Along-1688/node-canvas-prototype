import type { Edge, Node, Viewport } from '@xyflow/react'

export type MediaNodeType = 'text' | 'image' | 'video' | 'audio'
export type GenerationStatus =
  | 'idle'
  | 'ready'
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'stale'

export type SourceKind = 'created' | 'upload' | 'asset' | 'virtual-ip' | 'generated'
export type PinColor = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple'
export type GenerationReferenceRole = 'default' | 'first-frame' | 'last-frame' | 'reference'
export type VideoGenerationMode = 'first-frame' | 'first-last-frame' | 'reference'
export type VideoAspectRatio = 'auto' | '1:1' | '9:16' | '16:9' | '3:4' | '4:3' | '21:9'
export type VideoResolution = '480p' | '720p' | '1080p' | '4K'
export type ImageOperation =
  | 'crop'
  | 'rotate'
  | 'multi-angle'
  | 'repaint'
  | 'relight'
  | 'expand'
  | 'upscale'
  | 'grid-split'
  | 'edit-text'
  | 'annotate'
  | 'prompt-regenerate'
  | 'image-editor'
  | 'image-compose'

export type AnnotationMark =
  | { id: string; kind: 'brush'; points: Array<{ x: number; y: number }>; size: number; color: string }
  | { id: string; kind: 'box'; x: number; y: number; width: number; height: number; color: string }
  | { id: string; kind: 'text'; x: number; y: number; text: string; color: string }

export type ImageEditorAspectRatio = 'custom' | '16:9' | '9:16' | '4:3' | '3:4' | '1:1' | '3:2' | '2:3' | '7:4' | '4:7' | '21:9'
export type ImageEditorShape = 'rectangle' | 'circle' | 'line' | 'star' | 'triangle' | 'speech' | 'sparkles'

export interface ImageEditorAsset {
  id: string
  sourceNodeId?: string
  title: string
  src: string
  libraryCategory?: 'generated' | 'favorite' | 'uncategorized'
  aspectRatio?: number
  composition?: ImageEditorComposition
}

export type ImageEditorLayer =
  | {
      id: string
      kind: 'image'
      sourceNodeId?: string
      src: string
      label: string
      x: number
      y: number
      width: number
      height: number
      rotation?: number
    }
  | {
      id: string
      kind: 'shape'
      shape: ImageEditorShape
      x: number
      y: number
      width: number
      height: number
      fill: string
      stroke: string
      rotation?: number
    }
  | {
      id: string
      kind: 'arrow'
      x: number
      y: number
      width: number
      height: number
      color: string
      rotation?: number
    }
  | {
      id: string
      kind: 'brush'
      points: Array<{ x: number; y: number }>
      color: string
      size: number
    }
  | {
      id: string
      kind: 'text'
      x: number
      y: number
      width: number
      height: number
      text: string
      color: string
      fontSize: number
      weight: 500 | 700
      fontFamily?: string
      fontStyle?: 'normal' | 'italic'
      underline?: boolean
      strikeThrough?: boolean
      textAlign?: 'left' | 'center' | 'right'
      letterSpacing?: number
      rotation?: number
    }

export interface ImageEditorComposition {
  version: 2
  aspectRatio: ImageEditorAspectRatio
  backgroundColor: string
  width: number
  height: number
  fabricJson: Record<string, unknown>
  sourceNodeIds: string[]
  renderedDataUrl?: string
  prompt?: string
  updatedAt?: string
  /** Kept only so V1 editor snapshots can still be opened and migrated. */
  layers?: ImageEditorLayer[]
}

export interface ImageEditorCommitPayload {
  composition: ImageEditorComposition
  media: MediaMetadata
  sourceNodeIds: string[]
  exportScale: number
}

export interface ImageEditorCommitResult {
  outputNodeId: string
}

interface ImageEditorGenerateRequestBase {
  prompt: string
  coverDataUrl: string
  width: number
  height: number
  aspectRatio?: ImageEditorAspectRatio
  modelId?: string
  sourceNodeIds: string[]
  outputNodeId: string
}

export interface ImageEditorImageGenerateRequest extends ImageEditorGenerateRequestBase {
  /** Optional while legacy image-editor callers are migrated to the discriminated request. */
  mediaType?: 'image'
  count: number
}

export interface ImageEditorVideoGenerateRequest extends ImageEditorGenerateRequestBase {
  mediaType: 'video'
  count: 1 | 2
  duration?: number
  resolution?: VideoResolution
}

export type ImageEditorGenerateRequest = ImageEditorImageGenerateRequest | ImageEditorVideoGenerateRequest

export type RepaintMask =
  | { id: string; kind: 'brush'; x: number; y: number; size: number }
  | { id: string; kind: 'smart'; x: number; y: number; size: number; label: string }

export interface ImageOperationResult {
  operation: ImageOperation
  aspectRatio?: string
  cropRect?: CanvasRect
  expandRect?: CanvasRect
  angle?: number
  flipHorizontal?: boolean
  flipVertical?: boolean
  tilt?: number
  zoom?: number
  wideAngle?: boolean
  brushMode?: 'smart' | 'brush' | 'eraser'
  brushSize?: number
  masks?: RepaintMask[]
  prompt?: string
  secondaryLight?: boolean
  lightPosition?: string
  secondaryLightPosition?: string
  lightColor?: string
  lightSmartMode?: boolean
  lightPreset?: string
  brightness?: number
  temperature?: number
  resolution?: '2K' | '4K' | '6K'
  grid?: number
  gridColumns?: number
  gridRows?: number
  gridIndex?: number
  gridColumn?: number
  gridRow?: number
  textLayers?: string[]
  annotations?: AnnotationMark[]
  editorComposition?: ImageEditorComposition
  strength?: number
}

export interface MediaMetadata {
  url: string
  posterUrl?: string
  mimeType?: string
  width?: number
  height?: number
  duration?: number
  hasAudio?: boolean
  timelineFrameUrls?: string[]
}

export interface VideoGenerationParams {
  ratio: VideoAspectRatio
  resolution: VideoResolution
  count: 1 | 2 | 3 | 4
  duration: number
  webSearch: boolean
  generateAudio: boolean
}

export interface VideoModeOptionDefinition {
  id: VideoGenerationMode
  label: string
  hint: string
}

export interface VideoModelCapability {
  id: string
  label: string
  badge: string
  hint: string
  supportedModes: VideoGenerationMode[]
  ratios: VideoAspectRatio[]
  resolutions: VideoResolution[]
  maxDuration: number
}

export interface VideoEditPreviewResult {
  id: string
  selectedTime: number
  sourceFrameUrl: string
  prompt: string
  referenceAssetId?: string
  referenceAssetLabel?: string
  referenceMedia?: MediaMetadata
  previewUrl: string
  previewFilter?: string
}

export type VideoOperationResult =
  | { operation: 'super-resolution'; model: 'mango' | 'topaz'; scale?: 2 | 4 }
  | { operation: 'frame-interpolation'; targetFps: 50 | 60 | 90 | 120 }
  | { operation: 'subtitle-removal' }
  | {
      operation: 'lip-sync'
      personId: string
      personLabel: string
      source: 'ai' | 'local'
      script: string
      voiceId?: string
      speed: number
      pitch: number
      audioName?: string
    }
  | {
      operation: 'edit'
      selectedTime: number
      prompt: string
      referenceAssetId?: string
      referenceAssetLabel?: string
      referenceMedia?: MediaMetadata
      previewUrl?: string
      previewFilter?: string
      previewResults?: VideoEditPreviewResult[]
      selectedPreviewId?: string
    }

export type VideoOperation = VideoOperationResult['operation']

export interface TextFormat {
  block: 'body' | 'h1' | 'h2' | 'h3'
  bold: boolean
  italic: boolean
}

export interface NodeReference {
  nodeId: string
  nodeType: MediaNodeType
  label: string
  content: string
  mediaVariant?: CanvasNodeData['mediaVariant']
  role?: GenerationReferenceRole
  media?: MediaMetadata
}

export interface PromptMarker {
  id: string
  sourceNodeId: string
  label: string
  x: number
  y: number
  promptOffset?: number
}

export interface PromptAssetReference {
  id: string
  title: string
  category: 'personal' | 'community'
  mediaVariant: NonNullable<CanvasNodeData['mediaVariant']>
  nodeType?: MediaNodeType
  role?: GenerationReferenceRole
  media?: MediaMetadata
}

export interface CameraParameters {
  body: string
  lens: string
  focalLength: string
  aperture: string
}

export interface ImageGenerationParams {
  ratio: 'auto' | '1:1' | '9:16' | '16:9' | '3:2' | '2:3' | '3:4' | '4:3' | '21:9'
  resolution: '1K' | '2K' | '4K'
  count: 1 | 2 | 3 | 4
  styleCategory: 'all' | 'lighting' | 'anime' | 'illustration' | 'painting' | 'contemporary'
  stylePreset?: string
  camera: CameraParameters
  enhancePrompt: boolean
  webSearch: boolean
}

export interface CanvasNodeData extends Record<string, unknown> {
  nodeType: MediaNodeType
  title: string
  status: GenerationStatus
  sourceKind: SourceKind
  content?: string
  localPrompt?: string
  modeId?: string
  modelId?: string
  params?: Record<string, string | number | boolean>
  references?: NodeReference[]
  progress?: number
  error?: string
  staleNoticeDismissed?: boolean
  duration?: number
  cost?: number
  mediaVariant?: 'dog' | 'anime' | 'ip' | 'audio' | 'poster'
  media?: MediaMetadata
  pinColor?: PinColor
  favorite?: boolean
  promptHistory?: string[]
  promptMarkers?: PromptMarker[]
  promptAssets?: PromptAssetReference[]
  detectedTextLayers?: string[]
  starterReplaceable?: boolean
  imageGeneration?: ImageGenerationParams
  imageOperation?: ImageOperationResult
  playlistComposition?: PlaylistComposition
  videoGeneration?: VideoGenerationParams
  videoOperation?: VideoOperationResult
  seedanceCompliance?: 'checking' | 'approved'
  seedanceComplianceAssetIds?: string[]
  backgroundColor?: 'default' | 'paper' | 'rose' | 'amber' | 'olive' | 'teal' | 'blue' | 'violet'
  textFormat?: TextFormat
}

export interface CanvasEdgeData extends Record<string, unknown> {
  relationType: 'generation-input' | 'image-operation' | 'video-operation'
  operation?: ImageOperation
  videoOperation?: VideoOperation
  inputRole?: GenerationReferenceRole
  highlighted?: boolean
  hovered?: boolean
}

export type CanvasFlowNode = Node<CanvasNodeData, MediaNodeType>
export type CanvasFlowEdge = Edge<CanvasEdgeData>

export interface ModelParameter {
  id: string
  label: string
  type: 'select' | 'number' | 'toggle'
  options?: Array<{ label: string; value: string | number }>
  defaultValue: string | number | boolean
}

export interface ModelDefinition {
  id: string
  label: string
  provider?: string
  parameters: ModelParameter[]
}

export interface GenerationModeDefinition {
  id: string
  label: string
  models: ModelDefinition[]
}

export interface GenerationDefinition {
  nodeType: MediaNodeType
  modes: GenerationModeDefinition[]
}

export interface GenerationTask {
  id: string
  canvasId: string
  nodeId: string
  nodeTitle: string
  nodeType: MediaNodeType
  status: GenerationStatus
  progress: number
  effectivePrompt: string
  inputReferenceIds?: string[]
  inputAssetIds?: string[]
  inputReferences?: NodeReference[]
  promptMarkers?: PromptMarker[]
  promptAssets?: PromptAssetReference[]
  imageGeneration?: ImageGenerationParams
  imageOperation?: ImageOperationResult
  videoGeneration?: VideoGenerationParams
  videoOperation?: VideoOperationResult
  modeId?: string
  modelId?: string
  params?: Record<string, string | number | boolean>
  outputNodeIds?: string[]
  outputMedia?: MediaMetadata
  modelLabel: string
  cost: number
  error?: string
  createdAt: string
}

export interface CanvasDocument {
  id: string
  name: string
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  tasks: GenerationTask[]
  groups: CanvasGroup[]
  playlists?: CanvasPlaylist[]
  viewport: Viewport
}

export interface CanvasRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasGroup {
  id: string
  name: string
  nodeIds: string[]
  bounds: CanvasRect
}

export interface CanvasPlaylistClip {
  id: string
  nodeId: string
  inPoint: number
  outPoint?: number
}

export interface CanvasPlaylist {
  id: string
  name: string
  position: { x: number; y: number }
  /** Optional so existing snapshots keep their previous default presentation width. */
  width?: number
  clips: CanvasPlaylistClip[]
  activeClipId?: string
  playheadTime?: number
}

export interface PlaylistCompositionClip {
  clipId: string
  sourceNodeId: string
  sourceTitle: string
  inPoint: number
  outPoint: number
  duration: number
}

export interface PlaylistComposition {
  playlistId: string
  playlistName: string
  clips: PlaylistCompositionClip[]
  totalDuration: number
}

export interface SessionAsset {
  id: string
  sourceCanvasId: string
  sourceNodeId: string
  title: string
  nodeType: MediaNodeType
  content?: string
  mediaVariant?: CanvasNodeData['mediaVariant']
  media?: MediaMetadata
  imageEditorComposition?: ImageEditorComposition
  folderId: string
  tags: string[]
  createdAt: string
}

export interface AssetFolder {
  id: string
  name: string
}

export type AlignmentAxis = 'x' | 'y'
export type AlignmentKind = 'start' | 'center' | 'end'

export interface AlignmentGuide {
  axis: AlignmentAxis
  position: number
  spanStart: number
  spanEnd: number
  kind: AlignmentKind
}

export type DrawerKey = 'add' | 'assets' | 'content' | 'shortcuts' | 'tutorial' | null
