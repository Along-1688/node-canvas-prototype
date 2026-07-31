import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type SetStateAction } from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  ViewportPortal,
  type Connection,
  type EdgeChange,
  type EdgeMouseHandler,
  type NodeChange,
  type NodeMouseHandler,
  type OnConnectEnd,
  type OnConnectStart,
  type OnNodeDrag,
  type Viewport,
} from '@xyflow/react'
import {
  AlignHorizontalSpaceAround,
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  CircleHelp,
  CirclePlus,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  FolderOpen,
  Grid3X3,
  GripHorizontal,
  Group,
  Hand,
  Keyboard,
  Layers3,
  Link2,
  Map as MapIcon,
  Maximize2,
  Minus,
  MousePointer2,
  Pause,
  Pencil,
  Play,
  Plus,
  Scissors,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Ungroup,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { calculateAlignmentSnap, type AlignmentBox } from './alignment'
import { buildStarterExample, starterExamples, type StarterExampleId } from './canvasExamples'
import { cloneCanvasSnapshot, restoreCanvasSnapshot, type CanvasSnapshot } from './canvasHistory'
import { CanvasActionContext, type CanvasInteractionMode } from './canvasContext'
import { areCanvasShortcutsIsolated, isCanvasDeleteShortcutTargetEditing, isCanvasShortcutTargetInteractive, isPlaylistDeleteShortcutTarget } from './canvasShortcuts'
import { allowedContextSourcesForTarget, allowedTargetsForSource, attachCanvasEdgesToBorders, isConnectionPairAllowed, isSeedanceComplianceEligible, markDownstreamNodesStale, resolveEffectivePrompt, resolveMockPromptMarkerLabel, syncTargetReferences, updateNodeData, validateConnection } from './domain'
import { edgeTypes } from './edges'
import { AnchoredPopover } from './floating'
import { ImageEditorWorkspace } from './imageEditor'
import { generationDefinitions, initialEdges, initialNodes, initialTasks } from './mockData'
import {
  buildGridSlices,
  buildPendingImageEditorData,
  buildPendingUpscaleData,
  completePendingImageEditorData,
  completeUpscaleData,
  editableTextLayersForImage,
  gridSlicePosition,
} from './imageOperations'
import {
  calculateGroupBounds,
  canStartMarquee,
  duplicateCanvasSelection,
  edgeSelectionIntersections,
  isRepeatedBlankCanvasTap,
  mergeMarqueeSelection,
  nodeDimensions,
  organizeCanvasLayout,
  reconcileDraggedNodeGroups,
  removeCanvasSelection,
  resizeGroupBounds,
  selectionIntersections,
  translateGroupNodes,
  translateNodesFromOrigin,
  translateRect,
  type GroupResizeCorner,
} from './grouping'
import { nodeTypes } from './nodes'
import { ShinyText } from './ShinyText'
import { CanvasBlankContextMenu, ContextMenu, ContinuationMenu, DrawerPanel, QuickAddMenu } from './panels'
import { MediaTypeIcon } from './mediaTypes'
import { cloneMediaMetadata, HOST_VIDEO_MEDIA, imageMediaForVariant } from './mediaMetadata'
import { batchMediaPosition } from './mediaGeometry'
import {
  addPlaylistClip,
  appendPlaylistClips,
  buildPlaylistComposition,
  findAvailablePlaylistPosition,
  isPlayablePlaylistVideo,
  isVideoNodeInPlaylistDropZone,
  locatePlaylistTime,
  playlistClipDuration,
  playlistClipWidth,
  playlistDuration,
  playlistExpandedHeight,
  playlistInsertionIndexAtPoint,
  PLAYLIST_EMPTY_HEIGHT,
  PLAYLIST_FILLED_HEIGHT,
  PLAYLIST_WIDTH,
  clampPlaylistWidth,
  playlistWidth,
  pruneMissingPlaylistClips,
  removePlaylistClip,
  reorderPlaylistClip,
  splitPlaylistClipAtTime,
} from './playlist'
import { extractVideoTimelineFrames } from './videoFrameExtraction'
import {
  buildVideoDerivativeData,
  buildVideoBatchPlan,
  buildVideoResultData,
  buildVideoTaskSnapshot,
  canUseAsVideoReference,
  defaultVideoGenerationParams,
  mediaFileExtension,
  remapVideoInputRolesForMode,
  validateVideoGenerationInputs,
  videoOperationCost,
} from './videoGeneration'
import {
  loadVideoShareSnapshot,
  shareTokenFromHash,
  type SharedVideoLoadResult,
} from './videoSharing'
import {
  canvasShareTokenFromHash,
  canvasShareUrl,
  copyCanvasShareLink,
  createCanvasShareSnapshot,
  loadCanvasShareSnapshot,
  saveCanvasShareSnapshot,
  type SharedCanvasLoadResult,
} from './canvasSharing'
import type {
  AlignmentGuide,
  AudioOperationResult,
  CanvasDocument,
  CanvasFlowEdge,
  CanvasFlowNode,
  CanvasGroup,
  CanvasPlaylist,
  CanvasPlaylistClip,
  CanvasNodeData,
  DrawerKey,
  GenerationTask,
  GenerationReferenceRole,
  ImageGenerationParams,
  ImageEditorAsset,
  ImageEditorCommitPayload,
  ImageEditorCommitResult,
  ImageOperation,
  ImageOperationResult,
  MediaNodeType,
  MediaMetadata,
  PinColor,
  PromptAssetReference,
  SessionAsset,
  AssetFolder,
  VideoGenerationMode,
  VideoGenerationParams,
  VideoOperation,
  VideoOperationResult,
} from './types'

interface QuickAddState { x: number; y: number; flowPosition: { x: number; y: number } }
interface ContinuationState extends QuickAddState { sourceNodeId: string }
interface ContextAddState extends QuickAddState { targetNodeId: string }
interface ImageEditorState {
  canvasId: string
  editorNodeId: string
  openedAt: number
}
interface MarqueeState { startX: number; startY: number; currentX: number; currentY: number; additive: boolean; pointerId: number }
interface SpacePanState { startX: number; startY: number; pointerId: number; viewport: Viewport }
interface PlaylistDropPreview { playlistId: string; nodeId: string; insertionIndex: number }
type PlaylistSelection =
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'clip'; playlistId: string; clipId: string }
  | null
interface NodeDragState {
  canvasId: string
  snapshot: CanvasSnapshot
  nodeIds: string[]
  anchorId: string
  delta: { x: number; y: number }
  updated: boolean
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 0.88 }

const DEFAULT_IMAGE_GENERATION: ImageGenerationParams = {
  ratio: '16:9',
  resolution: '2K',
  count: 1,
  styleCategory: 'all',
  camera: { body: 'Red V-Raptor', lens: 'Arri Signature Prime', focalLength: '24mm', aperture: 'f/4' },
  enhancePrompt: false,
  webSearch: false,
}

const DEFAULT_VIDEO_MEDIA = HOST_VIDEO_MEDIA

const pinColors: PinColor[] = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple']

const drawerItems: Array<{ key: Exclude<DrawerKey, null>; label: string; icon: React.ReactNode; separated?: boolean }> = [
  { key: 'add', label: '添加', icon: <CirclePlus size={20} /> },
  { key: 'assets', label: '资产', icon: <FolderOpen size={19} /> },
  { key: 'content', label: '画布内容', icon: <Layers3 size={19} /> },
  { key: 'shortcuts', label: '快捷键', icon: <Keyboard size={19} />, separated: true },
  { key: 'tutorial', label: '教程', icon: <CircleHelp size={19} /> },
]

const operationCopy: Record<ImageOperation, string> = {
  crop: '裁剪',
  rotate: '旋转',
  'multi-angle': '多角度',
  repaint: '重绘',
  relight: '打光',
  expand: '智能扩图',
  upscale: '图片高清',
  'grid-split': '宫格切分',
  'edit-text': '编辑文字',
  annotate: '标注',
  'prompt-regenerate': '再次生成',
  'image-editor': '图片编辑',
  'image-compose': '图片合成',
}

const videoOperationCopy: Record<VideoOperation, string> = {
  'super-resolution': '视频超分',
  'frame-interpolation': '视频补帧',
  'subtitle-removal': '字幕擦除',
  'lip-sync': '对口型',
  edit: '视频编辑',
}

function defaultVideoOperationResult(operation: Exclude<VideoOperation, 'lip-sync'>): VideoOperationResult {
  if (operation === 'super-resolution') return { operation, model: 'node' }
  if (operation === 'frame-interpolation') return { operation, targetFps: 50 }
  if (operation === 'subtitle-removal') return { operation }
  return { operation: 'edit', selectedTime: 0.5, prompt: '' }
}

function videoModelLabel(modelId: string | undefined) {
  const definition = generationDefinitions.find((item) => item.nodeType === 'video')
  return definition?.modes.flatMap((mode) => mode.models).find((model) => model.id === modelId)?.label ?? '视频生成模型'
}

function audioModelLabel(modelId: string | undefined) {
  const definition = generationDefinitions.find((item) => item.nodeType === 'audio')
  return definition?.modes.flatMap((mode) => mode.models).find((model) => model.id === modelId)?.label ?? '音频生成模型'
}

function videoOperationSummary(result: VideoOperationResult) {
  if (result.operation === 'super-resolution') return `${videoOperationCopy[result.operation]} · ${result.model === 'topaz' ? `Topaz ${result.scale ?? 2}x` : '基础模型'}`
  if (result.operation === 'frame-interpolation') return `${videoOperationCopy[result.operation]} · ${result.targetFps}fps`
  if (result.operation === 'lip-sync') return `${videoOperationCopy[result.operation]} · ${result.personLabel} · ${result.source === 'ai' ? 'AI 配音' : '本地配音'}`
  if (result.operation === 'edit') return `${videoOperationCopy[result.operation]} · ${result.prompt || '画面修改'}`
  return videoOperationCopy[result.operation]
}

function applyListUpdate<T>(current: T[], update: SetStateAction<T[]>) {
  return typeof update === 'function' ? update(current) : update
}

function nodeDimension(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function mediaNodeTypeForFile(file: File): Exclude<MediaNodeType, 'text'> | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (/\.(png|jpe?g|webp|gif)$/i.test(file.name)) return 'image'
  if (/\.(mp4|mov|webm|m4v)$/i.test(file.name)) return 'video'
  if (/\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name)) return 'audio'
  return null
}

function detectVideoAudio(video: HTMLVideoElement) {
  const extended = video as HTMLVideoElement & {
    audioTracks?: { length: number }
    mozHasAudio?: boolean
    webkitAudioDecodedByteCount?: number
  }
  if (extended.audioTracks) return extended.audioTracks.length > 0
  if (typeof extended.mozHasAudio === 'boolean') return extended.mozHasAudio
  if (typeof extended.webkitAudioDecodedByteCount === 'number' && extended.webkitAudioDecodedByteCount > 0) return true
  return undefined
}

function nodeBox(node: CanvasFlowNode): AlignmentBox {
  const emptyCreated = node.data.sourceKind === 'created' && !(node.data.content ?? '').trim() && !node.data.media?.url
  const fallback = emptyCreated ? {
    text: { width: 320, height: 268 },
    image: { width: 320, height: 268 },
    video: { width: 320, height: 268 },
    audio: { width: 320, height: 268 },
  }[node.data.nodeType] : {
    text: { width: 290, height: 176 },
    image: { width: 360, height: 250 },
    video: { width: 440, height: 330 },
    audio: { width: 330, height: 100 },
  }[node.data.nodeType]
  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: nodeDimension(node.measured?.width ?? node.width ?? node.style?.width, fallback.width),
    height: nodeDimension(node.measured?.height ?? node.height ?? node.style?.height, fallback.height),
  }
}

function isBlankCanvasTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  if (target.closest('.react-flow__node, .react-flow__edge, .canvas-group-frame, .canvas-playlist, .floating-popover, .quick-add-menu, .continuation-menu, .multi-selection-toolbar, .canvas-interaction-banner, .edge-action, [data-canvas-overlay="true"]')) return false
  return Boolean(target.closest('.react-flow__pane, .react-flow__background, .react-flow__viewport'))
}

function canOpenCanvasContextMenu(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return !target.closest('.react-flow__node, .react-flow__edge, .canvas-group-frame, .canvas-playlist, .floating-popover, .quick-add-menu, .continuation-menu, .multi-selection-toolbar, .canvas-interaction-banner, .edge-action, .react-flow__controls, .react-flow__panel, .react-flow__minimap, [data-canvas-overlay="true"]')
}

function buildCanvasNode(
  id: string,
  type: MediaNodeType,
  source: 'created' | 'upload' | 'asset' | 'virtual-ip',
  index: number,
  position: { x: number; y: number },
): CanvasFlowNode {
  const created = source === 'created'
  const content = type === 'text'
    ? ''
    : type === 'image'
      ? source === 'virtual-ip' ? '街头少年 01' : created ? '' : source === 'upload' ? '上传图片' : '柴犬棚拍首帧'
      : type === 'video' ? created ? '' : '樱花城市生成结果' : created ? '' : '环境氛围音'
  const data: CanvasNodeData = {
    nodeType: type,
    title: `${{ text: '文本', image: '图片', video: '视频', audio: '音频' }[type]}节点 ${index}`,
    status: created ? 'idle' : 'success',
    sourceKind: source,
    content,
    mediaVariant: source === 'virtual-ip' ? 'ip' : type === 'image' ? 'dog' : type === 'audio' ? 'audio' : 'anime',
    localPrompt: created ? '' : undefined,
    modeId: type === 'video' ? 'reference' : type === 'text' ? 'generate-copy' : type === 'image' ? 'text-to-image' : type === 'audio' ? 'audio-generate' : undefined,
    modelId: type === 'video' ? 'kling-o1' : type === 'text' ? 'gemini-flash-lite' : type === 'image' ? 'seedream-3' : type === 'audio' ? 'seed-audio-1' : undefined,
    params: type === 'video' ? { ...defaultVideoGenerationParams() } : type === 'audio' ? { speed: 1, voiceId: 'elegant-senior', voiceLabel: '淡雅学姐' } : undefined,
    imageGeneration: type === 'image' ? structuredClone(DEFAULT_IMAGE_GENERATION) : undefined,
    cost: type === 'video' ? 35 : type === 'text' ? 1 : type === 'audio' ? 12 : type === 'image' ? 18 : undefined,
    duration: type === 'video' ? 8 : type === 'audio' ? 12 : undefined,
    media: type === 'video' && !created
      ? cloneMediaMetadata(DEFAULT_VIDEO_MEDIA)
      : type === 'image' && !created
        ? imageMediaForVariant(source === 'virtual-ip' ? 'ip' : 'dog')
        : undefined,
    videoGeneration: type === 'video' ? defaultVideoGenerationParams() : undefined,
    favorite: type === 'image' || type === 'video' ? false : undefined,
    backgroundColor: type === 'text' ? 'default' : undefined,
    textFormat: type === 'text' ? { block: 'body', bold: false, italic: false } : undefined,
  }
  return {
    id,
    type,
    position,
    selected: true,
    data,
    ...(created ? {
      style: type === 'text'
        ? { width: 260, height: 288 }
        : type === 'image'
          ? { width: 260 }
          : { width: 320 },
    } : type === 'text' ? { style: { width: 290, height: 176 } } : {}),
  }
}

/**
 * The editor starts as a dedicated input container. Its linked images stay on
 * the canvas until the user explicitly opens and saves an editor project.
 */
function buildImageEditorNode(
  id: string,
  index: number,
  position: { x: number; y: number },
): CanvasFlowNode {
  const base = buildCanvasNode(id, 'image', 'created', index, position)
  return {
    ...base,
    style: { width: 220 },
    data: {
      ...base.data,
      title: '图片编辑器',
      content: '',
      sourceKind: 'created',
      status: 'idle',
      mediaVariant: undefined,
      media: undefined,
      imageGeneration: undefined,
      cost: undefined,
      imageOperation: { operation: 'image-editor', aspectRatio: 'custom' },
      references: [],
    },
  }
}

function CanvasGroupFrame({
  group,
  bounds,
  active,
  zoom,
  onSelect,
  onStartMove,
  onTranslate,
  onStartResize,
  onResize,
  onRename,
}: {
  group: CanvasGroup
  bounds: { x: number; y: number; width: number; height: number }
  active: boolean
  zoom: number
  onSelect: (ensureVisible?: boolean) => void
  onStartMove: () => void
  onTranslate: (dx: number, dy: number) => void
  onStartResize: () => void
  onResize: (corner: GroupResizeCorner, dx: number, dy: number) => void
  onRename: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(group.name)
  const dragging = useRef(false)
  const resizing = useRef<GroupResizeCorner | null>(null)
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  const frameRef = useRef<HTMLElement>(null)
  useEffect(() => setDraft(group.name), [group.name])
  const commit = () => {
    setEditing(false)
    if (draft.trim() && draft.trim() !== group.name) onRename(draft.trim())
    else setDraft(group.name)
  }
  const beginMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('input, .canvas-group-resize-handle')) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = true
    lastPointer.current = { x: event.clientX, y: event.clientY }
    onSelect()
    onStartMove()
  }
  const move = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragging.current && !resizing.current) return
    event.preventDefault()
    const previous = lastPointer.current ?? { x: event.clientX, y: event.clientY }
    const dx = (event.clientX - previous.x) / Math.max(zoom, 0.01)
    const dy = (event.clientY - previous.y) / Math.max(zoom, 0.01)
    if (resizing.current) onResize(resizing.current, dx, dy)
    else onTranslate(dx, dy)
    lastPointer.current = { x: event.clientX, y: event.clientY }
  }
  const stopMove = () => { dragging.current = false; resizing.current = null; lastPointer.current = null }
  const style = {
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
    '--group-control-scale': String(1 / Math.max(zoom, 0.01)),
  } as CSSProperties
  return <section ref={frameRef} className={`canvas-group-frame ${active ? 'active' : ''}`} style={style} aria-label={group.name} onPointerDownCapture={(event) => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>('.canvas-group-resize-handle')
    const corner = handle?.dataset.corner as GroupResizeCorner | undefined
    if (!corner || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    frameRef.current?.setPointerCapture(event.pointerId)
    resizing.current = corner
    lastPointer.current = { x: event.clientX, y: event.clientY }
    onSelect()
    onStartResize()
  }} onPointerDown={beginMove} onPointerMove={move} onPointerUp={stopMove} onPointerCancel={stopMove}>
    <div className="canvas-group-title nodrag nopan" onPointerDown={(event) => {
      if ((event.target as HTMLElement).matches('input')) return
      beginMove(event)
    }} onPointerMove={move} onPointerUp={stopMove} onDoubleClick={(event) => { event.stopPropagation(); setEditing(true) }}>
      {editing ? <input autoFocus value={draft} aria-label="分组名称" onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') { setDraft(group.name); setEditing(false) } }} /> : <span>{group.name}</span>}
    </div>
    {(['nw', 'ne', 'sw', 'se'] as GroupResizeCorner[]).map((corner) => <button key={corner} type="button" data-corner={corner} className={`canvas-group-resize-handle handle-${corner} nodrag nopan`} aria-label={`调整${group.name}边界`} />)}
  </section>
}

function SharedVideoPage({ result }: { result: SharedVideoLoadResult }) {
  const snapshot = result.status === 'ready' ? result.snapshot : undefined
  useEffect(() => {
    const previousTitle = document.title
    document.title = snapshot ? `${snapshot.title} · 节点式画布` : '分享视频不可用 · 节点式画布'
    return () => { document.title = previousTitle }
  }, [snapshot])
  const canvasUrl = `${window.location.pathname}${window.location.search}`
  return <main className="shared-video-page">
    <header><span><Sparkles size={17} /><strong>节点式画布</strong></span><a href={canvasUrl}>返回画布</a></header>
    {snapshot ? <section className="shared-video-viewer">
      <video src={snapshot.media.url} poster={snapshot.media.posterUrl} controls autoPlay={false} preload="metadata" playsInline aria-label={`${snapshot.title}分享播放器`} />
      <footer><div><strong>{snapshot.title}</strong><span>{snapshot.media.width && snapshot.media.height ? `${snapshot.media.width} × ${snapshot.media.height}` : '视频'} · {Math.round(snapshot.media.duration ?? 0)}s</span></div>{snapshot.allowDownload && <a href={snapshot.media.url} download><Download size={15} />下载视频</a>}</footer>
    </section> : <section className="shared-video-unavailable"><Play size={30} /><strong>{result.status === 'expired' ? '分享链接已过期' : '分享视频不可用'}</strong><p>{result.status === 'expired' ? '该链接已超过设置的有效期。' : '链接不存在，或分享快照已从当前浏览器清除。'}</p><a href={canvasUrl}>返回画布</a></section>}
  </main>
}

interface SharedCanvasBounds {
  minX: number
  minY: number
  width: number
  height: number
}

function sharedCanvasBounds(canvas: CanvasDocument): SharedCanvasBounds {
  const nodeBoxes = canvas.nodes.map(nodeBox)
  const playlistBoxes = (canvas.playlists ?? []).map((playlist) => ({
    x: playlist.position.x,
    y: playlist.position.y,
    width: playlistWidth(playlist),
    height: 132,
  }))
  const groupBoxes = (canvas.groups ?? []).map((group) => ({
    x: group.bounds.x,
    y: group.bounds.y,
    width: group.bounds.width,
    height: group.bounds.height,
  }))
  const boxes = [...nodeBoxes, ...playlistBoxes, ...groupBoxes]
  if (!boxes.length) return { minX: 0, minY: 0, width: 960, height: 540 }
  const padding = 80
  const minX = Math.min(...boxes.map((box) => box.x)) - padding
  const minY = Math.min(...boxes.map((box) => box.y)) - padding
  const maxX = Math.max(...boxes.map((box) => box.x + box.width)) + padding
  const maxY = Math.max(...boxes.map((box) => box.y + box.height)) + padding
  return { minX, minY, width: Math.max(640, maxX - minX), height: Math.max(360, maxY - minY) }
}

function sharedCanvasStyle(box: { x: number; y: number; width: number; height: number }, bounds: SharedCanvasBounds): CSSProperties {
  return {
    left: `${((box.x - bounds.minX) / bounds.width) * 100}%`,
    top: `${((box.y - bounds.minY) / bounds.height) * 100}%`,
    width: `${(box.width / bounds.width) * 100}%`,
    height: `${(box.height / bounds.height) * 100}%`,
  }
}

function SharedCanvasPage({ result }: { result: SharedCanvasLoadResult }) {
  const snapshot = result.status === 'ready' ? result.snapshot : undefined
  const canvas = snapshot?.canvas
  const bounds = useMemo(() => canvas ? sharedCanvasBounds(canvas) : null, [canvas])
  const nodeBoxes = useMemo(() => new Map(canvas?.nodes.map((node) => [node.id, nodeBox(node)]) ?? []), [canvas])

  useEffect(() => {
    const previousTitle = document.title
    document.title = canvas ? `${canvas.name} · 节点式画布` : '分享画布不可用 · 节点式画布'
    return () => { document.title = previousTitle }
  }, [canvas])

  const cloneCanvas = () => {
    if (!canvas) return
    const clone = structuredClone(canvas)
    clone.id = `canvas-${Date.now()}`
    clone.name = `${canvas.name}-用户（copy）`
    clone.nodes = clone.nodes.map((node) => ({ ...node, selected: false }))
    clone.edges = clone.edges.map((edge) => ({ ...edge, selected: false }))
    clone.tasks = []
    const token = `${clone.id}-${Math.random().toString(36).slice(2, 8)}`
    window.localStorage.setItem(`${CANVAS_HANDOFF_PREFIX}${token}`, JSON.stringify(clone))
    const url = new URL(window.location.href)
    url.hash = ''
    url.search = ''
    url.searchParams.set('canvasSnapshot', token)
    window.location.assign(url.toString())
  }

  const canvasUrl = `${window.location.pathname}${window.location.search}`
  return <main className="shared-canvas-page">
    <header>
      <span><Sparkles size={17} /><strong>节点式画布</strong><i>/</i><b>{canvas?.name ?? '分享画布'}</b><small>只读模式，如需创建请点击</small></span>
      <div><a href={canvasUrl}>返回画布</a>{canvas && <button type="button" onClick={cloneCanvas}><Copy size={15} />复制项目</button>}</div>
    </header>
    {canvas && bounds ? <section className="shared-canvas-viewport" aria-label={`${canvas.name}分享预览`}>
      <div className="shared-canvas-stage" style={{ aspectRatio: `${bounds.width} / ${bounds.height}` }}>
        <svg className="shared-canvas-edges" viewBox={`0 0 ${bounds.width} ${bounds.height}`} preserveAspectRatio="none" aria-hidden="true">
          {canvas.edges.map((edge) => {
            const source = nodeBoxes.get(edge.source)
            const target = nodeBoxes.get(edge.target)
            if (!source || !target) return null
            const sourceX = source.x - bounds.minX + source.width
            const sourceY = source.y - bounds.minY + source.height / 2
            const targetX = target.x - bounds.minX
            const targetY = target.y - bounds.minY + target.height / 2
            const curve = Math.max(56, Math.abs(targetX - sourceX) * 0.42)
            return <path key={edge.id} d={`M ${sourceX} ${sourceY} C ${sourceX + curve} ${sourceY}, ${targetX - curve} ${targetY}, ${targetX} ${targetY}`} />
          })}
        </svg>
        {(canvas.groups ?? []).map((group) => <div key={group.id} className="shared-canvas-group" style={sharedCanvasStyle(group.bounds, bounds)}><span>{group.name}</span></div>)}
        {canvas.nodes.map((node) => {
          const box = nodeBoxes.get(node.id)!
          const imageUrl = node.data.nodeType === 'image'
            ? node.data.media?.url ?? node.data.imageOperation?.editorComposition?.renderedDataUrl ?? imageMediaForVariant(node.data.mediaVariant)?.url
            : undefined
          const posterUrl = node.data.nodeType === 'video' ? node.data.media?.posterUrl : undefined
          return <article key={node.id} className={`shared-canvas-node type-${node.data.nodeType}`} style={sharedCanvasStyle(box, bounds)}>
            <header><MediaTypeIcon type={node.data.nodeType} /><strong>{node.data.title}</strong></header>
            <div>
              {imageUrl || posterUrl ? <img src={imageUrl ?? posterUrl} alt="" /> : node.data.nodeType === 'text' ? <p>{node.data.content || '空白文本'}</p> : <MediaTypeIcon type={node.data.nodeType} />}
            </div>
          </article>
        })}
        {(canvas.playlists ?? []).map((playlist) => <article key={playlist.id} className="shared-canvas-playlist" style={sharedCanvasStyle({ x: playlist.position.x, y: playlist.position.y, width: playlistWidth(playlist), height: 132 }, bounds)}>
          <header><Play size={14} /><strong>{playlist.name}</strong><span>{playlist.clips.length} 个片段</span></header>
          <div>{playlist.clips.map((clip) => {
            const node = canvas.nodes.find((candidate) => candidate.id === clip.nodeId)
            return <span key={clip.id} title={node?.data.title}>{node?.data.media?.posterUrl ? <img src={node.data.media.posterUrl} alt="" /> : <Play size={13} />}</span>
          })}</div>
        </article>)}
      </div>
    </section> : <section className="shared-canvas-unavailable"><Share2 size={30} /><strong>分享画布不可用</strong><p>链接不存在，或分享快照已从当前浏览器清除。</p><a href={canvasUrl}>返回画布</a></section>}
  </main>
}

function formatPlaylistTime(seconds: number) {
  const safe = Math.max(0, seconds)
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, '0')}`
}

export function PlaylistVideoPreview({ playlist, nodes, onActivate, onClose }: { playlist: CanvasPlaylist; nodes: CanvasFlowNode[]; onActivate: (clipId: string) => void; onClose?: () => void }) {
  const items = playlist.clips
    .map((clip) => ({ clip, node: nodes.find((node) => node.id === clip.nodeId) }))
    .filter((item): item is { clip: CanvasPlaylistClip; node: CanvasFlowNode } => isPlayablePlaylistVideo(item.node))
    .map((item) => ({ ...item, duration: playlistClipDuration(item.clip, item.node) }))
  const initialIndex = Math.max(0, items.findIndex((item) => item.clip.id === playlist.activeClipId))
  const initialPlaylistTime = items.slice(0, initialIndex).reduce((sum, item) => sum + item.duration, 0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<HTMLDivElement>(null)
  const pendingSeekRef = useRef<number | null>(items[initialIndex]?.clip.inPoint ?? 0)
  const continuePlayingRef = useRef(false)
  const advancingRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [currentClipId, setCurrentClipId] = useState(items[initialIndex]?.clip.id ?? '')
  const currentClipIdRef = useRef(items[initialIndex]?.clip.id ?? '')
  const [currentPlaylistTime, setCurrentPlaylistTime] = useState(initialPlaylistTime)
  const currentIndex = Math.max(0, items.findIndex((item) => item.clip.id === currentClipId))
  const current = items[currentIndex] ?? items[0]
  const totalDuration = items.reduce((sum, item) => sum + item.duration, 0)
  const clipStart = items.slice(0, currentIndex).reduce((sum, item) => sum + item.duration, 0)
  const start = current?.clip.inPoint ?? 0
  const end = current ? current.clip.outPoint ?? current.node.data.media?.duration ?? current.node.data.duration ?? 8 : 0
  const itemsSignature = items.map((item) => `${item.clip.id}:${item.clip.inPoint}:${item.clip.outPoint ?? ''}:${item.node.id}`).join('|')
  const selectLocalClip = (clipId: string) => {
    currentClipIdRef.current = clipId
    setCurrentClipId(clipId)
  }

  useEffect(() => {
    if (!items.length) return
    if (playlist.playheadTime === undefined && playlist.activeClipId === currentClipIdRef.current) return
    const activeIndex = Math.max(0, items.findIndex((item) => item.clip.id === playlist.activeClipId))
    const requestedTime = playlist.playheadTime ?? items.slice(0, activeIndex).reduce((sum, item) => sum + item.duration, 0)
    const location = locatePlaylistTime(playlist, nodes, requestedTime)
    if (!location) return
    const video = videoRef.current
    const sameClip = location.clip.id === currentClipIdRef.current
    video?.pause()
    continuePlayingRef.current = false
    advancingRef.current = false
    setPlaying(false)
    pendingSeekRef.current = location.localTime
    selectLocalClip(location.clip.id)
    setCurrentPlaylistTime(location.playlistTime)
    if (video && sameClip) video.currentTime = location.localTime
  }, [itemsSignature, playlist.activeClipId, playlist.playheadTime])

  const advanceToNext = (video: HTMLVideoElement) => {
    if (advancingRef.current) return
    const next = items[currentIndex + 1]
    if (!next) {
      advancingRef.current = true
      continuePlayingRef.current = false
      video.pause()
      video.currentTime = end
      setPlaying(false)
      setCurrentPlaylistTime(totalDuration)
      return
    }
    advancingRef.current = true
    continuePlayingRef.current = continuePlayingRef.current || !video.paused
    video.pause()
    pendingSeekRef.current = next.clip.inPoint
    selectLocalClip(next.clip.id)
    setCurrentPlaylistTime(clipStart + current.duration)
    onActivate(next.clip.id)
  }

  const toggle = async () => {
    const video = videoRef.current
    if (!video || !current) return
    if (!video.paused) {
      continuePlayingRef.current = false
      video.pause()
      setPlaying(false)
      return
    }
    if (currentIndex === items.length - 1 && video.currentTime >= end - 0.05) {
      const first = items[0]
      continuePlayingRef.current = true
      advancingRef.current = first.clip.id !== current.clip.id
      pendingSeekRef.current = first.clip.inPoint
      selectLocalClip(first.clip.id)
      setCurrentPlaylistTime(0)
      onActivate(first.clip.id)
      if (first.clip.id !== current.clip.id) return
      video.currentTime = first.clip.inPoint
    }
    try {
      continuePlayingRef.current = true
      await video.play()
      setPlaying(true)
    } catch {
      continuePlayingRef.current = false
      setPlaying(false)
    }
  }

  const seekPlaylist = (playlistTime: number) => {
    const location = locatePlaylistTime(playlist, nodes, playlistTime)
    if (!location) return
    const video = videoRef.current
    video?.pause()
    continuePlayingRef.current = false
    advancingRef.current = false
    setPlaying(false)
    setCurrentPlaylistTime(location.playlistTime)
    pendingSeekRef.current = location.localTime
    if (location.clip.id === currentClipId && video) {
      video.currentTime = location.localTime
    } else {
      selectLocalClip(location.clip.id)
      onActivate(location.clip.id)
    }
  }

  const toggleMuted = () => {
    const next = !muted
    setMuted(next)
    if (videoRef.current) videoRef.current.muted = next
  }

  const enterFullscreen = async () => {
    try {
      await playerRef.current?.requestFullscreen?.()
    } catch {
      // The browser may deny fullscreen when the prototype is embedded.
    }
  }

  if (!current) return null
  return <div ref={playerRef} className="playlist-player">
    <video ref={videoRef} key={current.clip.id} src={current.node.data.media?.url} poster={current.node.data.media?.posterUrl} preload="metadata" playsInline muted={muted} aria-label={`${current.node.data.title}播放预览`} onLoadedMetadata={(event) => {
      const nextTime = Math.min(Math.max(pendingSeekRef.current ?? start, start), end)
      event.currentTarget.currentTime = nextTime
      pendingSeekRef.current = null
      advancingRef.current = false
      if (continuePlayingRef.current) {
        void event.currentTarget.play().then(() => setPlaying(true)).catch(() => { continuePlayingRef.current = false; setPlaying(false) })
      }
    }} onClick={toggle} onTimeUpdate={(event) => {
      const localTime = Math.min(Math.max(event.currentTarget.currentTime, start), end)
      setCurrentPlaylistTime(Math.min(clipStart + localTime - start, totalDuration))
      if (event.currentTarget.currentTime >= end - 0.02) advanceToNext(event.currentTarget)
    }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={(event) => advanceToNext(event.currentTarget)} />
    <button type="button" className="playlist-player-mute" onClick={toggleMuted} aria-label={muted ? '打开播放列表声音' : '静音播放列表'} title={muted ? '打开声音' : '静音'}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
    {onClose && <button type="button" className="playlist-preview-close" onClick={onClose} aria-label="关闭播放列表预览" title="关闭预览"><X size={15} /></button>}
    <div className="playlist-player-controls">
      <button type="button" onClick={toggle} aria-label={playing ? '暂停播放列表' : '播放播放列表'}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button>
      <small>{formatPlaylistTime(currentPlaylistTime)} / {formatPlaylistTime(totalDuration)}</small>
      <input type="range" min={0} max={totalDuration} step={0.05} value={Math.min(Math.max(currentPlaylistTime, 0), totalDuration)} onChange={(event) => seekPlaylist(Number(event.target.value))} aria-label="播放列表播放进度" />
      <button type="button" onClick={() => void enterFullscreen()} aria-label="全屏播放列表" title="全屏"><Maximize2 size={15} /></button>
    </div>
  </div>
}

export function PlaylistFrame({
  playlist,
  nodes,
  zoom,
  selected,
  selectedClipId,
  selecting,
  mergeCandidate,
  dropPreviewIndex,
  onSelectPlaylist,
  onSelectClip,
  onAppendPlaylist,
  onBeginSelection,
  onActivate,
  onLockTime,
  onSplit,
  onReorder,
  onExportToCanvas,
  onStartMove,
  onMove,
  onStartResize,
  onResize,
}: {
  playlist: CanvasPlaylist
  nodes: CanvasFlowNode[]
  zoom: number
  selected: boolean
  selectedClipId?: string
  selecting: boolean
  mergeCandidate: boolean
  dropPreviewIndex?: number
  onSelectPlaylist: (ensureVisible?: boolean) => void
  onSelectClip: (clipId: string, ensureVisible?: boolean) => void
  onAppendPlaylist: () => void
  onBeginSelection: () => void
  onActivate: (clipId: string) => void
  onLockTime: (time: number, clipId: string) => void
  onSplit: (clipId: string, splitTime: number) => void
  onReorder: (clipId: string, insertionIndex: number) => void
  onExportToCanvas: () => void
  onStartMove: () => void
  onMove: (dx: number, dy: number) => void
  onStartResize: () => void
  onResize: (width: number) => void
}) {
  const clipNodes = playlist.clips
    .map((clip) => ({ clip, node: nodes.find((node) => node.id === clip.nodeId) }))
    .filter((item): item is { clip: CanvasPlaylistClip; node: CanvasFlowNode } => isPlayablePlaylistVideo(item.node))
    .map((item) => ({ ...item, duration: playlistClipDuration(item.clip, item.node) }))
  const active = selectedClipId ? clipNodes.find((item) => item.clip.id === selectedClipId) : undefined
  const totalDuration = playlistDuration(playlist, nodes)
  const activeMediaUrl = active?.node.data.media?.url
  const lockedLocation = playlist.playheadTime === undefined ? null : locatePlaylistTime(playlist, nodes, playlist.playheadTime)
  const lockedSplitTime = active && lockedLocation?.clip.id === active.clip.id ? lockedLocation.localTime : undefined
  const canSplit = Boolean(active && lockedSplitTime !== undefined && lockedSplitTime > active.clip.inPoint + 0.05 && lockedSplitTime < (active.clip.outPoint ?? active.node.data.media?.duration ?? active.node.data.duration ?? 8) - 0.05)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const hoverLocation = hoverTime === null ? null : locatePlaylistTime(playlist, nodes, hoverTime)
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null)
  const [reorderInsertionIndex, setReorderInsertionIndex] = useState<number | null>(null)
  const timelineTrackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const resizeRef = useRef<{ x: number; width: number } | null>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const resizeMovedRef = useRef(false)
  const currentWidth = playlistWidth(playlist)
  useEffect(() => () => dragCleanupRef.current?.(), [])
  useEffect(() => () => resizeCleanupRef.current?.(), [])
  const beginMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onSelectPlaylist(false)
    dragRef.current = { x: event.clientX, y: event.clientY }
    onStartMove()
    const move = (pointerEvent: PointerEvent) => {
      const previous = dragRef.current
      if (!previous) return
      const dx = (pointerEvent.clientX - previous.x) / Math.max(zoom, 0.01)
      const dy = (pointerEvent.clientY - previous.y) / Math.max(zoom, 0.01)
      dragRef.current = { x: pointerEvent.clientX, y: pointerEvent.clientY }
      onMove(dx, dy)
    }
    const stop = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      dragCleanupRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    dragCleanupRef.current = stop
  }
  const beginResize = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onSelectPlaylist(false)
    onStartResize()
    resizeMovedRef.current = false
    resizeRef.current = { x: event.clientX, width: currentWidth }
    const move = (pointerEvent: PointerEvent) => {
      const origin = resizeRef.current
      if (!origin) return
      const delta = (pointerEvent.clientX - origin.x) / Math.max(zoom, 0.01)
      if (Math.abs(delta) > 2) resizeMovedRef.current = true
      onResize(clampPlaylistWidth(origin.width + delta))
    }
    const stop = () => {
      resizeRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      resizeCleanupRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    resizeCleanupRef.current = stop
  }
  const toggleWidth = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (resizeMovedRef.current) {
      resizeMovedRef.current = false
      return
    }
    onResize(currentWidth < 570 ? 720 : 440)
  }
  const pointerTimeForClip = (element: HTMLElement, clientX: number, clipIndex: number, clipDuration: number) => {
    const rect = element.getBoundingClientRect()
    if (!rect.width) return null
    const clipStart = clipNodes.slice(0, clipIndex).reduce((sum, item) => sum + item.duration, 0)
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    return clipStart + ratio * clipDuration
  }
  const lockTimelineTime = (time: number) => {
    const location = locatePlaylistTime(playlist, nodes, time)
    if (location) onLockTime(location.playlistTime, location.clip.id)
  }
  return <section className={`canvas-playlist nodrag nopan ${clipNodes.length ? 'has-clips' : 'is-empty'} ${selected ? 'is-selected' : ''} ${active ? 'has-preview' : ''} ${selecting ? 'is-selecting' : ''} ${mergeCandidate ? 'is-merge-candidate' : ''}`} style={{ left: playlist.position.x, top: playlist.position.y, width: currentWidth }} aria-label={playlist.name} data-canvas-overlay="true" tabIndex={0} onFocus={(event) => { if (!mergeCandidate && event.target === event.currentTarget) onSelectPlaylist() }} onPointerDownCapture={(event) => {
    if (!mergeCandidate || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
  }} onClickCapture={(event) => {
    if (!mergeCandidate) return
    event.preventDefault()
    event.stopPropagation()
    onAppendPlaylist()
  }} onPointerDown={(event) => {
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, summary')) return
    event.stopPropagation()
    onSelectPlaylist()
  }} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
    <button type="button" className="playlist-move-handle" onPointerDown={beginMove} onClick={(event) => event.stopPropagation()} aria-label="移动播放列表" title="拖动播放列表"><GripHorizontal size={16} /></button>
    {selected && active && activeMediaUrl && <PlaylistVideoPreview playlist={playlist} nodes={nodes} onActivate={onActivate} onClose={() => onSelectPlaylist(false)} />}
    <div className={`playlist-editor ${selected && active ? 'has-actions' : 'is-compact'}`}>
      {selected && active && <aside>
        <button type="button" disabled={!canSplit} onClick={() => canSplit && lockedSplitTime !== undefined && onSplit(active.clip.id, lockedSplitTime)} aria-label="切割片段" title={canSplit ? `在 ${lockedSplitTime!.toFixed(1)} 秒处切割` : '先在时间线上点击锁定切割点'}><Scissors size={17} /></button>
        <details className="playlist-download-menu">
          <summary aria-label="打开播放列表下载菜单" title="下载"><Download size={17} /></summary>
          <div className="playlist-download-options" role="menu" aria-label="播放列表下载">
            <a href={activeMediaUrl} download role="menuitem">下载原始片段 (mp4)</a>
            <a
              href={activeMediaUrl}
              download={`${playlist.name}-mock.mp4`}
              role="menuitem"
              title="本地 Mock：暂以当前片段演示组合视频下载"
              aria-label="模拟下载组合视频，本地 Mock 暂以当前片段演示"
            >模拟下载组合视频 (mp4)</a>
            <button type="button" role="menuitem" onClick={onExportToCanvas}>导出到画布</button>
          </div>
        </details>
      </aside>}
      <div className="playlist-timeline">
        <div className="playlist-time-ruler" aria-hidden="true"><span>{formatPlaylistTime(0)}</span>{totalDuration > 0 && <><span>{formatPlaylistTime(totalDuration / 2)}</span><span>{formatPlaylistTime(totalDuration)}</span></>}</div>
        <div ref={timelineTrackRef} className={`playlist-clip-track ${clipNodes.length > 7 ? 'is-dense' : ''}`} tabIndex={0} aria-label="播放列表时间线，使用左右方向键移动切割点" onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          const step = event.shiftKey ? 1 : .1
          const current = playlist.playheadTime ?? 0
          const next = event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? totalDuration
              : event.key === 'ArrowLeft'
                ? Math.max(0, current - step)
                : event.key === 'ArrowRight'
                  ? Math.min(totalDuration, current + step)
                  : null
          if (next === null) return
          event.preventDefault()
          lockTimelineTime(next)
        }} onPointerLeave={() => setHoverTime(null)}>
          {clipNodes.map(({ clip, node, duration }, index) => {
            const lockedRatio = lockedLocation?.clip.id === clip.id
              ? Math.min(Math.max((lockedLocation.localTime - clip.inPoint) / duration, 0), 1)
              : null
            const hoverRatio = hoverLocation?.clip.id === clip.id
              ? Math.min(Math.max((hoverLocation.localTime - clip.inPoint) / duration, 0), 1)
              : null
            return <Fragment key={clip.id}>
            {dropPreviewIndex === index && <i className="playlist-drop-placeholder" aria-hidden="true" />}
            {reorderInsertionIndex === index && <i className="playlist-reorder-placeholder" aria-hidden="true" />}
            <button type="button" draggable data-playlist-clip={clip.id} className={`playlist-clip ${active?.clip.id === clip.id ? 'active' : ''} ${draggingClipId === clip.id ? 'is-dragging' : ''}`} style={{ flex: `0 0 ${playlistClipWidth(duration)}px` }} onPointerDown={(event) => event.stopPropagation()} onFocus={() => onSelectClip(clip.id, false)} onPointerMove={(event) => {
              if (draggingClipId) return
              setHoverTime(pointerTimeForClip(event.currentTarget, event.clientX, index, duration))
            }} onClick={(event) => {
              event.stopPropagation()
              onSelectClip(clip.id)
              if (event.detail === 0) return
              const time = pointerTimeForClip(event.currentTarget, event.clientX, index, duration)
              if (time !== null) lockTimelineTime(time)
            }} onDragStart={(event) => {
              event.stopPropagation()
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', clip.id)
              setDraggingClipId(clip.id)
              setReorderInsertionIndex(index)
            }} onDragOver={(event) => {
              if (!draggingClipId) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              const rect = event.currentTarget.getBoundingClientRect()
              setReorderInsertionIndex(index + (event.clientX > rect.left + rect.width / 2 ? 1 : 0))
            }} onDrop={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const sourceId = draggingClipId ?? event.dataTransfer.getData('text/plain')
              if (sourceId && reorderInsertionIndex !== null) onReorder(sourceId, reorderInsertionIndex)
              setDraggingClipId(null)
              setReorderInsertionIndex(null)
            }} onDragEnd={() => { setDraggingClipId(null); setReorderInsertionIndex(null) }} onKeyDown={(event) => {
              if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
              event.preventDefault()
              event.stopPropagation()
              onReorder(clip.id, event.key === 'ArrowLeft' ? index - 1 : index + 2)
            }} title="拖动调整顺序，Alt+方向键精调" aria-label={`选择片段 ${index + 1}，时长 ${duration.toFixed(1)} 秒`}>
              {node.data.media?.posterUrl ? <img src={node.data.media.posterUrl} alt="" /> : <div className="playlist-clip-placeholder"><Play size={17} fill="currentColor" /></div>}
              <span>{index + 1}</span><small>{duration.toFixed(1)}s</small>
              {hoverRatio !== null && <i className="playlist-timeline-line is-candidate" style={{ left: `${hoverRatio * 100}%` }} aria-hidden="true" />}
              {lockedRatio !== null && <i className="playlist-timeline-line is-locked" style={{ left: `${lockedRatio * 100}%` }} aria-hidden="true" />}
            </button>
          </Fragment>})}
          {dropPreviewIndex === clipNodes.length && <i className="playlist-drop-placeholder" aria-hidden="true" />}
          {reorderInsertionIndex === clipNodes.length && <i className="playlist-reorder-placeholder" aria-hidden="true" />}
          <button type="button" className="playlist-add-clip" onPointerDown={(event) => event.stopPropagation()} onClick={onBeginSelection} onDragOver={(event) => {
            if (!draggingClipId) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            setReorderInsertionIndex(clipNodes.length)
          }} onDrop={(event) => {
            if (!draggingClipId) return
            event.preventDefault()
            event.stopPropagation()
            onReorder(draggingClipId, clipNodes.length)
            setDraggingClipId(null)
            setReorderInsertionIndex(null)
          }} aria-label="添加视频片段" aria-pressed={selecting} title={selecting ? '继续添加片段' : '添加片段'}><Plus size={18} /></button>
        </div>
      </div>
      <button type="button" className="playlist-resize-handle" onPointerDown={beginResize} onClick={toggleWidth} aria-label="调整播放列表宽度" title="拖动或点击调整播放列表宽度"><span /></button>
    </div>
  </section>
}

function initialCanvas(): CanvasDocument {
  return {
    id: 'canvas-1',
    name: '画布 1',
    nodes: syncTargetReferences(structuredClone(initialNodes), structuredClone(initialEdges)),
    edges: structuredClone(initialEdges),
    tasks: structuredClone(initialTasks),
    groups: [],
    playlists: [],
    viewport: { ...DEFAULT_VIEWPORT },
  }
}

const CANVAS_HANDOFF_PREFIX = 'node-canvas-handoff:'

function initialWorkspace() {
  const url = new URL(window.location.href)
  const token = url.searchParams.get('canvasSnapshot')
  if (token) {
    try {
      const raw = window.localStorage.getItem(`${CANVAS_HANDOFF_PREFIX}${token}`)
      const parsed = raw ? JSON.parse(raw) as CanvasDocument : null
      window.localStorage.removeItem(`${CANVAS_HANDOFF_PREFIX}${token}`)
      url.searchParams.delete('canvasSnapshot')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
      if (parsed && parsed.id && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
        return { canvases: [{ ...parsed, edges: attachCanvasEdgesToBorders(parsed.edges), groups: parsed.groups ?? [], playlists: parsed.playlists ?? [] }], activeCanvasId: parsed.id }
      }
    } catch {
      window.localStorage.removeItem(`${CANVAS_HANDOFF_PREFIX}${token}`)
    }
  }
  const canvas = initialCanvas()
  return { canvases: [canvas], activeCanvasId: canvas.id }
}

function CanvasPrototype() {
  const stableNodeTypes = useMemo(() => nodeTypes, [])
  const stableEdgeTypes = useMemo(() => edgeTypes, [])
  const [workspace] = useState(initialWorkspace)
  const [canvases, setCanvases] = useState<CanvasDocument[]>(workspace.canvases)
  const [activeCanvasId, setActiveCanvasId] = useState(workspace.activeCanvasId)
  const [drawer, setDrawer] = useState<DrawerKey>(null)
  const [showMiniMap, setShowMiniMap] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [canvasTool, setCanvasTool] = useState<'move' | 'hand'>('move')
  const [canvasToolOpen, setCanvasToolOpen] = useState(false)
  const [zoom, setZoom] = useState(0.88)
  const [toast, setToast] = useState<string | null>(null)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [shareAccess, setShareAccess] = useState<'public' | 'private'>('public')
  const [quickAdd, setQuickAdd] = useState<QuickAddState | null>(null)
  const [canvasContextMenu, setCanvasContextMenu] = useState<QuickAddState | null>(null)
  const [continuation, setContinuation] = useState<ContinuationState | null>(null)
  const [contextAdd, setContextAdd] = useState<ContextAddState | null>(null)
  const [connectingSourceNodeId, setConnectingSourceNodeId] = useState<string | null>(null)
  const [interactionMode, setInteractionMode] = useState<CanvasInteractionMode>(null)
  const [hoveredReferenceNodeId, setHoveredReferenceNodeId] = useState<string | null>(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const [hoveredPromptMarkerId, setHoveredPromptMarkerId] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const [spacePanning, setSpacePanning] = useState(false)
  const [sessionAssets, setSessionAssets] = useState<SessionAsset[]>([])
  const [assetFolders] = useState<AssetFolder[]>([
    { id: 'uncategorized', name: '未分类' },
    { id: 'campaign', name: '产品宣传片' },
  ])
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([])
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false)
  const [canvasActionsId, setCanvasActionsId] = useState<string | null>(null)
  const [deleteCanvasId, setDeleteCanvasId] = useState<string | null>(null)
  const [renamingCanvasId, setRenamingCanvasId] = useState<string | null>(null)
  const [canvasNameDraft, setCanvasNameDraft] = useState('')
  const [playlistSelection, setPlaylistSelection] = useState<PlaylistSelection>(null)
  const selectedPlaylistId = playlistSelection?.playlistId ?? null
  const [playlistDropPreview, setPlaylistDropPreview] = useState<PlaylistDropPreview | null>(null)
  const [imageEditor, setImageEditor] = useState<ImageEditorState | null>(null)
  const canvasMenuButtonRef = useRef<HTMLButtonElement>(null)
  const { fitView, flowToScreenPosition, getViewport, setCenter, setViewport, zoomIn, zoomOut, screenToFlowPosition } = useReactFlow<CanvasFlowNode, CanvasFlowEdge>()
  const taskTimers = useRef<number[]>([])
  const nodeCounter = useRef(8)
  const canvasCounter = useRef(2)
  const groupCounter = useRef(1)
  const connectSourceRef = useRef<string | null>(null)
  const spacePressedRef = useRef(false)
  const suppressPaneClickRef = useRef(false)
  const blankCanvasTapRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const pendingQuickAddRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const marqueeRef = useRef<MarqueeState | null>(null)
  const spacePanRef = useRef<SpacePanState | null>(null)
  const histories = useRef<Record<string, CanvasSnapshot[]>>({ [workspace.activeCanvasId]: [] })
  const futures = useRef<Record<string, CanvasSnapshot[]>>({ [workspace.activeCanvasId]: [] })
  const nodeDragRef = useRef<NodeDragState | null>(null)
  const playlistDropPreviewRef = useRef<PlaylistDropPreview | null>(null)
  const canvasesRef = useRef(canvases)
  const activeCanvasIdRef = useRef(activeCanvasId)
  const toastTimer = useRef<number | null>(null)

  const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId) ?? canvases[0]
  const nodes = activeCanvas.nodes
  const edges = activeCanvas.edges
  const tasks = activeCanvas.tasks
  const groups = activeCanvas.groups
  const playlists = activeCanvas.playlists ?? []

  useEffect(() => {
    const completedNodeIds = new Set(tasks.filter((task) => task.status === 'success').map((task) => task.nodeId))
    const generatedNodes = nodes.filter((node) => completedNodeIds.has(node.id))
    if (!generatedNodes.length) return

    setSessionAssets((current) => {
      let changed = false
      const next = [...current]
      generatedNodes.forEach((node) => {
        const existingIndex = next.findIndex((asset) => asset.sourceCanvasId === activeCanvasId && asset.sourceNodeId === node.id)
        const existing = existingIndex >= 0 ? next[existingIndex] : undefined
        const media = node.data.media ? {
          ...structuredClone(node.data.media),
          posterUrl: node.data.nodeType === 'image'
            ? node.data.media.posterUrl ?? node.data.media.url
            : node.data.media.posterUrl,
        } : undefined
        const unchanged = existing
          && existing.title === node.data.title
          && existing.content === node.data.content
          && existing.mediaVariant === node.data.mediaVariant
          && existing.media?.url === media?.url
          && existing.media?.posterUrl === media?.posterUrl
        if (unchanged) return
        const asset: SessionAsset = {
          id: existing?.id ?? `generated-asset-${activeCanvasId}-${node.id}`,
          sourceCanvasId: activeCanvasId,
          sourceNodeId: node.id,
          title: node.data.title,
          nodeType: node.data.nodeType,
          content: node.data.content,
          mediaVariant: node.data.mediaVariant,
          media,
          imageEditorComposition: node.data.imageOperation?.editorComposition
            ? structuredClone(node.data.imageOperation.editorComposition)
            : undefined,
          folderId: existing?.folderId ?? 'uncategorized',
          tags: existing?.tags ?? [],
          createdAt: existing?.createdAt ?? new Date().toLocaleString('zh-CN'),
        }
        if (existingIndex >= 0) next[existingIndex] = asset
        else next.push(asset)
        changed = true
      })
      return changed ? next : current
    })
  }, [activeCanvasId, nodes, tasks])
  const imageEditorCanvas = imageEditor
    ? canvases.find((canvas) => canvas.id === imageEditor.canvasId)
    : activeCanvas
  const imageEditorCanvasNodes = imageEditorCanvas?.nodes ?? []
  const imageEditorAssets = useMemo<ImageEditorAsset[]>(() => imageEditorCanvasNodes
    .flatMap((node) => {
      if (node.data.nodeType !== 'image') return []
      const composition = node.data.imageOperation?.editorComposition
      const fallbackMedia = (node.data.content ?? '').trim() ? imageMediaForVariant(node.data.mediaVariant) : undefined
      const media = node.data.media ?? fallbackMedia
      const src = node.data.media?.url ?? composition?.renderedDataUrl ?? fallbackMedia?.url
      if (!src) return []
      return [{
        id: `editor-asset-${node.id}`,
        sourceNodeId: node.id,
        title: node.data.title,
        src,
        aspectRatio: media?.width && media.height
          ? media.width / media.height
          : composition?.width && composition.height
            ? composition.width / composition.height
            : undefined,
        composition,
      }]
    }), [imageEditorCanvasNodes])
  const imageEditorNode = imageEditor
    ? imageEditorCanvasNodes.find((node) => node.id === imageEditor.editorNodeId && node.data.nodeType === 'image')
    : undefined
  const imageEditorInitialAssets = useMemo<ImageEditorAsset[]>(() => {
    if (!imageEditor || !imageEditorCanvas) return []
    const linkedAssets: ImageEditorAsset[] = []
    imageEditorCanvas.edges
      .filter((edge) => edge.target === imageEditor.editorNodeId && edge.data?.relationType === 'generation-input')
      .forEach((edge) => {
        const asset = imageEditorAssets.find((candidate) => candidate.sourceNodeId === edge.source)
        if (asset) linkedAssets.push(asset)
      })
    return linkedAssets
  }, [imageEditor, imageEditorAssets, imageEditorCanvas])
  const imageEditorSource = imageEditorInitialAssets[0]
  const imageEditorInitialComposition = imageEditor
    ? imageEditorNode?.data.imageOperation?.editorComposition
    : undefined
  const imageEditorHistoryAssets = useMemo<ImageEditorAsset[]>(() => {
    const deduped = new Map<string, ImageEditorAsset>()
    canvases.forEach((canvas) => {
      const generatedNodeIds = new Set(canvas.tasks
        .filter((task) => task.nodeType === 'image' && task.status === 'success')
        .flatMap((task) => task.outputNodeIds ?? [task.nodeId]))
      canvas.nodes.forEach((node) => {
        if (node.data.nodeType !== 'image' || node.data.status !== 'success') return
        const composition = node.data.imageOperation?.editorComposition
        const fallbackMedia = (node.data.content ?? '').trim() ? imageMediaForVariant(node.data.mediaVariant) : undefined
        const media = node.data.media ?? fallbackMedia
        const src = node.data.media?.url ?? composition?.renderedDataUrl ?? fallbackMedia?.url
        if (!src) return
        const libraryCategory = node.data.favorite
          ? 'favorite'
          : node.data.sourceKind === 'generated' || generatedNodeIds.has(node.id)
            ? 'generated'
            : 'uncategorized'
        deduped.set(node.id, {
          id: `editor-history-${node.id}`,
          sourceNodeId: node.id,
          title: node.data.title,
          src,
          libraryCategory,
          aspectRatio: media?.width && media.height
            ? media.width / media.height
            : composition?.width && composition.height
              ? composition.width / composition.height
              : undefined,
          composition,
        })
      })
    })
    return [...deduped.values()].reverse()
  }, [canvases])
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const groupsRef = useRef(groups)
  const tasksRef = useRef(tasks)
  const playlistsRef = useRef(playlists)

  useEffect(() => { canvasesRef.current = canvases }, [canvases])
  useEffect(() => { activeCanvasIdRef.current = activeCanvasId }, [activeCanvasId])
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])
  useEffect(() => { groupsRef.current = groups }, [groups])
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  useEffect(() => { playlistsRef.current = playlists }, [playlists])
  useEffect(() => {
    if (selectedPlaylistId && !playlists.some((playlist) => playlist.id === selectedPlaylistId)) setPlaylistSelection(null)
  }, [playlists, selectedPlaylistId])
  useEffect(() => () => {
    taskTimers.current.forEach(window.clearTimeout)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
  }, [])

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2400)
  }, [])

  const openShareLink = useCallback(async () => {
    const canvas = { ...activeCanvas, viewport: getViewport() }
    const snapshot = createCanvasShareSnapshot(canvas)
    try {
      saveCanvasShareSnapshot(window.localStorage, snapshot)
      setShareLink(canvasShareUrl(window.location.href, snapshot))
      setShareAccess('public')
      setShareMenuOpen(false)
      setShareDialogOpen(true)
    } catch {
      notify('分享失败，请检查浏览器权限')
    }
  }, [activeCanvas, getViewport, notify])

  const updateCanvas = useCallback((canvasId: string, updater: (canvas: CanvasDocument) => CanvasDocument) => {
    setCanvases((current) => current.map((canvas) => canvas.id === canvasId ? updater(canvas) : canvas))
  }, [])

  const setNodes = useCallback((update: SetStateAction<CanvasFlowNode[]>) => {
    const canvasId = activeCanvasId
    updateCanvas(canvasId, (canvas) => ({ ...canvas, nodes: applyListUpdate(canvas.nodes, update) }))
  }, [activeCanvasId, updateCanvas])

  const setEdges = useCallback((update: SetStateAction<CanvasFlowEdge[]>) => {
    const canvasId = activeCanvasId
    updateCanvas(canvasId, (canvas) => ({ ...canvas, edges: applyListUpdate(canvas.edges, update) }))
  }, [activeCanvasId, updateCanvas])

  const setGroups = useCallback((update: SetStateAction<CanvasGroup[]>) => {
    const canvasId = activeCanvasId
    updateCanvas(canvasId, (canvas) => ({ ...canvas, groups: applyListUpdate(canvas.groups, update) }))
  }, [activeCanvasId, updateCanvas])

  const setPlaylists = useCallback((update: SetStateAction<CanvasPlaylist[]>) => {
    const canvasId = activeCanvasId
    updateCanvas(canvasId, (canvas) => ({ ...canvas, playlists: applyListUpdate(canvas.playlists ?? [], update) }))
  }, [activeCanvasId, updateCanvas])

  const patchCanvasNode = useCallback((canvasId: string, nodeId: string, patch: Partial<CanvasNodeData>) => {
    updateCanvas(canvasId, (canvas) => {
      const current = canvas.nodes.find((node) => node.id === nodeId)
      const contentChanged = Boolean(
        current
        && ((patch.content !== undefined && patch.content !== current.data.content)
          || (patch.media?.url !== undefined && patch.media.url !== current.data.media?.url)),
      )
      const updatedNodes = updateNodeData(canvas.nodes, nodeId, patch)
      return {
        ...canvas,
        nodes: syncTargetReferences(contentChanged
          ? markDownstreamNodesStale(updatedNodes, canvas.edges, [nodeId])
          : updatedNodes, canvas.edges),
      }
    })
  }, [updateCanvas])

  const updateCanvasTask = useCallback((canvasId: string, taskId: string, patch: Partial<GenerationTask>) => {
    updateCanvas(canvasId, (canvas) => ({
      ...canvas,
      tasks: canvas.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task),
    }))
  }, [updateCanvas])

  const resumeVideoTasks = useCallback((canvasId: string, restoredTasks: GenerationTask[]) => {
    const taskIds = new Set(restoredTasks
      .filter((task) => task.nodeType === 'video'
        && (task.status === 'queued' || task.status === 'running')
        && Boolean(task.videoGeneration || task.videoOperation))
      .map((task) => task.id))
    if (!taskIds.size) return
    taskTimers.current.push(window.setTimeout(() => {
      updateCanvas(canvasId, (canvas) => {
        const activeTasks = canvas.tasks.filter((task) => taskIds.has(task.id) && (task.status === 'queued' || task.status === 'running'))
        if (!activeTasks.length) return canvas
        const taskByNode = new Map(activeTasks.map((task) => [task.nodeId, task]))
        const completedNodes = canvas.nodes.map((node) => {
          const task = taskByNode.get(node.id)
          if (!task) return node
          if (task.videoOperation) {
            const source = canvas.nodes.find((candidate) => candidate.id === task.inputReferenceIds?.[0])
            return source?.data.nodeType === 'video'
              ? { ...node, data: buildVideoDerivativeData(source.data, task.videoOperation, source.data.media) }
              : node
          }
          return task.videoGeneration
            ? { ...node, data: buildVideoResultData(node.data, DEFAULT_VIDEO_MEDIA, { params: task.videoGeneration }) }
            : node
        })
        const completedTaskIds = new Set(activeTasks.map((task) => task.id))
        return {
          ...canvas,
          nodes: syncTargetReferences(completedNodes, canvas.edges),
          tasks: canvas.tasks.map((task) => {
            if (!completedTaskIds.has(task.id)) return task
            const source = task.videoOperation
              ? canvas.nodes.find((candidate) => candidate.id === task.inputReferenceIds?.[0])
              : undefined
            return {
              ...task,
              status: 'success',
              progress: 100,
              outputMedia: source?.data.media ? { ...source.data.media } : { ...DEFAULT_VIDEO_MEDIA },
            }
          }),
        }
      })
      if (activeCanvasIdRef.current === canvasId) notify('已恢复并完成视频任务')
    }, 650))
  }, [notify, updateCanvas])

  const saveHistory = useCallback((canvasId = activeCanvasId) => {
    const canvas = canvasesRef.current.find((item) => item.id === canvasId)
    if (!canvas) return
    const stack = histories.current[canvasId] ?? (histories.current[canvasId] = [])
    stack.push(cloneCanvasSnapshot(canvas.nodes, canvas.edges, canvas.groups, canvas.tasks, canvas.playlists ?? []))
    if (stack.length > 40) stack.shift()
    futures.current[canvasId] = []
  }, [activeCanvasId])

  const undo = useCallback(() => {
    const stack = histories.current[activeCanvasId] ?? []
    const previous = stack.pop()
    if (!previous) return notify('没有可撤销的操作')
    const futureStack = futures.current[activeCanvasId] ?? (futures.current[activeCanvasId] = [])
    futureStack.push(cloneCanvasSnapshot(nodesRef.current, edgesRef.current, groupsRef.current, tasksRef.current, playlistsRef.current))
    updateCanvas(activeCanvasId, (canvas) => restoreCanvasSnapshot(canvas, previous))
    notify('已撤销')
  }, [activeCanvasId, notify, updateCanvas])

  const redo = useCallback(() => {
    const stack = futures.current[activeCanvasId] ?? []
    const next = stack.pop()
    if (!next) return notify('没有可重做的操作')
    const historyStack = histories.current[activeCanvasId] ?? (histories.current[activeCanvasId] = [])
    historyStack.push(cloneCanvasSnapshot(nodesRef.current, edgesRef.current, groupsRef.current, tasksRef.current, playlistsRef.current))
    updateCanvas(activeCanvasId, (canvas) => restoreCanvasSnapshot(canvas, next))
    resumeVideoTasks(activeCanvasId, next.tasks)
    notify('已重做')
  }, [activeCanvasId, notify, resumeVideoTasks, updateCanvas])

  const onNodesChange = useCallback((changes: NodeChange<CanvasFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current))
  }, [setNodes])

  const onEdgesChange = useCallback((changes: EdgeChange<CanvasFlowEdge>[]) => {
    const removedIds = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id))
    const staleTargets = edgesRef.current
      .filter((edge) => removedIds.has(edge.id) && edge.data?.relationType === 'generation-input')
      .map((edge) => edge.target)
    if (!staleTargets.length) {
      setEdges((current) => applyEdgeChanges(changes, current))
      return
    }
    updateCanvas(activeCanvasId, (canvas) => {
      const nextEdges = applyEdgeChanges(changes, canvas.edges)
      return {
        ...canvas,
        edges: nextEdges,
        nodes: syncTargetReferences(markDownstreamNodesStale(canvas.nodes, nextEdges, staleTargets, true), nextEdges),
      }
    })
  }, [activeCanvasId, setEdges, updateCanvas])

  const updateNode = useCallback((nodeId: string, patch: Partial<CanvasNodeData>) => {
    patchCanvasNode(activeCanvasId, nodeId, patch)
  }, [activeCanvasId, patchCanvasNode])

  const changeVideoGenerationMode = useCallback((nodeId: string, mode: VideoGenerationMode) => {
    const source = nodesRef.current.find((node) => node.id === nodeId)
    if (!source || source.data.nodeType !== 'video' || source.data.modeId === mode) return
    saveHistory()
    updateCanvas(activeCanvasId, (canvas) => {
      const nextEdges = remapVideoInputRolesForMode(nodeId, mode, canvas.nodes, canvas.edges)
      return {
        ...canvas,
        edges: nextEdges,
        nodes: syncTargetReferences(canvas.nodes.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, modeId: mode } } : node), nextEdges),
      }
    })
  }, [activeCanvasId, saveHistory, updateCanvas])

  const deleteEdge = useCallback((edgeId: string) => {
    const deletedEdge = edgesRef.current.find((edge) => edge.id === edgeId)
    if (!deletedEdge) return
    saveHistory()
    const nextEdges = edgesRef.current.filter((edge) => edge.id !== edgeId)
    updateCanvas(activeCanvasId, (canvas) => {
      const nextNodes = deletedEdge.data?.relationType === 'generation-input'
        ? markDownstreamNodesStale(canvas.nodes, nextEdges, [deletedEdge.target], true)
        : canvas.nodes
      return { ...canvas, edges: nextEdges, nodes: syncTargetReferences(nextNodes, nextEdges) }
    })
    notify('已删除连线')
  }, [activeCanvasId, notify, saveHistory, updateCanvas])

  const connectNodes = useCallback((connection: Connection) => {
    const normalized: Connection = {
      ...connection,
      sourceHandle: !connection.sourceHandle || connection.sourceHandle === 'output-launcher' ? 'output' : connection.sourceHandle,
      targetHandle: !connection.targetHandle || connection.targetHandle === 'input-launcher' ? 'input' : connection.targetHandle,
    }
    const validation = validateConnection(normalized, nodesRef.current, edgesRef.current)
    if (!validation.valid) return notify(validation.reason)
    const sourceNode = nodesRef.current.find((node) => node.id === normalized.source)
    const targetNode = nodesRef.current.find((node) => node.id === normalized.target)
    let inputRole: GenerationReferenceRole = 'default'
    if (sourceNode?.data.nodeType === 'image' && targetNode?.data.nodeType === 'video') {
      if (targetNode.data.modeId === 'first-frame') inputRole = 'first-frame'
      else if (targetNode.data.modeId === 'first-last-frame') {
        const usedRoles = new Set((targetNode.data.references ?? []).map((reference) => reference.role))
        inputRole = usedRoles.has('first-frame') ? 'last-frame' : 'first-frame'
      } else inputRole = 'reference'
    }
    saveHistory()
    const nextEdges = addEdge({ ...normalized, type: 'canvas', data: { relationType: 'generation-input', inputRole } }, edgesRef.current)
    updateCanvas(activeCanvasId, (canvas) => {
      const nextNodes = normalized.target
        ? markDownstreamNodesStale(canvas.nodes, nextEdges, [normalized.target], true)
        : canvas.nodes
      return { ...canvas, edges: nextEdges, nodes: syncTargetReferences(nextNodes, nextEdges) }
    })
    notify('已添加生成参考')
  }, [activeCanvasId, notify, saveHistory, updateCanvas])

  const onConnect = useCallback((connection: Connection) => {
    connectNodes(connection)
  }, [connectNodes])

  const openContinuation = useCallback((nodeId: string, clientX: number, clientY: number) => {
    const source = nodesRef.current.find((node) => node.id === nodeId)
    if (!source || allowedTargetsForSource(source.data.nodeType).length === 0) return notify('当前节点暂不支持引用生成')
    setDrawer(null)
    setContinuation(null)
    setContextAdd(null)
    setInteractionMode(null)
    setQuickAdd(null)
    setContinuation({
      sourceNodeId: nodeId,
      x: Math.min(Math.max(clientX, 68), window.innerWidth - 300),
      y: Math.min(Math.max(clientY, 72), Math.max(72, window.innerHeight - 520)),
      flowPosition: screenToFlowPosition({ x: clientX, y: clientY }),
    })
  }, [notify, screenToFlowPosition])

  const openContextAdd = useCallback((nodeId: string, clientX: number, clientY: number) => {
    const target = nodesRef.current.find((node) => node.id === nodeId)
    if (!target || allowedContextSourcesForTarget(target).length === 0) return notify('未找到命令')
    setDrawer(null)
    setContinuation(null)
    setContextAdd(null)
    setInteractionMode(null)
    setQuickAdd(null)
    setContextAdd({
      targetNodeId: nodeId,
      x: Math.min(Math.max(clientX, 68), window.innerWidth - 300),
      y: Math.min(Math.max(clientY, 72), Math.max(72, window.innerHeight - 420)),
      flowPosition: screenToFlowPosition({ x: clientX, y: clientY }),
    })
  }, [notify, screenToFlowPosition])

  const onConnectStart: OnConnectStart = useCallback((_event, params) => {
    const sourceNodeId = params.handleType === 'source' ? params.nodeId ?? null : null
    connectSourceRef.current = sourceNodeId
    setConnectingSourceNodeId(sourceNodeId)
    setContinuation(null)
    setContextAdd(null)
  }, [])

  const onConnectEnd: OnConnectEnd = useCallback((event, connectionState) => {
    const sourceNodeId = connectSourceRef.current ?? connectionState.fromNode?.id ?? null
    connectSourceRef.current = null
    setConnectingSourceNodeId(null)
    if (connectionState.isValid || !sourceNodeId) return
    const pointer = 'changedTouches' in event ? event.changedTouches[0] : event
    if (!pointer) return
    const dropTarget = document.elementFromPoint(pointer.clientX, pointer.clientY)
    const targetElement = dropTarget?.closest<HTMLElement>('.react-flow__node')
    const targetNodeId = targetElement?.dataset.id
    if (targetNodeId && targetNodeId !== sourceNodeId) {
      connectNodes({ source: sourceNodeId, target: targetNodeId, sourceHandle: 'output', targetHandle: 'input' })
      return
    }
    openContinuation(sourceNodeId, pointer.clientX, pointer.clientY)
  }, [connectNodes, openContinuation])

  const createContinuationTarget = useCallback((targetType: MediaNodeType) => {
    if (!continuation) return
    const source = nodesRef.current.find((node) => node.id === continuation.sourceNodeId)
    if (!source) return
    const shouldConnect = isConnectionPairAllowed(source.data.nodeType, targetType)
    if (!shouldConnect) {
      notify('当前节点不能生成此类型')
      return
    }
    saveHistory()
    const id = `${targetType}-${Date.now()}`
    const target = buildCanvasNode(id, targetType, 'created', nodeCounter.current++, continuation.flowPosition)
    const edge: CanvasFlowEdge = {
      id: `edge-${source.id}-${id}`,
      source: source.id,
      sourceHandle: 'output',
      target: id,
      targetHandle: 'input',
      type: 'canvas',
      data: { relationType: 'generation-input', inputRole: targetType === 'video' ? 'reference' : 'default' },
    }
    updateCanvas(activeCanvasId, (canvas) => {
      const nextEdges = [...canvas.edges.map((item) => ({ ...item, selected: false })), edge]
      return {
        ...canvas,
        edges: nextEdges,
        nodes: syncTargetReferences([...canvas.nodes.map((node) => ({ ...node, selected: false })), target], nextEdges),
      }
    })
    setContinuation(null)
    window.setTimeout(() => setCenter(target.position.x + 180, target.position.y + 210, { zoom: 0.88, duration: 260 }), 20)
    const label = { text: '文本', image: '图片', video: '视频', audio: '音频' }[targetType]
    notify(`已引用源节点创建${label}节点`)
  }, [activeCanvasId, continuation, notify, saveHistory, setCenter, updateCanvas])

  const createContextSource = useCallback((sourceType: MediaNodeType) => {
    if (!contextAdd) return
    const target = nodesRef.current.find((node) => node.id === contextAdd.targetNodeId)
    if (!target) return
    if (!allowedContextSourcesForTarget(target).includes(sourceType) || !isConnectionPairAllowed(sourceType, target.data.nodeType)) {
      notify('当前节点不能添加此上下文')
      return
    }
    saveHistory()
    const id = `${sourceType}-${Date.now()}`
    const source = buildCanvasNode(id, sourceType, 'created', nodeCounter.current++, contextAdd.flowPosition)
    const sourceBox = nodeBox(source)
    source.position = {
      x: target.position.x - sourceBox.width - 72,
      y: target.position.y,
    }
    let inputRole: GenerationReferenceRole = 'default'
    if (sourceType === 'image' && target.data.nodeType === 'video') {
      if (target.data.modeId === 'first-frame') inputRole = 'first-frame'
      else if (target.data.modeId === 'first-last-frame') {
        const usedRoles = new Set((target.data.references ?? []).map((reference) => reference.role))
        inputRole = usedRoles.has('first-frame') ? 'last-frame' : 'first-frame'
      } else inputRole = 'reference'
    }
    const edge: CanvasFlowEdge = {
      id: `edge-${source.id}-${target.id}`,
      source: source.id,
      sourceHandle: 'output',
      target: target.id,
      targetHandle: 'input',
      type: 'canvas',
      data: { relationType: 'generation-input', inputRole },
    }
    updateCanvas(activeCanvasId, (canvas) => {
      const nextEdges = [...canvas.edges.map((item) => ({ ...item, selected: false })), edge]
      return {
        ...canvas,
        edges: nextEdges,
        nodes: syncTargetReferences(markDownstreamNodesStale([...canvas.nodes.map((node) => ({ ...node, selected: false })), source], nextEdges, [target.id], true), nextEdges),
      }
    })
    setContextAdd(null)
    window.setTimeout(() => setCenter((source.position.x + target.position.x) / 2 + 160, target.position.y + 120, { zoom: 0.88, duration: 260 }), 20)
    const label = { text: '文本', image: '图片', video: '视频', audio: '音频' }[sourceType]
    notify(`已添加${label}上下文`)
  }, [activeCanvasId, contextAdd, notify, saveHistory, setCenter, updateCanvas])

  const exitInteractionMode = useCallback(() => setInteractionMode(null), [])

  const isInteractionCandidate = useCallback((nodeId: string) => {
    if (!interactionMode) return false
    const source = nodesRef.current.find((node) => node.id === nodeId)
    if (interactionMode.kind === 'playlist-clips') {
      return source?.data.nodeType === 'video' && source.data.status === 'success' && Boolean(source.data.media?.url)
    }
    if (interactionMode.targetNodeId === nodeId) return false
    const target = nodesRef.current.find((node) => node.id === interactionMode.targetNodeId)
    if (!source || !target) return false
    if (interactionMode.kind === 'reference' && (interactionMode.role === 'first-frame' || interactionMode.role === 'last-frame')) {
      return source.data.nodeType === 'image' && Boolean((source.data.content ?? '').trim())
    }
    if (interactionMode.kind === 'reference' && interactionMode.role === 'reference' && target.data.nodeType === 'video') {
      return canUseAsVideoReference(source.data)
    }
    return interactionMode.kind === 'marker'
      ? source.data.nodeType === 'image' && Boolean((source.data.content ?? '').trim())
      : isConnectionPairAllowed(source.data.nodeType, target.data.nodeType)
  }, [interactionMode])

  const isConnectionTargetCandidate = useCallback((nodeId: string) => {
    if (!connectingSourceNodeId || nodeId === connectingSourceNodeId) return false
    return validateConnection(
      { source: connectingSourceNodeId, target: nodeId, sourceHandle: 'output', targetHandle: 'input' },
      nodesRef.current,
      edgesRef.current,
    ).valid
  }, [connectingSourceNodeId])

  const beginReferenceSelection = useCallback((targetNodeId: string, replaceSourceNodeId?: string, role: GenerationReferenceRole = 'default') => {
    const replaceEdgeId = replaceSourceNodeId
      ? edgesRef.current.find((edge) => edge.source === replaceSourceNodeId && edge.target === targetNodeId && edge.data?.relationType === 'generation-input')?.id
      : undefined
    setInteractionMode({ kind: 'reference', targetNodeId, replaceEdgeId, role })
    setContinuation(null)
    setContextAdd(null)
    setDrawer(null)
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === targetNodeId })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
  }, [setEdges, setNodes])

  const beginMarkerSelection = useCallback((targetNodeId: string) => {
    const target = nodesRef.current.find((node) => node.id === targetNodeId)
    const prompt = target?.data.localPrompt ?? target?.data.promptHistory?.[0] ?? ''
    setInteractionMode({ kind: 'marker', targetNodeId, promptOffset: prompt.length })
    setContinuation(null)
    setContextAdd(null)
    setDrawer(null)
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === targetNodeId })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
  }, [setEdges, setNodes])

  const removeReference = useCallback((targetNodeId: string, sourceNodeId: string) => {
    const edge = edgesRef.current.find((item) => item.source === sourceNodeId && item.target === targetNodeId && item.data?.relationType === 'generation-input')
    if (edge) deleteEdge(edge.id)
  }, [deleteEdge])

  const addPromptMarker = useCallback((targetNodeId: string, sourceNodeId: string, x: number, y: number) => {
    const target = nodesRef.current.find((node) => node.id === targetNodeId)
    const source = nodesRef.current.find((node) => node.id === sourceNodeId)
    if (!target || !source || source.data.nodeType !== 'image' || targetNodeId === sourceNodeId) return
    saveHistory()
    const markers = target.data.promptMarkers ?? []
    const baseLabel = resolveMockPromptMarkerLabel(x, y)
    const sameLabelCount = markers.filter((marker) => marker.label === baseLabel || marker.label.startsWith(`${baseLabel} `)).length
    const label = sameLabelCount > 0 ? `${baseLabel} ${sameLabelCount + 1}` : baseLabel
    const prompt = target.data.localPrompt ?? target.data.promptHistory?.[0] ?? ''
    const promptOffset = interactionMode?.kind === 'marker' && interactionMode.targetNodeId === targetNodeId
      ? Math.min(Math.max(interactionMode.promptOffset, 0), prompt.length)
      : prompt.length
    const next = [...markers, { id: `marker-${Date.now()}`, sourceNodeId, label, x, y, promptOffset }]
    updateNode(targetNodeId, { promptMarkers: next })
    setInteractionMode(null)
    notify(`已识别并添加「${label}」`)
  }, [interactionMode, notify, saveHistory, updateNode])

  const updatePromptMarker = useCallback((targetNodeId: string, markerId: string, label?: string) => {
    const target = nodesRef.current.find((node) => node.id === targetNodeId)
    if (!target) return
    saveHistory()
    updateNode(targetNodeId, {
      promptMarkers: label === undefined
        ? (target.data.promptMarkers ?? []).filter((marker) => marker.id !== markerId)
        : (target.data.promptMarkers ?? []).map((marker) => marker.id === markerId ? { ...marker, label } : marker),
    })
  }, [saveHistory, updateNode])

  const markersForSource = useCallback((sourceNodeId: string) => nodes
    .filter((node) => node.selected || (interactionMode && (interactionMode.kind === 'reference' || interactionMode.kind === 'marker') && interactionMode.targetNodeId === node.id))
    .flatMap((node) => node.data.promptMarkers ?? [])
    .filter((marker) => marker.sourceNodeId === sourceNodeId), [interactionMode, nodes])

  const startVideoTask = useCallback((nodeId: string, bypassValidation = false) => {
    const canvasId = activeCanvasId
    const canvas = canvasesRef.current.find((item) => item.id === canvasId)
    const source = canvas?.nodes.find((item) => item.id === nodeId)
    if (!canvas || !source || source.data.nodeType !== 'video') return
    const snapshot = buildVideoTaskSnapshot(source.data)
    const complianceAssetIds = source.data.modelId === 'seedance-2' ? source.data.seedanceComplianceAssetIds : undefined
    const validation = validateVideoGenerationInputs(source.data.modeId, source.data.references, source.data.promptAssets, source.data.localPrompt, complianceAssetIds)
    if (!bypassValidation && !validation.valid) return notify(validation.reason)

    saveHistory()
    const createdAt = Date.now()
    // Prompt 重新生成属于同一内容节点的新结果，始终保留节点 ID 与既有关系线。
    const fillsCurrentNode = true
    const incoming = canvas.edges.filter((edge) => edge.target === nodeId && edge.data?.relationType === 'generation-input')
    const createdNodes: CanvasFlowNode[] = []
    const createdEdges: CanvasFlowEdge[] = []
    const createdTasks: GenerationTask[] = []
    const outputNodeIds: string[] = []
    const count = snapshot.videoGeneration.count

    const batchPlan = buildVideoBatchPlan(source.id, count, fillsCurrentNode, String(createdAt))
    for (const output of batchPlan) {
      const { index, usesCurrentNode, outputNodeId: outputId } = output
      const outputTitle = usesCurrentNode
        ? source.data.title
        : `${source.data.title} · 新版本${count > 1 ? ` ${index + 1}` : ''}`
      const outputData: CanvasNodeData = {
        ...structuredClone(source.data),
        title: outputTitle,
        status: 'queued',
        sourceKind: 'generated',
        progress: 0,
        error: undefined,
        content: usesCurrentNode ? source.data.content : '',
        media: undefined,
        favorite: false,
        videoOperation: undefined,
        videoGeneration: structuredClone(snapshot.videoGeneration),
        params: structuredClone(snapshot.params),
        references: usesCurrentNode ? structuredClone(source.data.references ?? []) : [],
      }
      outputNodeIds.push(outputId)
      if (!usesCurrentNode) {
        const positionIndex = fillsCurrentNode ? index - 1 : index
        createdNodes.push({
          id: outputId,
          type: 'video',
          position: {
            x: source.position.x + 520 + Math.floor(positionIndex / 2) * 500,
            y: source.position.y + (positionIndex % 2) * 360,
          },
          selected: index === 0,
          data: outputData,
        })
        incoming.forEach((edge) => createdEdges.push({
          ...structuredClone(edge),
          id: `${edge.id}-${outputId}`,
          target: outputId,
          selected: false,
        }))
      }
      createdTasks.push({
        id: output.taskId,
        canvasId,
        nodeId: outputId,
        nodeTitle: outputTitle,
        nodeType: 'video',
        status: 'queued',
        progress: 0,
        effectivePrompt: snapshot.effectivePrompt,
        inputReferenceIds: snapshot.inputReferenceIds,
        inputAssetIds: snapshot.inputAssetIds,
        inputReferences: snapshot.inputReferences,
        promptAssets: snapshot.promptAssets,
        videoGeneration: structuredClone(snapshot.videoGeneration),
        modeId: snapshot.modeId,
        modelId: snapshot.modelId,
        params: structuredClone(snapshot.params),
        outputNodeIds: output.outputNodeIds,
        modelLabel: videoModelLabel(snapshot.modelId),
        cost: source.data.cost ?? 35,
        createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      })
    }
    updateCanvas(canvasId, (current) => {
      const nextEdges = [...current.edges.map((edge) => ({ ...edge, selected: false })), ...createdEdges]
      const existingNodes = current.nodes.map((node) => node.id === source.id && fillsCurrentNode
        ? { ...node, selected: true, data: createdTasks[0] ? {
          ...structuredClone(source.data),
          status: 'queued' as const,
          sourceKind: 'generated' as const,
          progress: 0,
          error: undefined,
          media: undefined,
          videoGeneration: structuredClone(snapshot.videoGeneration),
          params: structuredClone(snapshot.params),
        } : node.data }
        : { ...node, selected: false })
      return {
        ...current,
        edges: nextEdges,
        nodes: syncTargetReferences([...existingNodes, ...createdNodes], nextEdges),
        tasks: [...createdTasks, ...current.tasks],
      }
    })
    notify(`已创建 ${count} 个视频生成任务`)

    const taskIds = new Set(createdTasks.map((task) => task.id))
    const nodeIds = new Set(outputNodeIds)
    const hasActiveBatch = () => Boolean(canvasesRef.current.find((item) => item.id === canvasId)?.tasks
      .some((task) => taskIds.has(task.id) && (task.status === 'queued' || task.status === 'running')))
    const updateBatch = (status: GenerationTask['status'], progress: number) => updateCanvas(canvasId, (current) => ({
      ...current,
      nodes: current.nodes.map((node) => nodeIds.has(node.id) && current.tasks.some((task) => taskIds.has(task.id) && task.nodeId === node.id && (task.status === 'queued' || task.status === 'running'))
        ? { ...node, data: { ...node.data, status, progress } }
        : node),
      tasks: current.tasks.map((task) => taskIds.has(task.id) && (task.status === 'queued' || task.status === 'running') ? { ...task, status, progress } : task),
    }))
    taskTimers.current.push(window.setTimeout(() => { if (hasActiveBatch()) updateBatch('running', 28) }, 420))
    taskTimers.current.push(window.setTimeout(() => { if (hasActiveBatch()) updateBatch('running', 72) }, 1150))
    taskTimers.current.push(window.setTimeout(() => {
      if (!hasActiveBatch()) return
      updateCanvas(canvasId, (current) => ({
        ...current,
        nodes: syncTargetReferences(markDownstreamNodesStale(current.nodes.map((node) => nodeIds.has(node.id) && current.tasks.some((task) => taskIds.has(task.id) && task.nodeId === node.id && (task.status === 'queued' || task.status === 'running'))
          ? { ...node, data: buildVideoResultData(node.data, DEFAULT_VIDEO_MEDIA, { params: snapshot.videoGeneration }) }
          : node), current.edges, [source.id]), current.edges),
        tasks: current.tasks.map((task) => taskIds.has(task.id) && (task.status === 'queued' || task.status === 'running')
          ? { ...task, status: 'success', progress: 100, outputMedia: { ...DEFAULT_VIDEO_MEDIA } }
          : task),
      }))
      if (activeCanvasIdRef.current === canvasId) notify(`${count} 个视频结果已生成`)
    }, 2200))

    const focus = fillsCurrentNode ? source : createdNodes[0]
    if (focus) window.setTimeout(() => setCenter(focus.position.x + 220, focus.position.y + 330, { zoom: 0.78, duration: 300 }), 20)
  }, [activeCanvasId, notify, saveHistory, setCenter, updateCanvas])

  const startTask = useCallback((nodeId: string, bypassValidation = false) => {
    const target = nodesRef.current.find((node) => node.id === nodeId)
    if (target?.data.nodeType === 'video') return startVideoTask(nodeId, bypassValidation)
    const canvasId = activeCanvasId
    const canvas = canvasesRef.current.find((item) => item.id === canvasId)
    const node = canvas?.nodes.find((item) => item.id === nodeId)
    if (!canvas || !node) return
    const references = node.data.references ?? []
    if (!bypassValidation && references.length === 0 && !(node.data.localPrompt ?? '').trim()) return notify('请输入生成要求或添加参考')

    const taskId = `task-${Date.now()}`
    const task: GenerationTask = {
      id: taskId,
      canvasId,
      nodeId,
      nodeTitle: node.data.title,
      nodeType: node.data.nodeType,
      status: 'queued',
      progress: 0,
      effectivePrompt: resolveEffectivePrompt(references, node.data.localPrompt),
      inputReferenceIds: references.map((reference) => reference.nodeId),
      inputReferences: structuredClone(references),
      promptMarkers: structuredClone(node.data.promptMarkers ?? []),
      imageGeneration: node.data.imageGeneration ? structuredClone(node.data.imageGeneration) : undefined,
      modelLabel: node.data.modelId === 'gemini-flash-lite' ? 'Gemini 3.1 Flash Lite' : node.data.nodeType === 'image' ? 'Seedream 3.0' : node.data.nodeType === 'audio' ? audioModelLabel(node.data.modelId) : '示例模型',
      cost: node.data.cost ?? (node.data.nodeType === 'text' ? 1 : 35),
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    }
    updateCanvas(canvasId, (current) => ({
      ...current,
      tasks: [task, ...current.tasks],
      nodes: syncTargetReferences(updateNodeData(current.nodes, nodeId, { status: 'queued', progress: 0, error: undefined }), current.edges),
    }))
    notify('任务已进入队列')

    taskTimers.current.push(window.setTimeout(() => {
      updateCanvasTask(canvasId, taskId, { status: 'running', progress: 24 })
      patchCanvasNode(canvasId, nodeId, { status: 'running', progress: 24 })
    }, 450))
    taskTimers.current.push(window.setTimeout(() => {
      updateCanvasTask(canvasId, taskId, { progress: 68 })
      patchCanvasNode(canvasId, nodeId, { progress: 68 })
    }, 1300))
    taskTimers.current.push(window.setTimeout(() => {
      updateCanvas(canvasId, (current) => {
        const currentNode = current.nodes.find((item) => item.id === nodeId)
        if (!currentNode) return current
        const mediaReference = currentNode.data.references?.find((reference) => reference.nodeType !== 'text')
        const generatedContent = currentNode.data.nodeType === 'text' && mediaReference
          ? `已根据${{ image: '图片', video: '视频', audio: '音频' }[mediaReference.nodeType as 'image' | 'video' | 'audio']}「${mediaReference.label}」整理：主体、场景与关键动作已提取，可继续改写或生成下一步素材。`
          : {
              text: '镜头沿街道缓慢推进，樱花与霓虹在潮湿路面形成克制的暖色倒影。',
              image: '根据 Prompt 生成的图片结果',
              video: '生成的视频结果',
              audio: '生成的音频结果',
            }[currentNode.data.nodeType]
        const prompt = (currentNode.data.localPrompt ?? '').trim()
        const updatedNode: CanvasFlowNode = {
          ...currentNode,
          data: {
            ...currentNode.data,
            status: 'success', progress: 100, sourceKind: 'generated', content: generatedContent,
            mediaVariant: currentNode.data.nodeType === 'image' ? 'anime' : currentNode.data.mediaVariant,
            media: currentNode.data.nodeType === 'image' ? imageMediaForVariant('anime') : currentNode.data.media,
            staleNoticeDismissed: undefined,
            promptHistory: currentNode.data.nodeType === 'image' && prompt
              ? [prompt, ...(currentNode.data.promptHistory ?? []).filter((item) => item !== prompt)]
              : currentNode.data.promptHistory,
          },
        }
        let nextNodes = current.nodes.map((item) => item.id === nodeId ? updatedNode : item)
        let nextEdges = current.edges
        const extraTasks: GenerationTask[] = []
        const count = currentNode.data.nodeType === 'image' ? currentNode.data.imageGeneration?.count ?? 1 : 1
        if (count > 1) {
          const incoming = current.edges.filter((edge) => edge.target === nodeId && edge.data?.relationType === 'generation-input')
          for (let index = 1; index < count; index += 1) {
            const copyId = `${nodeId}-result-${Date.now()}-${index}`
            nextNodes.push({
              ...structuredClone(updatedNode), id: copyId, selected: false,
              position: { x: updatedNode.position.x + 430 * index, y: updatedNode.position.y + (index % 2) * 42 },
              data: { ...structuredClone(updatedNode.data), title: `${updatedNode.data.title} ${index + 1}` },
            })
            nextEdges = [...nextEdges, ...incoming.map((edge) => ({ ...structuredClone(edge), id: `${edge.id}-${copyId}`, target: copyId, selected: false }))]
            extraTasks.push({ ...task, id: `${taskId}-${index}`, nodeId: copyId, nodeTitle: `${updatedNode.data.title} ${index + 1}`, status: 'success', progress: 100 })
          }
        }
        const nodesWithStaleDownstream = markDownstreamNodesStale(nextNodes, nextEdges, [nodeId])
        return {
          ...current,
          nodes: syncTargetReferences(nodesWithStaleDownstream, nextEdges),
          edges: nextEdges,
          tasks: current.tasks.map((item): GenerationTask => item.id === taskId ? { ...item, status: 'success', progress: 100 } : item).concat(extraTasks),
        }
      })
      if (activeCanvasIdRef.current === canvasId) notify(`${node.data.title}生成完成`)
    }, 2300))
  }, [activeCanvasId, notify, patchCanvasNode, startVideoTask, updateCanvas, updateCanvasTask])

  const retryGeneration = useCallback((nodeId: string) => startTask(nodeId, true), [startTask])

  const nextImagePosition = useCallback((sourceNode: CanvasFlowNode) => {
    const siblings = edgesRef.current.filter((edge) => edge.source === sourceNode.id).length
    return {
      x: sourceNode.position.x + 500 + Math.floor(siblings / 2) * 440,
      y: sourceNode.position.y + (siblings % 2) * 300,
    }
  }, [])

  const createImageDerivative = useCallback((nodeId: string, operation: ImageOperation, result: ImageOperationResult) => {
    const canvasId = activeCanvasId
    const source = nodesRef.current.find((node) => node.id === nodeId)
    if (!source || source.data.nodeType !== 'image') return
    saveHistory()
    const createdAt = Date.now()
    if (operation === 'grid-split') {
      const columns = result.gridColumns ?? result.grid ?? 1
      const rows = result.gridRows ?? result.grid ?? 1
      const basePosition = nextImagePosition(source)
      const slices = buildGridSlices(columns, rows)
      const children: CanvasFlowNode[] = slices.map((slice) => ({
        id: `image-grid-split-${createdAt}-${slice.index}`,
        type: 'image',
        position: gridSlicePosition(basePosition, slice.column, slice.row),
        selected: slice.index === 0,
        data: {
          ...structuredClone(source.data),
          title: `${source.data.title} · 宫格 ${slice.title}`,
          sourceKind: 'generated',
          status: 'success',
          favorite: false,
          imageOperation: {
            ...result,
            operation,
            grid: Math.max(columns, rows),
            gridColumns: columns,
            gridRows: rows,
            gridIndex: slice.index,
            gridColumn: slice.column,
            gridRow: slice.row,
          },
          references: [],
        },
      }))
      const createdEdges: CanvasFlowEdge[] = children.map((child) => ({
        id: `edge-${nodeId}-${child.id}`,
        source: nodeId,
        sourceHandle: 'output',
        target: child.id,
        targetHandle: 'input',
        type: 'canvas',
        data: { relationType: 'image-operation', operation },
      }))
      const createdTasks: GenerationTask[] = children.map((child, index) => ({
        id: `task-${createdAt}-${index}`,
        canvasId,
        nodeId: child.id,
        nodeTitle: child.data.title,
        nodeType: 'image',
        status: 'success',
        progress: 100,
        effectivePrompt: `${columns}×${rows} 宫格切分 · ${index + 1}`,
        imageOperation: structuredClone(child.data.imageOperation),
        modelLabel: '图片宫格切分 Mock',
        cost: 0,
        createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      }))
      updateCanvas(canvasId, (canvas) => {
        const nextEdges = [...canvas.edges.map((item) => ({ ...item, selected: false })), ...createdEdges]
        return {
          ...canvas,
          edges: nextEdges,
          nodes: syncTargetReferences([...canvas.nodes.map((node) => ({ ...node, selected: false })), ...children], nextEdges),
          tasks: [...createdTasks, ...canvas.tasks],
        }
      })
      window.setTimeout(() => {
        updateCanvas(canvasId, (canvas) => ({ ...canvas, nodes: canvas.nodes.map((node) => ({ ...node, selected: node.id === children[0]?.id })) }))
        fitView({ nodes: children.map((child) => ({ id: child.id })), padding: 0.16, minZoom: 0.12, maxZoom: 0.84, duration: 320 })
      }, 20)
      notify(`已生成 ${columns}×${rows} 的 ${children.length} 个独立切片`)
      return
    }
    const childId = `image-${operation}-${createdAt}`
    const child: CanvasFlowNode = {
      id: childId,
      type: 'image',
      position: nextImagePosition(source),
      selected: true,
      data: {
        ...structuredClone(source.data),
        title: `${source.data.title} · ${operationCopy[operation]}`,
        sourceKind: 'generated',
        status: 'success',
        favorite: false,
        imageOperation: { ...result, operation },
        references: [],
      },
    }
    const edge: CanvasFlowEdge = {
      id: `edge-${nodeId}-${childId}`,
      source: nodeId,
      sourceHandle: 'output',
      target: childId,
      targetHandle: 'input',
      type: 'canvas',
      data: { relationType: 'image-operation', operation },
    }
    const task: GenerationTask = {
      id: `task-${createdAt}`,
      canvasId,
      nodeId: childId,
      nodeTitle: child.data.title,
      nodeType: 'image',
      status: 'success',
      progress: 100,
      effectivePrompt: result.prompt ?? operationCopy[operation],
      imageOperation: structuredClone(child.data.imageOperation),
      modelLabel: `图片${operationCopy[operation]} Mock`,
      cost: 0,
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    }
    updateCanvas(canvasId, (canvas) => {
      const nextEdges = [...canvas.edges.map((item) => ({ ...item, selected: false })), edge]
      return {
        ...canvas,
        edges: nextEdges,
        nodes: syncTargetReferences([...canvas.nodes.map((node) => ({ ...node, selected: false })), child], nextEdges),
        tasks: [task, ...canvas.tasks],
      }
    })
    window.setTimeout(() => {
      updateCanvas(canvasId, (canvas) => ({ ...canvas, nodes: canvas.nodes.map((node) => ({ ...node, selected: node.id === childId })) }))
      setCenter(child.position.x + 180, child.position.y + 250, { zoom: 0.84, duration: 280 })
    }, 20)
    notify(`已生成${operationCopy[operation]}结果`)
  }, [activeCanvasId, fitView, nextImagePosition, notify, saveHistory, setCenter, updateCanvas])

  const prepareImageEditor = useCallback((nodeId: string, operation: Extract<ImageOperation, 'rotate' | 'edit-text'>) => {
    const canvasId = activeCanvasId
    const source = nodesRef.current.find((node) => node.id === nodeId)
    if (!source || source.data.nodeType !== 'image' || !(source.data.content ?? '').trim()) return
    if (operation === 'edit-text' && editableTextLayersForImage(source.data).length === 0) {
      notify('未识别到可编辑文字')
      return
    }
    saveHistory()
    const createdAt = Date.now()
    const childId = `image-${operation}-${createdAt}`
    const child: CanvasFlowNode = {
      id: childId,
      type: 'image',
      position: nextImagePosition(source),
      selected: true,
      data: buildPendingImageEditorData(source.data, operation),
    }
    const edge: CanvasFlowEdge = {
      id: `edge-${nodeId}-${childId}`,
      source: nodeId,
      sourceHandle: 'output',
      target: childId,
      targetHandle: 'input',
      type: 'canvas',
      data: { relationType: 'image-operation', operation },
    }
    updateCanvas(canvasId, (canvas) => {
      const nextEdges = [...canvas.edges.map((item) => ({ ...item, selected: false })), edge]
      return {
        ...canvas,
        edges: nextEdges,
        nodes: syncTargetReferences([...canvas.nodes.map((node) => ({ ...node, selected: false })), child], nextEdges),
      }
    })
    window.setTimeout(() => {
      updateCanvas(canvasId, (canvas) => ({ ...canvas, nodes: canvas.nodes.map((node) => ({ ...node, selected: node.id === childId })) }))
      setCenter(child.position.x + 180, child.position.y + 160, { zoom: 0.84, duration: 280 })
    }, 20)
    notify(`已创建${operationCopy[operation]}编辑节点`)
  }, [activeCanvasId, nextImagePosition, notify, saveHistory, setCenter, updateCanvas])

  const completeImageEditor = useCallback((nodeId: string, patch: Partial<ImageOperationResult> = {}) => {
    const canvasId = activeCanvasId
    const pending = nodesRef.current.find((node) => node.id === nodeId)
    const operation = pending?.data.imageOperation?.operation
    if (!pending || pending.data.nodeType !== 'image' || pending.data.status !== 'ready' || (operation !== 'rotate' && operation !== 'edit-text')) return
    saveHistory()
    const createdAt = Date.now()
    const data = completePendingImageEditorData(pending.data, patch)
    const task: GenerationTask = {
      id: `task-${createdAt}`,
      canvasId,
      nodeId,
      nodeTitle: data.title,
      nodeType: 'image',
      status: 'success',
      progress: 100,
      effectivePrompt: operationCopy[operation],
      imageOperation: structuredClone(data.imageOperation),
      modelLabel: `图片${operationCopy[operation]} Mock`,
      cost: 6,
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    }
    updateCanvas(canvasId, (canvas) => ({
      ...canvas,
      nodes: canvas.nodes.map((node) => node.id === nodeId ? { ...node, data } : node),
      tasks: [task, ...canvas.tasks],
    }))
    notify(`${operationCopy[operation]}已完成`)
  }, [activeCanvasId, notify, saveHistory, updateCanvas])

  const cancelPendingImageEditor = useCallback((nodeId: string) => {
    const pending = nodesRef.current.find((node) => node.id === nodeId)
    const operation = pending?.data.imageOperation?.operation
    if (!pending || pending.data.status !== 'ready' || (operation !== 'rotate' && operation !== 'edit-text')) return
    saveHistory()
    updateCanvas(activeCanvasId, (canvas) => {
      const nextEdges = canvas.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      return {
        ...canvas,
        edges: nextEdges,
        nodes: syncTargetReferences(canvas.nodes.filter((node) => node.id !== nodeId), nextEdges),
      }
    })
    notify(`已取消${operationCopy[operation]}编辑`)
  }, [activeCanvasId, notify, saveHistory, updateCanvas])

  const prepareImageUpscale = useCallback((nodeId: string) => {
    const canvasId = activeCanvasId
    const source = nodesRef.current.find((node) => node.id === nodeId)
    if (!source || source.data.nodeType !== 'image' || !(source.data.content ?? '').trim()) return
    saveHistory()
    const createdAt = Date.now()
    const childId = `image-upscale-${createdAt}`
    const child: CanvasFlowNode = {
      id: childId,
      type: 'image',
      position: nextImagePosition(source),
      selected: true,
      data: buildPendingUpscaleData(source.data),
    }
    const edge: CanvasFlowEdge = {
      id: `edge-${nodeId}-${childId}`,
      source: nodeId,
      sourceHandle: 'output',
      target: childId,
      targetHandle: 'input',
      type: 'canvas',
      data: { relationType: 'image-operation', operation: 'upscale' },
    }
    updateCanvas(canvasId, (canvas) => {
      const nextEdges = [...canvas.edges.map((item) => ({ ...item, selected: false })), edge]
      return {
        ...canvas,
        edges: nextEdges,
        nodes: syncTargetReferences([...canvas.nodes.map((node) => ({ ...node, selected: false })), child], nextEdges),
      }
    })
    window.setTimeout(() => {
      updateCanvas(canvasId, (canvas) => ({ ...canvas, nodes: canvas.nodes.map((node) => ({ ...node, selected: node.id === childId })) }))
      setCenter(child.position.x + 180, child.position.y + 250, { zoom: 0.84, duration: 280 })
    }, 20)
    notify('已创建图片高清节点，请选择清晰度后生成')
  }, [activeCanvasId, nextImagePosition, notify, saveHistory, setCenter, updateCanvas])

  const completeImageUpscale = useCallback((nodeId: string, resolution: '2K' | '4K' | '6K') => {
    const canvasId = activeCanvasId
    const pending = nodesRef.current.find((node) => node.id === nodeId)
    const incoming = edgesRef.current.find((edge) => edge.target === nodeId && edge.data?.relationType === 'image-operation' && edge.data.operation === 'upscale')
    const source = incoming ? nodesRef.current.find((node) => node.id === incoming.source) : undefined
    if (!pending || !source || pending.data.imageOperation?.operation !== 'upscale' || pending.data.status !== 'ready') return
    saveHistory()
    const createdAt = Date.now()
    const taskId = `task-${createdAt}`
    const task: GenerationTask = {
      id: taskId,
      canvasId,
      nodeId,
      nodeTitle: pending.data.title,
      nodeType: 'image',
      status: 'queued',
      progress: 0,
      effectivePrompt: `图片高清 · ${resolution}`,
      modelLabel: '图片高清 Mock',
      cost: 6,
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    }
    updateCanvas(canvasId, (canvas) => ({
      ...canvas,
      nodes: canvas.nodes.map((node) => node.id === nodeId
        ? {
            ...node,
            data: {
              ...node.data,
              status: 'queued',
              progress: 0,
              error: undefined,
              imageOperation: { ...(node.data.imageOperation ?? { operation: 'upscale' }), operation: 'upscale', resolution },
            },
          }
        : node),
      tasks: [task, ...canvas.tasks],
    }))
    notify('图片高清任务已进入队列')
    const taskIsActive = () => canvasesRef.current.find((canvas) => canvas.id === canvasId)?.tasks
      .some((item) => item.id === taskId && (item.status === 'queued' || item.status === 'running'))
    const updateProgress = (status: GenerationTask['status'], progress: number) => updateCanvas(canvasId, (canvas) => ({
      ...canvas,
      nodes: canvas.nodes.map((node) => node.id === nodeId
        ? { ...node, data: { ...node.data, status, progress } }
        : node),
      tasks: canvas.tasks.map((item) => item.id === taskId && (item.status === 'queued' || item.status === 'running')
        ? { ...item, status, progress }
        : item),
    }))
    taskTimers.current.push(window.setTimeout(() => { if (taskIsActive()) updateProgress('running', 28) }, 420))
    taskTimers.current.push(window.setTimeout(() => { if (taskIsActive()) updateProgress('running', 72) }, 1150))
    taskTimers.current.push(window.setTimeout(() => {
      if (!taskIsActive()) return
      updateCanvas(canvasId, (canvas) => ({
        ...canvas,
        nodes: canvas.nodes.map((node) => node.id === nodeId
          ? { ...node, data: completeUpscaleData(node.data, source.data, resolution) }
          : node),
        tasks: canvas.tasks.map((item) => item.id === taskId
          ? { ...item, status: 'success', progress: 100, outputMedia: source.data.media ? { ...source.data.media } : undefined }
          : item),
      }))
      if (activeCanvasIdRef.current === canvasId) notify(`已生成 ${resolution} 高清图片`)
    }, 2200))
  }, [activeCanvasId, notify, saveHistory, updateCanvas])

  const regenerateImage = useCallback((nodeId: string, prompt: string, params: ImageGenerationParams) => {
    const canvasId = activeCanvasId
    const source = nodesRef.current.find((node) => node.id === nodeId)
    const nextPrompt = prompt.trim()
    if (!source || source.data.nodeType !== 'image') return
    const sourceReferences = source.data.references ?? []
    if (!nextPrompt && sourceReferences.length === 0) return notify('请输入图片 Prompt 或添加参考')
    saveHistory()
    const createdAt = Date.now()
    const effectivePrompt = nextPrompt || resolveEffectivePrompt(sourceReferences, '') || `基于 ${sourceReferences.length} 个参考生成`
    const historyItems = nextPrompt
      ? [nextPrompt, ...(source.data.promptHistory ?? []).filter((item) => item !== nextPrompt)]
      : source.data.promptHistory ?? []
    const resultData: CanvasNodeData = {
      ...structuredClone(source.data),
      sourceKind: 'generated',
      status: 'queued',
      progress: 0,
      content: '',
      mediaVariant: undefined,
      media: undefined,
      favorite: false,
      localPrompt: nextPrompt,
      promptHistory: historyItems,
      imageGeneration: structuredClone(params),
      imageOperation: { operation: 'prompt-regenerate', prompt: effectivePrompt, aspectRatio: params.ratio, resolution: params.resolution === '1K' ? '2K' : params.resolution },
    }
    const taskId = `task-${createdAt}`
    const task: GenerationTask = {
      id: taskId,
      canvasId,
      nodeId,
      nodeTitle: source.data.title,
      nodeType: 'image',
      status: 'queued',
      progress: 0,
      effectivePrompt: params.enhancePrompt ? `${effectivePrompt}，细节丰富，构图克制，光影层次清晰` : effectivePrompt,
      inputReferenceIds: sourceReferences.map((reference) => reference.nodeId),
      promptMarkers: structuredClone(source.data.promptMarkers ?? []),
      imageGeneration: structuredClone(params),
      modelLabel: 'Seedream 3.0',
      cost: 18,
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    }
    updateCanvas(canvasId, (canvas) => ({
      ...canvas,
      nodes: syncTargetReferences(canvas.nodes.map((node) => node.id === nodeId
        ? { ...node, selected: true, data: { ...structuredClone(resultData), title: node.data.title } }
        : { ...node, selected: false }), canvas.edges),
      tasks: [task, ...canvas.tasks],
    }))
    notify('图片生成任务已进入队列')

    const taskIsActive = () => Boolean(canvasesRef.current.find((canvas) => canvas.id === canvasId)?.tasks
      .some((item) => item.id === taskId && (item.status === 'queued' || item.status === 'running')))
    const updateProgress = (status: GenerationTask['status'], progress: number) => updateCanvas(canvasId, (canvas) => ({
      ...canvas,
      nodes: canvas.nodes.map((node) => node.id === nodeId
        ? { ...node, data: { ...node.data, status, progress } }
        : node),
      tasks: canvas.tasks.map((item) => item.id === taskId && (item.status === 'queued' || item.status === 'running')
        ? { ...item, status, progress }
        : item),
    }))
    taskTimers.current.push(window.setTimeout(() => { if (taskIsActive()) updateProgress('running', 24) }, 420))
    taskTimers.current.push(window.setTimeout(() => { if (taskIsActive()) updateProgress('running', 68) }, 1150))
    taskTimers.current.push(window.setTimeout(() => {
      if (!taskIsActive()) return
      updateCanvas(canvasId, (canvas) => {
        const completedNodes: CanvasFlowNode[] = canvas.nodes.map((node): CanvasFlowNode => node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                status: 'success' as const,
                progress: 100,
                content: '根据 Prompt 生成的图片结果',
                mediaVariant: 'anime' as const,
                media: imageMediaForVariant('anime'),
                staleNoticeDismissed: undefined,
              },
            }
          : node)
        return {
          ...canvas,
          nodes: syncTargetReferences(markDownstreamNodesStale(completedNodes, canvas.edges, [nodeId]), canvas.edges),
          tasks: canvas.tasks.map((item) => item.id === taskId
            ? { ...item, status: 'success', progress: 100, outputMedia: imageMediaForVariant('anime') }
            : item),
        }
      })
      if (activeCanvasIdRef.current === canvasId) notify(`${source.data.title}已重新生成，下游输入已更新`)
    }, 2200))
  }, [activeCanvasId, notify, saveHistory, updateCanvas])

  const createAudioTrimDerivative = useCallback((nodeId: string, result: AudioOperationResult) => {
    const canvasId = activeCanvasId
    const source = nodesRef.current.find((node) => node.id === nodeId)
    if (!source || source.data.nodeType !== 'audio' || !(source.data.content ?? '').trim()) return notify('请先选择有内容的音频节点')
    const sourceDuration = source.data.media?.duration ?? source.data.duration ?? 12
    const start = Math.min(Math.max(result.start, 0), Math.max(sourceDuration - .1, 0))
    const end = Math.min(Math.max(result.end, start + .1), sourceDuration)
    if (end - start < .1) return notify('裁剪片段至少保留 0.1 秒')

    saveHistory()
    const createdAt = Date.now()
    const siblings = edgesRef.current.filter((edge) => edge.source === source.id && edge.data?.relationType === 'audio-operation').length
    const childId = `audio-trim-${createdAt}`
    const child: CanvasFlowNode = {
      id: childId,
      type: 'audio',
      position: { x: source.position.x + 410 + Math.floor(siblings / 2) * 360, y: source.position.y + (siblings % 2) * 156 },
      selected: true,
      data: {
        ...structuredClone(source.data),
        title: `${source.data.title} · 裁剪`,
        sourceKind: 'generated',
        status: 'success',
        duration: end - start,
        media: source.data.media ? { ...source.data.media, duration: end - start } : source.data.media,
        audioOperation: { operation: 'trim', start, end },
        references: [],
        staleNoticeDismissed: undefined,
      },
    }
    const edge: CanvasFlowEdge = {
      id: `edge-${nodeId}-${childId}`,
      source: nodeId,
      sourceHandle: 'output',
      target: childId,
      targetHandle: 'input',
      type: 'canvas',
      data: { relationType: 'audio-operation', audioOperation: 'trim' },
    }
    const task: GenerationTask = {
      id: `task-${createdAt}`,
      canvasId,
      nodeId: childId,
      nodeTitle: child.data.title,
      nodeType: 'audio',
      status: 'success',
      progress: 100,
      effectivePrompt: `裁剪 ${start.toFixed(2)}s - ${end.toFixed(2)}s`,
      inputReferenceIds: [nodeId],
      audioOperation: structuredClone(child.data.audioOperation),
      outputNodeIds: [childId],
      outputMedia: child.data.media ? structuredClone(child.data.media) : undefined,
      modelLabel: '音频裁剪',
      cost: 0,
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    }
    updateCanvas(canvasId, (canvas) => {
      const nextEdges = [...canvas.edges.map((item) => ({ ...item, selected: false })), edge]
      return {
        ...canvas,
        edges: nextEdges,
        nodes: syncTargetReferences([...canvas.nodes.map((node) => ({ ...node, selected: false })), child], nextEdges),
        tasks: [task, ...canvas.tasks],
      }
    })
    window.setTimeout(() => setCenter(child.position.x + 165, child.position.y + 74, { zoom: 0.9, duration: 280 }), 20)
    notify('已生成裁剪后的音频节点')
  }, [activeCanvasId, notify, saveHistory, setCenter, updateCanvas])

  const nextVideoPosition = useCallback((source: CanvasFlowNode) => {
    const siblings = edgesRef.current.filter((edge) => edge.source === source.id && edge.data?.relationType === 'video-operation').length
    return {
      x: source.position.x + 520 + Math.floor(siblings / 2) * 500,
      y: source.position.y + (siblings % 2) * 360,
    }
  }, [])

  const prepareVideoOperation = useCallback((nodeId: string, operation: Exclude<VideoOperation, 'lip-sync'>) => {
    const canvasId = activeCanvasId
    const source = nodesRef.current.find((node) => node.id === nodeId)
    if (!source || source.data.nodeType !== 'video' || !source.data.media?.url || source.data.status !== 'success') {
      notify('请先选择已完成的视频')
      return
    }
    saveHistory()
    const createdAt = Date.now()
    const childId = `video-${operation}-${createdAt}`
    const result = defaultVideoOperationResult(operation)
    const child: CanvasFlowNode = {
      id: childId,
      type: 'video',
      position: nextVideoPosition(source),
      selected: true,
      data: {
        ...buildVideoDerivativeData(source.data, result, source.data.media),
        status: 'ready',
        progress: 0,
      },
    }
    const edge: CanvasFlowEdge = {
      id: `edge-${nodeId}-${childId}`,
      source: nodeId,
      sourceHandle: 'video-operation-output',
      target: childId,
      targetHandle: 'input',
      type: 'canvas',
      data: { relationType: 'video-operation', videoOperation: operation },
    }
    updateCanvas(canvasId, (canvas) => {
      const nextEdges = [...canvas.edges.map((item) => ({ ...item, selected: false })), edge]
      return {
        ...canvas,
        edges: nextEdges,
        nodes: syncTargetReferences([...canvas.nodes.map((node) => ({ ...node, selected: false })), child], nextEdges),
      }
    })
    window.setTimeout(() => setCenter(
      child.position.x + 220,
      child.position.y + (operation === 'edit' ? 520 : 390),
      { zoom: operation === 'edit' ? 0.64 : 0.74, duration: 300 },
    ), 20)
    notify(`已创建${videoOperationCopy[operation]}派生节点`)
  }, [activeCanvasId, nextVideoPosition, notify, saveHistory, setCenter, updateCanvas])

  const cancelPendingVideoOperation = useCallback((nodeId: string) => {
    const edge = edgesRef.current.find((item) => item.target === nodeId && item.data?.relationType === 'video-operation')
    const pending = nodesRef.current.find((node) => node.id === nodeId)
    if (!edge || !pending || pending.data.status !== 'ready') return
    saveHistory()
    updateCanvas(activeCanvasId, (canvas) => {
      const nextEdges = canvas.edges.filter((item) => item.id !== edge.id && item.source !== nodeId && item.target !== nodeId)
      return {
        ...canvas,
        edges: nextEdges,
        nodes: syncTargetReferences(canvas.nodes.filter((node) => node.id !== nodeId).map((node) => ({ ...node, selected: node.id === edge.source })), nextEdges),
      }
    })
    notify('已取消视频处理')
  }, [activeCanvasId, notify, saveHistory, updateCanvas])

  const completeVideoOperation = useCallback((nodeId: string, result: VideoOperationResult) => {
    const canvasId = activeCanvasId
    const canvas = canvasesRef.current.find((item) => item.id === canvasId)
    const pending = canvas?.nodes.find((node) => node.id === nodeId)
    const sourceEdge = canvas?.edges.find((edge) => edge.target === nodeId && edge.data?.relationType === 'video-operation')
    const source = sourceEdge ? canvas?.nodes.find((node) => node.id === sourceEdge.source) : undefined
    if (!canvas || !pending || !source || pending.data.nodeType !== 'video' || source.data.nodeType !== 'video') return
    saveHistory()
    const createdAt = Date.now()
    const taskId = `task-${createdAt}`
    const summary = videoOperationSummary(result)
    const task: GenerationTask = {
      id: taskId,
      canvasId,
      nodeId,
      nodeTitle: pending.data.title,
      nodeType: 'video',
      status: 'running',
      progress: 32,
      effectivePrompt: summary,
      inputReferenceIds: [source.id],
      videoOperation: structuredClone(result),
      outputNodeIds: [nodeId],
      modelLabel: `${videoOperationCopy[result.operation]} Mock`,
      cost: videoOperationCost(result),
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    }
    updateCanvas(canvasId, (current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === nodeId
        ? { ...node, data: { ...node.data, status: 'running', progress: 32, videoOperation: structuredClone(result) } }
        : node),
      tasks: [task, ...current.tasks],
    }))
    notify(`${videoOperationCopy[result.operation]}任务已开始`)
    taskTimers.current.push(window.setTimeout(() => {
      const activeTask = canvasesRef.current.find((item) => item.id === canvasId)?.tasks
        .find((item) => item.id === taskId && (item.status === 'queued' || item.status === 'running'))
      if (!activeTask) return
      updateCanvas(canvasId, (current) => ({
        ...current,
        nodes: current.nodes.map((node) => node.id === nodeId
          ? { ...node, data: buildVideoDerivativeData(source.data, result, source.data.media) }
          : node),
        tasks: current.tasks.map((item) => item.id === taskId
          ? { ...item, status: 'success', progress: 100, outputMedia: source.data.media ? { ...source.data.media } : undefined }
          : item),
      }))
      if (activeCanvasIdRef.current === canvasId) notify(`${videoOperationCopy[result.operation]}已完成`)
    }, 950))
  }, [activeCanvasId, notify, saveHistory, updateCanvas])

  const createLipSyncDerivative = useCallback((nodeId: string, result: Extract<VideoOperationResult, { operation: 'lip-sync' }>) => {
    const canvasId = activeCanvasId
    const source = nodesRef.current.find((node) => node.id === nodeId)
    if (!source || source.data.nodeType !== 'video' || !source.data.media?.url || source.data.status !== 'success') return notify('请先选择已完成的视频')
    saveHistory()
    const createdAt = Date.now()
    const childId = `video-lip-sync-${createdAt}`
    const child: CanvasFlowNode = {
      id: childId,
      type: 'video',
      position: nextVideoPosition(source),
      selected: true,
      data: { ...buildVideoDerivativeData(source.data, result, source.data.media), status: 'running', progress: 36 },
    }
    const edge: CanvasFlowEdge = {
      id: `edge-${nodeId}-${childId}`,
      source: nodeId,
      sourceHandle: 'video-operation-output',
      target: childId,
      targetHandle: 'input',
      type: 'canvas',
      data: { relationType: 'video-operation', videoOperation: 'lip-sync' },
    }
    const taskId = `task-${createdAt}`
    const task: GenerationTask = {
      id: taskId,
      canvasId,
      nodeId: childId,
      nodeTitle: child.data.title,
      nodeType: 'video',
      status: 'running',
      progress: 36,
      effectivePrompt: videoOperationSummary(result),
      inputReferenceIds: [nodeId],
      videoOperation: structuredClone(result),
      outputNodeIds: [childId],
      modelLabel: '对口型 Mock',
      cost: videoOperationCost(result),
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    }
    updateCanvas(canvasId, (canvas) => {
      const nextEdges = [...canvas.edges.map((item) => ({ ...item, selected: false })), edge]
      return {
        ...canvas,
        edges: nextEdges,
        nodes: syncTargetReferences([...canvas.nodes.map((node) => ({ ...node, selected: false })), child], nextEdges),
        tasks: [task, ...canvas.tasks],
      }
    })
    window.setTimeout(() => setCenter(child.position.x + 220, child.position.y + 280, { zoom: 0.82, duration: 300 }), 20)
    taskTimers.current.push(window.setTimeout(() => {
      const activeTask = canvasesRef.current.find((item) => item.id === canvasId)?.tasks
        .find((item) => item.id === taskId && (item.status === 'queued' || item.status === 'running'))
      if (!activeTask) return
      updateCanvas(canvasId, (canvas) => ({
        ...canvas,
        nodes: canvas.nodes.map((node) => node.id === childId ? { ...node, data: buildVideoDerivativeData(source.data, result, source.data.media) } : node),
        tasks: canvas.tasks.map((item) => item.id === taskId ? { ...item, status: 'success', progress: 100, outputMedia: { ...source.data.media! } } : item),
      }))
      if (activeCanvasIdRef.current === canvasId) notify('对口型视频已生成')
    }, 1100))
  }, [activeCanvasId, nextVideoPosition, notify, saveHistory, setCenter, updateCanvas])

  const completeVideoEdit = useCallback((nodeId: string, result: Extract<VideoOperationResult, { operation: 'edit' }>) => {
    completeVideoOperation(nodeId, result)
  }, [completeVideoOperation])

  const selectOnlyNode = useCallback((nodeId: string) => {
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === nodeId })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
  }, [setEdges, setNodes])

  const locateNode = useCallback((nodeId: string) => {
    const node = nodesRef.current.find((item) => item.id === nodeId)
    if (!node) return notify('对应节点不在当前画布')
    selectOnlyNode(nodeId)
    setCenter(node.position.x + 180, node.position.y + 160, { zoom: 0.92, duration: 280 })
    notify(`已定位到${node.data.title}`)
  }, [notify, selectOnlyNode, setCenter])

  const locateGroup = useCallback((groupId: string) => {
    const group = groupsRef.current.find((item) => item.id === groupId)
    if (!group) return notify('对应分组不在当前画布')
    const memberIds = new Set(group.nodeIds)
    setPlaylistSelection(null)
    setNodes((current) => current.map((node) => ({ ...node, selected: memberIds.has(node.id) })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
    setCenter(group.bounds.x + group.bounds.width / 2, group.bounds.y + group.bounds.height / 2, { zoom: 0.76, duration: 280 })
    notify(`已定位到${group.name}`)
  }, [notify, setCenter, setEdges, setNodes])

  const deleteSelection = useCallback((nodeIds: string[], edgeIds: string[]) => {
    if (!nodeIds.length && !edgeIds.length) return
    saveHistory()
    const result = removeCanvasSelection(nodesRef.current, edgesRef.current, groupsRef.current, nodeIds, edgeIds)
    updateCanvas(activeCanvasId, (canvas) => ({
      ...canvas,
      edges: result.edges,
      nodes: syncTargetReferences(result.nodes, result.edges),
      groups: result.groups,
      playlists: pruneMissingPlaylistClips(canvas.playlists ?? [], result.nodes),
    }))
    const total = nodeIds.length + edgeIds.length
    notify(`已删除 ${total} 个选中对象`)
  }, [activeCanvasId, notify, saveHistory, updateCanvas])

  const deleteNodes = useCallback((ids: string[]) => deleteSelection(ids, []), [deleteSelection])

  const duplicateSelection = useCallback((selectionIds?: string[]) => {
    const selectedIds = selectionIds ?? nodesRef.current.filter((node) => node.selected).map((node) => node.id)
    if (!selectedIds.length) return notify('请先选择要复制的节点')
    saveHistory()
    const result = duplicateCanvasSelection(nodesRef.current, edgesRef.current, groupsRef.current, selectedIds, String(Date.now()))
    updateCanvas(activeCanvasId, (canvas) => {
      const nextEdges = [...canvas.edges.map((edge) => ({ ...edge, selected: false })), ...result.copiedEdges]
      return {
        ...canvas,
        edges: nextEdges,
        nodes: syncTargetReferences([...canvas.nodes.map((node) => ({ ...node, selected: false })), ...result.copies], nextEdges),
        groups: [...canvas.groups, ...result.copiedGroups],
      }
    })
    notify(`已复制 ${result.copies.length} 个节点`)
  }, [activeCanvasId, notify, saveHistory, updateCanvas])

  const addNode = useCallback((type: MediaNodeType, source: 'created' | 'upload' | 'asset' | 'virtual-ip' = 'created', positionOverride?: { x: number; y: number }) => {
    saveHistory()
    const id = `${type}-${Date.now()}`
    const position = positionOverride ?? screenToFlowPosition({ x: window.innerWidth * 0.52, y: window.innerHeight * 0.45 })
    const index = nodeCounter.current++
    const node = buildCanvasNode(id, type, source, index, position)
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
    setNodes((current) => [...current.map((item) => ({ ...item, selected: false })), node])
    setDrawer(null)
    setQuickAdd(null)
    notify(`${node.data.title}已加入画布`)
  }, [notify, saveHistory, screenToFlowPosition, setEdges, setNodes])

  const pasteTextNode = useCallback(async (position: { x: number; y: number }) => {
    try {
      const content = await navigator.clipboard.readText()
      if (!content.trim()) return notify('剪贴板中没有可粘贴的文本')
      saveHistory()
      const node = buildCanvasNode(`text-${Date.now()}`, 'text', 'created', nodeCounter.current++, position)
      node.data = { ...node.data, content, status: 'ready' }
      setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
      setNodes((current) => [...current.map((item) => ({ ...item, selected: false })), node])
      notify('已粘贴为文本节点')
    } catch {
      notify('无法读取剪贴板，请使用 Cmd/Ctrl + V')
    }
  }, [notify, saveHistory, setEdges, setNodes])

  const uploadFiles = useCallback((files: File[], positionOverride?: { x: number; y: number }) => {
    const accepted = files.flatMap((file) => {
      const type = mediaNodeTypeForFile(file)
      return type ? [{ file, type }] : []
    })
    if (!accepted.length) return notify('暂不支持所选文件类型')

    saveHistory()
    const canvasId = activeCanvasId
    const batchId = Date.now()
    const origin = positionOverride ?? screenToFlowPosition({ x: window.innerWidth * 0.44, y: window.innerHeight * 0.34 })
    const uploads = accepted.map(({ file, type }, index) => {
      const id = `${type}-upload-${batchId}-${index}`
      const position = batchMediaPosition(origin, index)
      const node = buildCanvasNode(id, type, 'upload', nodeCounter.current++, position)
      const url = URL.createObjectURL(file)
      node.data = {
        ...node.data,
        title: file.name.replace(/\.[^.]+$/, '') || node.data.title,
        status: 'success',
        sourceKind: 'upload',
        content: file.name,
        mediaVariant: undefined,
        media: { url, mimeType: file.type || undefined, hasAudio: type === 'audio' ? true : undefined },
        videoOperation: undefined,
      }
      return { file, type, node, url }
    })

    updateCanvas(canvasId, (canvas) => ({
      ...canvas,
      edges: canvas.edges.map((edge) => ({ ...edge, selected: false })),
      nodes: [...canvas.nodes.map((node) => ({ ...node, selected: false })), ...uploads.map(({ node }) => node)],
    }))
    setDrawer(null)
    setQuickAdd(null)
    setContinuation(null)
    const skipped = files.length - uploads.length
    notify(skipped ? `已上传 ${uploads.length} 个文件，跳过 ${skipped} 个不支持文件` : `已批量上传 ${uploads.length} 个文件`)

    uploads.forEach(({ type, node, url }) => {
      if (type === 'image') {
        const probe = new Image()
        probe.onload = () => patchCanvasNode(canvasId, node.id, { media: { ...node.data.media!, width: probe.naturalWidth, height: probe.naturalHeight } })
        probe.src = url
        return
      }
      const probe = document.createElement(type)
      probe.preload = type === 'video' ? 'auto' : 'metadata'
      probe.onloadedmetadata = () => {
        const width = type === 'video' ? (probe as HTMLVideoElement).videoWidth : undefined
        const height = type === 'video' ? (probe as HTMLVideoElement).videoHeight : undefined
        const duration = Number.isFinite(probe.duration) ? probe.duration : undefined
        const hasAudio = type === 'video' ? detectVideoAudio(probe as HTMLVideoElement) : true
        patchCanvasNode(canvasId, node.id, { duration, media: { ...node.data.media!, width, height, duration, hasAudio } })
        if (type === 'video') void extractVideoTimelineFrames(probe as HTMLVideoElement).then((timelineFrameUrls) => {
          if (!timelineFrameUrls.length) return
          patchCanvasNode(canvasId, node.id, {
            duration,
            media: {
              ...node.data.media!,
              width,
              height,
              duration,
              hasAudio: detectVideoAudio(probe as HTMLVideoElement) ?? hasAudio,
              posterUrl: timelineFrameUrls[0],
              timelineFrameUrls,
            },
          })
        })
      }
      if (type === 'video') probe.onloadeddata = () => {
        const hasAudio = detectVideoAudio(probe as HTMLVideoElement)
        if (hasAudio !== undefined) patchCanvasNode(canvasId, node.id, {
          media: {
            ...node.data.media!,
            width: (probe as HTMLVideoElement).videoWidth,
            height: (probe as HTMLVideoElement).videoHeight,
            duration: Number.isFinite(probe.duration) ? probe.duration : undefined,
            hasAudio,
          },
        })
      }
      probe.src = url
    })
  }, [activeCanvasId, notify, patchCanvasNode, saveHistory, screenToFlowPosition, updateCanvas])

  const uploadNodeMedia = useCallback((nodeId: string, file: File) => {
    const node = nodesRef.current.find((item) => item.id === nodeId)
    const incomingType = mediaNodeTypeForFile(file)
    if (!node || !incomingType) return notify('暂不支持所选文件类型')
    const acceptsFile = node.data.nodeType === 'image'
      ? incomingType === 'image'
      : node.data.nodeType === 'video'
        ? incomingType === 'video'
        : node.data.nodeType === 'audio'
          ? incomingType === 'audio' || incomingType === 'video'
          : false
    if (!acceptsFile) {
      const acceptedLabel = node.data.nodeType === 'audio' ? '音频或视频' : node.data.nodeType === 'image' ? '图片' : '视频'
      return notify(`当前${node.data.title}仅支持上传${acceptedLabel}`)
    }

    saveHistory()
    const canvasId = activeCanvasId
    const url = URL.createObjectURL(file)
    const title = file.name.replace(/\.[^.]+$/, '') || node.data.title
    const media: MediaMetadata = {
      url,
      mimeType: file.type || undefined,
      hasAudio: node.data.nodeType === 'audio' ? true : undefined,
    }
    updateCanvas(canvasId, (canvas) => ({
      ...canvas,
      nodes: canvas.nodes.map((item) => item.id === nodeId ? {
        ...item,
        data: {
          ...item.data,
          title,
          status: 'success',
          sourceKind: 'upload',
          content: file.name,
          mediaVariant: node.data.nodeType === 'audio' ? 'audio' : undefined,
          media,
          error: undefined,
          staleNoticeDismissed: undefined,
        },
      } : item),
    }))

    if (incomingType === 'image') {
      const probe = new Image()
      probe.onload = () => patchCanvasNode(canvasId, nodeId, {
        media: { ...media, width: probe.naturalWidth, height: probe.naturalHeight },
      })
      probe.src = url
    } else {
      const probe = document.createElement(incomingType === 'video' ? 'video' : 'audio') as HTMLVideoElement | HTMLAudioElement
      probe.preload = 'metadata'
      probe.onloadedmetadata = () => {
        const video = incomingType === 'video' ? probe as HTMLVideoElement : undefined
        const duration = Number.isFinite(probe.duration) ? probe.duration : undefined
        patchCanvasNode(canvasId, nodeId, {
          duration,
          media: {
            ...media,
            width: video?.videoWidth,
            height: video?.videoHeight,
            duration,
            hasAudio: node.data.nodeType === 'audio' ? true : video ? detectVideoAudio(video) : true,
          },
        })
      }
      probe.src = url
    }
    notify(`已上传${file.name}到当前节点`)
  }, [activeCanvasId, notify, patchCanvasNode, saveHistory, updateCanvas])

  const addSessionAsset = useCallback((asset: SessionAsset) => {
    saveHistory()
    const id = `${asset.nodeType}-asset-${Date.now()}`
    const position = screenToFlowPosition({ x: window.innerWidth * 0.52, y: window.innerHeight * 0.45 })
    const node = buildCanvasNode(id, asset.nodeType, 'asset', nodeCounter.current++, position)
    node.data = {
      ...node.data,
      title: asset.title,
      content: asset.content,
      mediaVariant: asset.mediaVariant ?? node.data.mediaVariant,
      media: asset.media ? structuredClone(asset.media) : node.data.media,
      imageOperation: asset.imageEditorComposition ? {
        operation: asset.imageEditorComposition.sourceNodeIds.length > 1 ? 'image-compose' : 'image-editor',
        aspectRatio: asset.imageEditorComposition.aspectRatio === 'custom'
          ? `${asset.imageEditorComposition.width}:${asset.imageEditorComposition.height}`
          : asset.imageEditorComposition.aspectRatio,
        editorComposition: structuredClone(asset.imageEditorComposition),
      } : node.data.imageOperation,
      sourceKind: 'asset',
      status: 'success',
      references: [],
    }
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
    setNodes((current) => [...current.map((item) => ({ ...item, selected: false })), node])
    setDrawer(null)
    notify(`${asset.title}已从会话资产加入画布`)
  }, [notify, saveHistory, screenToFlowPosition, setEdges, setNodes])

  const renameNode = useCallback((nodeId: string, title: string) => {
    saveHistory()
    updateNode(nodeId, { title })
    notify('节点已重命名')
  }, [notify, saveHistory, updateNode])

  const organizeCanvas = useCallback(() => {
    saveHistory()
    const organized = organizeCanvasLayout(nodesRef.current, groupsRef.current, playlistsRef.current)
    updateCanvas(activeCanvasId, (canvas) => ({ ...canvas, nodes: organized.nodes, groups: organized.groups, playlists: organized.playlists }))
    window.setTimeout(() => fitView({ padding: 0.18, duration: 300 }), 20)
    notify(groupsRef.current.length || playlistsRef.current.length ? '画布已整理，分组与播放列表保持完整' : '画布已整理')
  }, [activeCanvasId, fitView, notify, saveHistory, updateCanvas])

  const onNodeClick: NodeMouseHandler<CanvasFlowNode> = useCallback((event, node) => {
    if (interactionMode?.kind === 'playlist-clips') {
      event.preventDefault()
      event.stopPropagation()
      setPlaylistSelection({ kind: 'playlist', playlistId: interactionMode.playlistId })
      setNodes((current) => current.map((item) => ({ ...item, selected: false })))
      setEdges((current) => current.map((item) => ({ ...item, selected: false })))
      if (!isInteractionCandidate(node.id)) return notify('请选择已生成的视频节点')
      saveHistory()
      setPlaylists((current) => current.map((playlist) => playlist.id === interactionMode.playlistId ? addPlaylistClip(playlist, node.id) : playlist))
      notify('视频已加入播放列表，可继续选择或按 Esc 退出')
      return
    }
    if (interactionMode?.kind === 'reference') {
      const target = nodesRef.current.find((item) => item.id === interactionMode.targetNodeId)
      if (!target || node.id === target.id) return
      const candidateEdges = interactionMode.replaceEdgeId ? edgesRef.current.filter((edge) => edge.id !== interactionMode.replaceEdgeId) : edgesRef.current
      const connection: Connection = { source: node.id, target: target.id, sourceHandle: 'output', targetHandle: 'input' }
      const fullVideoReference = target.data.nodeType === 'video' && interactionMode.role === 'reference'
      if (fullVideoReference) {
        if (!canUseAsVideoReference(node.data)) return notify('请选择有内容的文本、图片、视频或音频节点')
        const alreadyReferenced = candidateEdges.some((edge) => edge.source === node.id && edge.target === target.id && edge.data?.relationType === 'generation-input' && edge.data?.inputRole === 'reference')
        if (alreadyReferenced) return notify('该节点已在全能参考中')
      } else {
        const validation = validateConnection(connection, nodesRef.current, candidateEdges)
        if (!validation.valid) return notify(validation.reason)
      }
      saveHistory()
      const edge: CanvasFlowEdge = { id: `edge-${node.id}-${target.id}-${Date.now()}`, source: node.id, target: target.id, sourceHandle: 'output', targetHandle: 'input', type: 'canvas', data: { relationType: 'generation-input', inputRole: interactionMode.role ?? 'default' } }
      updateCanvas(activeCanvasId, (canvas) => {
        const retained = interactionMode.replaceEdgeId ? canvas.edges.filter((item) => item.id !== interactionMode.replaceEdgeId) : canvas.edges
        const nextEdges = [...retained, edge]
        return { ...canvas, edges: nextEdges, nodes: syncTargetReferences(canvas.nodes, nextEdges) }
      })
      if (!fullVideoReference || interactionMode.replaceEdgeId) setInteractionMode(null)
      window.setTimeout(() => selectOnlyNode(target.id), 0)
      notify(interactionMode.replaceEdgeId ? '已替换生成参考' : fullVideoReference ? '已加入全能参考，可继续选择' : '已添加生成参考')
      return
    }
    if (interactionMode?.kind === 'marker') {
      if (node.data.nodeType !== 'image') notify('请在图片中点击需要聚焦的位置')
      return
    }
    setPlaylistSelection(null)
    selectOnlyNode(node.id)
    if (node.data.nodeType === 'video') {
      window.setTimeout(() => setCenter(node.position.x + 220, node.position.y + 370, { zoom: 0.72, duration: 260 }), 20)
    }
  }, [activeCanvasId, interactionMode, isInteractionCandidate, notify, saveHistory, selectOnlyNode, setCenter, setEdges, setNodes, setPlaylists, updateCanvas])
  const onEdgeClick: EdgeMouseHandler<CanvasFlowEdge> = useCallback((_event, edge) => {
    setPlaylistSelection(null)
    setNodes((current) => current.map((node) => ({ ...node, selected: false })))
    setEdges((current) => current.map((item) => ({ ...item, selected: item.id === edge.id })))
  }, [setEdges, setNodes])

  const onNodeDragStart: OnNodeDrag<CanvasFlowNode> = useCallback((_event, node, draggedNodes) => {
    const nodeIds = [...new Set([...draggedNodes.map((item) => item.id), node.id])]
    nodeDragRef.current = {
      canvasId: activeCanvasId,
      snapshot: cloneCanvasSnapshot(nodesRef.current, edgesRef.current, groupsRef.current, tasksRef.current, playlistsRef.current),
      nodeIds,
      anchorId: node.id,
      delta: { x: 0, y: 0 },
      updated: false,
    }
    playlistDropPreviewRef.current = null
    setPlaylistDropPreview(null)
    setAlignmentGuides([])
  }, [activeCanvasId])

  const onNodeDrag: OnNodeDrag<CanvasFlowNode> = useCallback((_event, node) => {
    const state = nodeDragRef.current
    if (!state) return
    const originAnchor = state.snapshot.nodes.find((item) => item.id === state.anchorId)
    const originMembers = state.snapshot.nodes.filter((item) => state.nodeIds.includes(item.id))
    const originBounds = calculateGroupBounds(originMembers, 0)
    if (!originAnchor || !originBounds) return

    const rawDelta = {
      x: node.position.x - originAnchor.position.x,
      y: node.position.y - originAnchor.position.y,
    }
    const dragged: AlignmentBox = {
      id: `selection-${state.anchorId}`,
      x: originBounds.x + rawDelta.x,
      y: originBounds.y + rawDelta.y,
      width: originBounds.width,
      height: originBounds.height,
    }
    const draggedIds = new Set(state.nodeIds)
    const others = nodesRef.current.filter((item) => !draggedIds.has(item.id)).map(nodeBox)
    const result = calculateAlignmentSnap(dragged, others, 8 / Math.max(zoom, 0.28))
    const delta = {
      x: rawDelta.x + result.x - dragged.x,
      y: rawDelta.y + result.y - dragged.y,
    }
    state.delta = delta
    state.updated = true
    setAlignmentGuides(result.guides)
    if (result.x !== dragged.x || result.y !== dragged.y) {
      setNodes((current) => translateNodesFromOrigin(current, state.snapshot.nodes, state.nodeIds, delta.x, delta.y))
    }
    const previewNode = { ...node, position: { x: originAnchor.position.x + delta.x, y: originAnchor.position.y + delta.y } }
    const targetPlaylist = isPlayablePlaylistVideo(previewNode)
      ? playlistsRef.current.find((playlist) => isVideoNodeInPlaylistDropZone(previewNode, playlist, selectedPlaylistId === playlist.id))
      : undefined
    const { width } = nodeDimensions(previewNode)
    const nextPreview = targetPlaylist ? {
      playlistId: targetPlaylist.id,
      nodeId: previewNode.id,
      insertionIndex: playlistInsertionIndexAtPoint(targetPlaylist, nodesRef.current, previewNode.position.x + width / 2, selectedPlaylistId === targetPlaylist.id),
    } : null
    const previousPreview = playlistDropPreviewRef.current
    if (previousPreview?.playlistId !== nextPreview?.playlistId || previousPreview?.nodeId !== nextPreview?.nodeId || previousPreview?.insertionIndex !== nextPreview?.insertionIndex) {
      playlistDropPreviewRef.current = nextPreview
      setPlaylistDropPreview(nextPreview)
    }
  }, [selectedPlaylistId, setNodes, zoom])

  const onNodeDragStop: OnNodeDrag<CanvasFlowNode> = useCallback((_event, node) => {
    const state = nodeDragRef.current
    const pendingDropPreview = playlistDropPreviewRef.current
    if (state) {
      const originAnchor = state.snapshot.nodes.find((item) => item.id === state.anchorId)
      const delta = state.updated || !originAnchor ? state.delta : {
        x: node.position.x - originAnchor.position.x,
        y: node.position.y - originAnchor.position.y,
      }
      const moved = Math.abs(delta.x) > 0.001 || Math.abs(delta.y) > 0.001
      if (moved) {
        const stack = histories.current[state.canvasId] ?? (histories.current[state.canvasId] = [])
        stack.push(state.snapshot)
        if (stack.length > 40) stack.shift()
        futures.current[state.canvasId] = []
        updateCanvas(state.canvasId, (canvas) => {
          const finalNodes = translateNodesFromOrigin(canvas.nodes, state.snapshot.nodes, state.nodeIds, delta.x, delta.y)
          const draggedNode = finalNodes.find((item) => item.id === state.anchorId)
          const dropPreview = draggedNode && pendingDropPreview?.nodeId === draggedNode.id ? pendingDropPreview : null
          let addedToPlaylist = false
          const nextPlaylists = dropPreview
            ? (canvas.playlists ?? []).map((playlist) => {
                if (playlist.id !== dropPreview.playlistId) return playlist
                const next = addPlaylistClip(playlist, draggedNode!.id, dropPreview.insertionIndex)
                addedToPlaylist = next.clips.length !== playlist.clips.length
                return next
              })
            : canvas.playlists
          if (addedToPlaylist) window.setTimeout(() => notify('视频已加入播放列表'), 0)
          const nextNodes = addedToPlaylist
            ? translateNodesFromOrigin(canvas.nodes, state.snapshot.nodes, state.nodeIds, 0, 0).map((item) => ({ ...item, selected: false }))
            : finalNodes
          return {
            ...canvas,
            nodes: nextNodes,
            edges: addedToPlaylist ? canvas.edges.map((item) => ({ ...item, selected: false })) : canvas.edges,
            groups: addedToPlaylist ? canvas.groups : reconcileDraggedNodeGroups(canvas.groups, finalNodes, state.nodeIds, delta.x, delta.y),
            playlists: nextPlaylists,
          }
        })
        const droppedPlaylistId = pendingDropPreview?.playlistId
        const droppedPlaylist = playlistsRef.current.find((playlist) => playlist.id === droppedPlaylistId)
        if (droppedPlaylist) {
          setPlaylistSelection({ kind: 'playlist', playlistId: droppedPlaylist.id })
          const frameHeight = playlistExpandedHeight(droppedPlaylist)
          const fittedZoom = Math.max(0.45, Math.min(Math.max(zoom, 0.82), (window.innerHeight - 144) / frameHeight))
          window.setTimeout(() => setCenter(droppedPlaylist.position.x + playlistWidth(droppedPlaylist) / 2, droppedPlaylist.position.y + frameHeight / 2, { zoom: fittedZoom, duration: 260 }), 20)
        }
      }
    }
    nodeDragRef.current = null
    playlistDropPreviewRef.current = null
    setPlaylistDropPreview(null)
    setAlignmentGuides([])
  }, [notify, setCenter, updateCanvas, zoom])

  const createOrUngroupSelection = useCallback((selectionIds?: string[]) => {
    const selectedIds = selectionIds ?? nodesRef.current.filter((node) => node.selected).map((node) => node.id)
    if (selectedIds.length < 2) return notify('请至少选择两个节点')
    const containing = groupsRef.current.filter((group) => selectedIds.some((id) => group.nodeIds.includes(id)))
    if (containing.length === 1 && containing[0].nodeIds.length === selectedIds.length && containing[0].nodeIds.every((id) => selectedIds.includes(id))) {
      saveHistory()
      setGroups((current) => current.filter((group) => group.id !== containing[0].id))
      notify('已解组')
      return
    }
    if (containing.length) return notify('请先解组已分组的节点')
    saveHistory()
    const members = nodesRef.current.filter((node) => selectedIds.includes(node.id))
    const bounds = calculateGroupBounds(members, 24)
    if (!bounds) return
    const group: CanvasGroup = { id: `group-${Date.now()}`, name: `组 ${groupCounter.current++}`, nodeIds: selectedIds, bounds }
    setGroups((current) => [...current, group])
    notify(`已创建${group.name}`)
  }, [notify, saveHistory, setGroups])

  const verifySelectionCompliance = useCallback((selectionIds: string[]) => {
    const eligibleIds = nodesRef.current
      .filter((node) => selectionIds.includes(node.id) && isSeedanceComplianceEligible(node))
      .map((node) => node.id)
    if (!eligibleIds.length) return notify('所选节点中没有可验证的媒体')
    const eligibleSet = new Set(eligibleIds)
    saveHistory()
    updateCanvas(activeCanvasId, (canvas) => ({
      ...canvas,
      nodes: canvas.nodes.map((node) => eligibleSet.has(node.id)
        ? { ...node, data: { ...node.data, seedanceCompliance: 'checking' } }
        : node),
    }))
    const skipped = selectionIds.length - eligibleIds.length
    notify(skipped ? `正在批量验证 ${eligibleIds.length} 个媒体，跳过 ${skipped} 个节点` : `正在批量验证 ${eligibleIds.length} 个媒体`)
    taskTimers.current.push(window.setTimeout(() => {
      updateCanvas(activeCanvasId, (canvas) => ({
        ...canvas,
        nodes: canvas.nodes.map((node) => eligibleSet.has(node.id) && node.data.seedanceCompliance === 'checking'
          ? { ...node, data: { ...node.data, seedanceCompliance: 'approved' } }
          : node),
      }))
      if (activeCanvasIdRef.current === activeCanvasId) notify(`批量验证完成：${eligibleIds.length} 个媒体已通过`)
    }, 950))
  }, [activeCanvasId, notify, saveHistory, updateCanvas])

  const renameGroup = useCallback((groupId: string, name: string) => {
    const next = name.trim()
    if (!next) return
    saveHistory()
    setGroups((current) => current.map((group) => group.id === groupId ? { ...group, name: next } : group))
  }, [saveHistory, setGroups])

  const duplicateGroup = useCallback((groupId: string) => {
    const group = groupsRef.current.find((item) => item.id === groupId)
    if (!group) return notify('对应分组不在当前画布')
    duplicateSelection(group.nodeIds)
  }, [duplicateSelection, notify])

  const ungroupGroup = useCallback((groupId: string) => {
    const group = groupsRef.current.find((item) => item.id === groupId)
    if (!group) return notify('对应分组不在当前画布')
    saveHistory()
    setGroups((current) => current.filter((item) => item.id !== groupId))
    notify(`已解组${group.name}`)
  }, [notify, saveHistory, setGroups])

  const downloadSelection = useCallback(async (selectionIds?: string[]) => {
    const selectedSet = selectionIds ? new Set(selectionIds) : null
    const selected = nodesRef.current.filter((node) => selectedSet ? selectedSet.has(node.id) : node.selected)
    if (!selected.length) return notify('请先选择要下载的节点')
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    for (const node of selected) {
      const safeName = node.data.title.replace(/[\\/:*?"<>|]/g, '_')
      if (node.data.nodeType === 'image') {
        const fallbackUrl = node.data.mediaVariant === 'ip' ? '/node-canvas-prototype/assets/virtual-ip-portrait.jpg' : node.data.mediaVariant === 'anime' ? '/node-canvas-prototype/assets/generated-anime.png' : node.data.mediaVariant === 'poster' ? '/node-canvas-prototype/assets/text-poster.png' : '/node-canvas-prototype/assets/asset-dog.png'
        const url = node.data.media?.url ?? node.data.imageOperation?.editorComposition?.renderedDataUrl ?? fallbackUrl
        const renderedMime = url.match(/^data:([^;,]+)/)?.[1]
        const media = node.data.media ?? { url, mimeType: renderedMime }
        const response = await fetch(url)
        zip.file(`${safeName}.${mediaFileExtension(media, 'image')}`, await response.arrayBuffer())
      } else if (node.data.nodeType === 'text') {
        zip.file(`${safeName}.txt`, node.data.content ?? '')
      } else if (node.data.media?.url) {
        const response = await fetch(node.data.media.url)
        const extension = mediaFileExtension(node.data.media, node.data.nodeType)
        zip.file(`${safeName}.${extension}`, await response.arrayBuffer())
      } else {
        zip.file(`${safeName}.json`, JSON.stringify({ type: node.data.nodeType, title: node.data.title, content: node.data.content, duration: node.data.duration, mock: true }, null, 2))
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = `画布批量下载-${new Date().toISOString().slice(0, 10)}.zip`
    anchor.click()
    URL.revokeObjectURL(href)
    notify(`已打包 ${selected.length} 个节点`)
  }, [notify])

  const finishMarquee = useCallback((state: MarqueeState) => {
    const start = screenToFlowPosition({ x: Math.min(state.startX, state.currentX), y: Math.min(state.startY, state.currentY) })
    const end = screenToFlowPosition({ x: Math.max(state.startX, state.currentX), y: Math.max(state.startY, state.currentY) })
    const rect = { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y }
    const hitIds = selectionIntersections(rect, nodesRef.current)
    const hitEdgeIds = edgeSelectionIntersections(rect, edgesRef.current, nodesRef.current)
    setNodes((current) => {
      const selectedIds = current.filter((node) => node.selected).map((node) => node.id)
      const nextSelection = mergeMarqueeSelection(hitIds, selectedIds, state.additive)
      return current.map((node) => ({ ...node, selected: nextSelection.has(node.id) }))
    })
    setEdges((current) => {
      const selectedIds = current.filter((edge) => edge.selected).map((edge) => edge.id)
      const nextSelection = mergeMarqueeSelection(hitEdgeIds, selectedIds, state.additive)
      return current.map((edge) => ({ ...edge, selected: nextSelection.has(edge.id) }))
    })
  }, [screenToFlowPosition, setEdges, setNodes])

  const openQuickAdd = useCallback((clientX: number, clientY: number) => {
    const flowPosition = screenToFlowPosition({ x: clientX, y: clientY })
    setDrawer(null)
    setNodes((current) => current.map((node) => ({ ...node, selected: false })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
    setQuickAdd({
      x: Math.min(Math.max(clientX, 68), window.innerWidth - 278),
      y: Math.min(Math.max(clientY, 74), Math.max(74, window.innerHeight - 520)),
      flowPosition,
    })
  }, [screenToFlowPosition, setEdges, setNodes])

  const openCanvasContextMenu = useCallback((clientX: number, clientY: number) => {
    const flowPosition = screenToFlowPosition({ x: clientX, y: clientY })
    setDrawer(null)
    setQuickAdd(null)
    setContinuation(null)
    setContextAdd(null)
    setCanvasContextMenu({ x: clientX, y: clientY, flowPosition })
  }, [screenToFlowPosition])

  const beginPlaylistSelection = useCallback((playlistId: string) => {
    setInteractionMode({ kind: 'playlist-clips', playlistId })
    setPlaylistSelection({ kind: 'playlist', playlistId })
    setDrawer(null)
    setQuickAdd(null)
    setNodes((current) => current.map((node) => ({ ...node, selected: false })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
  }, [setEdges, setNodes])

  const appendPlaylistIntoPlaylist = useCallback((targetPlaylistId: string, sourcePlaylistId: string) => {
    const target = playlistsRef.current.find((playlist) => playlist.id === targetPlaylistId)
    const source = playlistsRef.current.find((playlist) => playlist.id === sourcePlaylistId)
    if (!target || !source || target.id === source.id || !source.clips.length) return
    const appended = appendPlaylistClips(target, source)
    if (appended === target) return
    saveHistory()
    setPlaylists((current) => current.map((playlist) => playlist.id === target.id ? appendPlaylistClips(playlist, source) : playlist))
    setPlaylistSelection({ kind: 'playlist', playlistId: target.id })
    notify(`已追加 ${source.clips.length} 个片段，可继续选择`)
  }, [notify, saveHistory, setPlaylists])

  const selectPlaylistFrame = useCallback((playlist: CanvasPlaylist, ensureVisible = true, clipId?: string) => {
    setPlaylistSelection(clipId
      ? { kind: 'clip', playlistId: playlist.id, clipId }
      : { kind: 'playlist', playlistId: playlist.id })
    setNodes((current) => current.map((node) => ({ ...node, selected: false })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
    if (!ensureVisible) return
    const frameHeight = clipId ? playlistExpandedHeight(playlist) : PLAYLIST_EMPTY_HEIGHT
    const top = flowToScreenPosition(playlist.position).y
    const bottom = flowToScreenPosition({ x: playlist.position.x, y: playlist.position.y + frameHeight }).y
    if (top >= 72 && bottom <= window.innerHeight - 20 && zoom >= 0.82) return
    const fittedZoom = Math.max(0.45, Math.min(Math.max(zoom, 0.82), (window.innerHeight - 144) / frameHeight))
    window.setTimeout(() => setCenter(playlist.position.x + playlistWidth(playlist) / 2, playlist.position.y + frameHeight / 2, { zoom: fittedZoom, duration: 260 }), 20)
  }, [flowToScreenPosition, setCenter, setEdges, setNodes, zoom])

  const locatePlaylist = useCallback((playlistId: string) => {
    const playlist = playlistsRef.current.find((item) => item.id === playlistId)
    if (!playlist) return notify('对应播放列表不在当前画布')
    selectPlaylistFrame(playlist)
    notify(`已定位到${playlist.name}`)
  }, [notify, selectPlaylistFrame])

  const renamePlaylist = useCallback((playlistId: string, name: string) => {
    const next = name.trim()
    if (!next) return
    saveHistory()
    setPlaylists((current) => current.map((playlist) => playlist.id === playlistId ? { ...playlist, name: next } : playlist))
  }, [saveHistory, setPlaylists])

  const duplicatePlaylist = useCallback((playlistId: string) => {
    const source = playlistsRef.current.find((item) => item.id === playlistId)
    if (!source) return notify('对应播放列表不在当前画布')
    const timestamp = Date.now()
    const clips = source.clips.map((clip, index) => ({ ...clip, id: `${clip.id}-copy-${timestamp}-${index}` }))
    const sourceActiveIndex = source.clips.findIndex((clip) => clip.id === source.activeClipId)
    const playlist: CanvasPlaylist = {
      ...source,
      id: `playlist-copy-${timestamp}`,
      name: `${source.name} 副本`,
      position: { x: source.position.x + 48, y: source.position.y + 48 },
      clips,
      activeClipId: clips[sourceActiveIndex >= 0 ? sourceActiveIndex : 0]?.id,
      playheadTime: undefined,
    }
    saveHistory()
    setPlaylists((current) => [...current, playlist])
    setPlaylistSelection({ kind: 'playlist', playlistId: playlist.id })
    notify(`已复制${source.name}`)
  }, [notify, saveHistory, setPlaylists])

  const deletePlaylist = useCallback((playlistId: string) => {
    const playlist = playlistsRef.current.find((item) => item.id === playlistId)
    if (!playlist) return notify('对应播放列表不在当前画布')
    saveHistory()
    setPlaylists((current) => current.filter((item) => item.id !== playlistId))
    setPlaylistSelection((current) => current?.playlistId === playlistId ? null : current)
    notify(`已删除${playlist.name}`)
  }, [notify, saveHistory, setPlaylists])

  const openImageEditor = useCallback((nodeId: string) => {
    const editorNode = nodesRef.current.find((node) => node.id === nodeId)
    const operation = editorNode?.data.imageOperation?.operation
    if (editorNode?.data.nodeType !== 'image' || (operation !== 'image-editor' && operation !== 'image-compose')) {
      notify('未找到可打开的图片编辑器节点')
      return
    }
    setDrawer(null)
    setQuickAdd(null)
    setContinuation(null)
    setContextAdd(null)
    setImageEditor({ canvasId: activeCanvasId, editorNodeId: nodeId, openedAt: Date.now() })
  }, [activeCanvasId, notify])

  const addAuxiliaryTool = useCallback((tool: '播放列表' | '图片编辑器', positionOverride?: { x: number; y: number }, sourceNodeId?: string) => {
    const source = nodesRef.current.find((node) => node.id === sourceNodeId)
    if (tool === '图片编辑器') {
      const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      const position = positionOverride
        ?? (source?.data.nodeType === 'image' ? nextImagePosition(source) : { x: center.x - 110, y: center.y - 110 })
      const editorNode = buildImageEditorNode(`image-editor-${Date.now()}`, nodeCounter.current++, position)
      const edge = source?.data.nodeType === 'image'
        ? {
            id: `edge-${source.id}-${editorNode.id}`,
            source: source.id,
            sourceHandle: 'output',
            target: editorNode.id,
            targetHandle: 'input',
            type: 'canvas' as const,
            data: { relationType: 'generation-input' as const, inputRole: 'default' as const },
          }
        : undefined
      saveHistory()
      updateCanvas(activeCanvasId, (canvas) => {
        const nextEdges = [...canvas.edges.map((item) => ({ ...item, selected: false })), ...(edge ? [edge] : [])]
        return {
          ...canvas,
          edges: nextEdges,
          nodes: syncTargetReferences([...canvas.nodes.map((node) => ({ ...node, selected: false })), editorNode], nextEdges),
        }
      })
      setDrawer(null)
      setQuickAdd(null)
      setContinuation(null)
      setContextAdd(null)
      notify(source?.data.nodeType === 'image' ? '图片编辑器已加入画布，并已关联上游图片' : '图片编辑器已加入画布')
      return
    }
    saveHistory()
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    const startsWithClip = isPlayablePlaylistVideo(source)
    const basePosition = { x: center.x - PLAYLIST_WIDTH / 2, y: center.y - (startsWithClip ? PLAYLIST_FILLED_HEIGHT / 2 : PLAYLIST_EMPTY_HEIGHT / 2) }
    let playlist: CanvasPlaylist = {
      id: `playlist-${Date.now()}`,
      name: `播放列表 ${playlistsRef.current.length + 1}`,
      position: positionOverride ?? findAvailablePlaylistPosition(basePosition, playlistsRef.current),
      clips: [],
    }
    if (startsWithClip) playlist = addPlaylistClip(playlist, source.id)
    setPlaylists((current) => [...current, playlist])
    setDrawer(null)
    setQuickAdd(null)
    setContinuation(null)
    setPlaylistSelection(startsWithClip && playlist.activeClipId
      ? { kind: 'clip', playlistId: playlist.id, clipId: playlist.activeClipId }
      : { kind: 'playlist', playlistId: playlist.id })
    notify(startsWithClip ? `已用${source.data.title}创建播放列表` : '播放列表已加入画布，点击 + 添加视频')
  }, [activeCanvasId, nextImagePosition, notify, saveHistory, screenToFlowPosition, setPlaylists, updateCanvas])

  const saveImageEditor = useCallback((payload: ImageEditorCommitPayload): ImageEditorCommitResult => {
    if (!imageEditor) throw new Error('图片编辑器已关闭，无法保存')
    const canvasId = imageEditor.canvasId
    const currentCanvas = canvasesRef.current.find((canvas) => canvas.id === canvasId)
    if (!currentCanvas) throw new Error('图片编辑器所属画布不存在')

    const createdAt = Date.now()
    const existingOutput = currentCanvas.nodes.find((node) => (
      node.id === imageEditor.editorNodeId
      && node.data.nodeType === 'image'
      && (node.data.imageOperation?.operation === 'image-editor' || node.data.imageOperation?.operation === 'image-compose')
    ))
    if (!existingOutput) throw new Error('图片编辑器节点已不存在')
    const isUpdating = Boolean(existingOutput.data.imageOperation?.editorComposition)
    const outputNodeId = existingOutput.id
    const composition = structuredClone(payload.composition)
    const media = structuredClone(payload.media)
    const validSourceNodeIds = Array.from(new Set(payload.sourceNodeIds))
      .filter((nodeId) => nodeId !== outputNodeId && currentCanvas.nodes.some((node) => node.id === nodeId))
    composition.sourceNodeIds = validSourceNodeIds
    const operation: Extract<ImageOperation, 'image-editor' | 'image-compose'> = 'image-editor'
    const aspectRatio = composition.aspectRatio === 'custom'
      ? `${composition.width}:${composition.height}`
      : composition.aspectRatio
    const imageOperation: ImageOperationResult = {
      operation,
      aspectRatio,
      prompt: composition.prompt?.trim() || undefined,
      editorComposition: composition,
    }
    const baseNode = existingOutput
    const outputNode: CanvasFlowNode = {
      ...baseNode,
      type: 'image',
      selected: true,
      style: existingOutput.style ?? { width: 360 },
      data: {
        ...baseNode.data,
        nodeType: 'image',
        title: existingOutput.data.title || '图片编辑器',
        content: composition.prompt?.trim() || existingOutput.data.content?.trim() || '图片编辑结果',
        sourceKind: 'generated',
        status: 'success',
        progress: 100,
        media,
        mediaVariant: existingOutput.data.mediaVariant,
        favorite: existingOutput.data.favorite ?? false,
        starterReplaceable: false,
        imageOperation,
        references: [],
      },
    }
    const task: GenerationTask = {
      id: `task-image-editor-${createdAt}-${outputNodeId}`,
      canvasId,
      nodeId: outputNodeId,
      nodeTitle: outputNode.data.title,
      nodeType: 'image',
      status: 'success',
      progress: 100,
      effectivePrompt: composition.prompt?.trim() || operationCopy[operation],
      inputReferenceIds: validSourceNodeIds,
      imageOperation: structuredClone(imageOperation),
      outputNodeIds: [outputNodeId],
      outputMedia: structuredClone(media),
      modelLabel: operationCopy[operation],
      cost: 0,
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    }

    const applyImageEditorCommit = (canvas: CanvasDocument): CanvasDocument => {
      const nextEdges = canvas.edges.map((edge) => ({ ...edge, selected: false }))
      const nextNodes = canvas.nodes.map((node) => node.id === outputNodeId ? outputNode : { ...node, selected: false })
      return {
        ...canvas,
        nodes: syncTargetReferences(nextNodes, nextEdges),
        edges: nextEdges,
        tasks: [task, ...canvas.tasks.filter((existingTask) => existingTask.nodeId !== outputNodeId)],
      }
    }

    saveHistory(canvasId)
    updateCanvas(canvasId, applyImageEditorCommit)
    notify(isUpdating ? '图片编辑结果已更新' : '图片编辑结果已保存到编辑器节点')
    return { outputNodeId }
  }, [imageEditor, notify, saveHistory, updateCanvas])

  const createPlaylistFromSelection = useCallback((videoNodes: CanvasFlowNode[]) => {
    if (videoNodes.length < 2 || !videoNodes.every(isPlayablePlaylistVideo)) return notify('请至少选择两个有效视频节点')
    const bounds = calculateGroupBounds(videoNodes, 0)
    if (!bounds) return
    let playlist: CanvasPlaylist = {
      id: `playlist-${Date.now()}`,
      name: `播放列表 ${playlistsRef.current.length + 1}`,
      position: { x: bounds.x + bounds.width / 2 - PLAYLIST_WIDTH / 2, y: bounds.y + bounds.height + 72 },
      clips: [],
    }
    for (const video of videoNodes) playlist = addPlaylistClip(playlist, video.id)
    saveHistory()
    updateCanvas(activeCanvasId, (canvas) => ({
      ...canvas,
      nodes: canvas.nodes.map((node) => ({ ...node, selected: false })),
      edges: canvas.edges.map((edge) => ({ ...edge, selected: false })),
      playlists: [...(canvas.playlists ?? []), playlist],
    }))
    setPlaylistSelection(playlist.activeClipId
      ? { kind: 'clip', playlistId: playlist.id, clipId: playlist.activeClipId }
      : { kind: 'playlist', playlistId: playlist.id })
    setDrawer(null)
    setQuickAdd(null)
    setContinuation(null)
    window.setTimeout(() => setCenter(playlist.position.x + playlistWidth(playlist) / 2, playlist.position.y + PLAYLIST_FILLED_HEIGHT / 2, { zoom: 0.82, duration: 260 }), 20)
    notify(`已用 ${videoNodes.length} 个视频创建播放列表`)
  }, [activeCanvasId, notify, saveHistory, setCenter, updateCanvas])

  const exportPlaylistToCanvas = useCallback((playlistId: string) => {
    const playlist = playlistsRef.current.find((item) => item.id === playlistId)
    const activeClip = playlist?.clips.find((clip) => clip.id === playlist.activeClipId) ?? playlist?.clips[0]
    const source = nodesRef.current.find((node) => node.id === activeClip?.nodeId)
    if (!playlist || !activeClip || !isPlayablePlaylistVideo(source)) return notify('播放列表中暂无可导出视频')
    const composition = buildPlaylistComposition(playlist, nodesRef.current)
    const duration = composition.totalDuration
    saveHistory()
    const id = `video-playlist-${Date.now()}`
    const exported = buildCanvasNode(id, 'video', 'asset', nodeCounter.current++, { x: playlist.position.x + playlistWidth(playlist) + 72, y: playlist.position.y })
    exported.data = {
      ...structuredClone(source.data),
      title: `${playlist.name} · 组合结果`,
      sourceKind: 'generated',
      status: 'success',
      content: `已保存 ${composition.clips.length} 个片段的顺序与切点（本地 Mock）`,
      duration,
      media: { ...structuredClone(source.data.media!), duration },
      videoOperation: undefined,
      playlistComposition: composition,
    }
    updateCanvas(activeCanvasId, (canvas) => ({
      ...canvas,
      nodes: [...canvas.nodes.map((node) => ({ ...node, selected: false })), exported],
      edges: canvas.edges.map((edge) => ({ ...edge, selected: false })),
    }))
    setPlaylistSelection(null)
    window.setTimeout(() => setCenter(exported.position.x + 180, exported.position.y + 210, { zoom: 0.82, duration: 260 }), 20)
    notify('播放列表组合已作为 Mock 结果导出')
  }, [activeCanvasId, notify, saveHistory, setCenter, updateCanvas])

  const clearPins = useCallback((color?: PinColor) => {
    setNodes((current) => current.map((node) => !color || node.data.pinColor === color ? { ...node, data: { ...node.data, pinColor: undefined } } : node))
    const labels: Record<PinColor, string> = { red: '红色', orange: '橙色', yellow: '黄色', green: '绿色', cyan: '青色', blue: '蓝色', purple: '紫色' }
    notify(color ? `已清空${labels[color]} Pin` : '已清空全部 Pin')
  }, [notify, setNodes])

  const createCanvas = useCallback(() => {
    const number = canvasCounter.current++
    const id = `canvas-${Date.now()}`
    const canvas: CanvasDocument = { id, name: `画布 ${number}`, nodes: [], edges: [], tasks: [], groups: [], playlists: [], viewport: { ...DEFAULT_VIEWPORT } }
    histories.current[id] = []
    futures.current[id] = []
    setCanvases((current) => [...current, canvas])
    setActiveCanvasId(id)
    setCanvasMenuOpen(false)
    setCanvasActionsId(null)
    setDrawer(null)
    setQuickAdd(null)
    setContinuation(null)
    setContextAdd(null)
    setInteractionMode(null)
    setAlignmentGuides([])
    setZoom(DEFAULT_VIEWPORT.zoom)
    window.setTimeout(() => setViewport(DEFAULT_VIEWPORT, { duration: 180 }), 20)
    notify(`${canvas.name}已创建`)
  }, [notify, setViewport])

  const switchCanvas = useCallback((canvasId: string) => {
    const target = canvasesRef.current.find((canvas) => canvas.id === canvasId)
    if (!target) return
    setActiveCanvasId(canvasId)
    setCanvasMenuOpen(false)
    setCanvasActionsId(null)
    setDrawer(null)
    setQuickAdd(null)
    setContinuation(null)
    setContextAdd(null)
    setInteractionMode(null)
    setAlignmentGuides([])
    setZoom(target.viewport.zoom)
    window.setTimeout(() => setViewport(target.viewport, { duration: 180 }), 20)
  }, [setViewport])

  const startCanvasRename = useCallback((canvas: CanvasDocument) => {
    setRenamingCanvasId(canvas.id)
    setCanvasNameDraft(canvas.name)
  }, [])

  const finishCanvasRename = useCallback(() => {
    if (!renamingCanvasId) return
    const name = canvasNameDraft.trim()
    if (name) updateCanvas(renamingCanvasId, (canvas) => ({ ...canvas, name }))
    setRenamingCanvasId(null)
    setCanvasNameDraft('')
  }, [canvasNameDraft, renamingCanvasId, updateCanvas])

  const duplicateCanvas = useCallback((canvasId: string) => {
    const source = canvasesRef.current.find((canvas) => canvas.id === canvasId)
    if (!source) return
    const id = `canvas-${Date.now()}`
    const canvas = structuredClone(source)
    canvas.id = id
    canvas.name = `${source.name} 副本`
    canvas.nodes = canvas.nodes.map((node) => ({ ...node, selected: false }))
    canvas.edges = canvas.edges.map((edge) => ({ ...edge, selected: false }))
    canvas.tasks = canvas.tasks.map((task) => ({ ...task, canvasId: id }))
    histories.current[id] = []
    futures.current[id] = []
    setCanvases((current) => [...current, canvas])
    setActiveCanvasId(id)
    setCanvasMenuOpen(false)
    setCanvasActionsId(null)
    setDrawer(null)
    setZoom(canvas.viewport.zoom)
    window.setTimeout(() => setViewport(canvas.viewport, { duration: 180 }), 20)
    notify(`已复制为${canvas.name}`)
  }, [notify, setViewport])

  const deleteCanvas = useCallback((canvasId: string) => {
    const current = canvasesRef.current
    const target = current.find((canvas) => canvas.id === canvasId)
    if (!target) return
    if (current.length === 1) return notify('至少保留一张画布')
    const remaining = current.filter((canvas) => canvas.id !== canvasId)
    delete histories.current[canvasId]
    delete futures.current[canvasId]
    setCanvases(remaining)
    setCanvasActionsId(null)
    setDeleteCanvasId(null)
    if (activeCanvasIdRef.current === canvasId) {
      const next = remaining[0]
      setActiveCanvasId(next.id)
      setZoom(next.viewport.zoom)
      window.setTimeout(() => setViewport(next.viewport, { duration: 180 }), 20)
    }
    notify(`已删除${target.name}`)
  }, [notify, setViewport])

  const openCanvasInWindow = useCallback((canvasId: string) => {
    const target = canvasesRef.current.find((canvas) => canvas.id === canvasId)
    if (!target) return
    const token = `${canvasId}-${Date.now()}`
    window.localStorage.setItem(`${CANVAS_HANDOFF_PREFIX}${token}`, JSON.stringify(target))
    const url = new URL(window.location.href)
    url.searchParams.set('canvasSnapshot', token)
    window.open(url.toString(), '_blank', 'noopener,noreferrer')
    window.setTimeout(() => window.localStorage.removeItem(`${CANVAS_HANDOFF_PREFIX}${token}`), 5000)
    setCanvasActionsId(null)
    notify(`已在新窗口打开${target.name}`)
  }, [notify])

  const startFromExample = useCallback((exampleId: StarterExampleId) => {
    saveHistory()
    const example = buildStarterExample(exampleId, String(Date.now()))
    const nextNodes = syncTargetReferences(example.nodes, example.edges)
    updateCanvas(activeCanvasId, (canvas) => ({ ...canvas, nodes: nextNodes, edges: example.edges, tasks: [], groups: [], playlists: [] }))
    setDrawer(null)
    setQuickAdd(null)
    setContinuation(null)
    setContextAdd(null)
    window.setTimeout(() => fitView({ nodes: nextNodes.map((node) => ({ id: node.id })), padding: 0.2, minZoom: 0.42, maxZoom: 0.86, duration: 320 }), 30)
    const label = starterExamples.find((exampleMeta) => exampleMeta.id === exampleId)?.label ?? '示例'
    notify(`已打开${label}示例`)
  }, [activeCanvasId, fitView, notify, saveHistory, updateCanvas])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (imageEditor) return
      if (areCanvasShortcutsIsolated(document)) return
      const target = event.target as HTMLElement
      const editing = isCanvasDeleteShortcutTargetEditing(target)
      const interactive = isCanvasShortcutTargetInteractive(target)
      const isDeleteShortcut = event.key === 'Delete' || event.key === 'Backspace'
      const deletePlaylistSelection = () => {
        const selectedPlaylist = playlistsRef.current.find((playlist) => playlist.id === playlistSelection?.playlistId)
        if (!selectedPlaylist || !playlistSelection) return false
        event.preventDefault()
        saveHistory()
        if (playlistSelection.kind === 'clip') {
          setPlaylists((current) => current.map((playlist) => playlist.id === selectedPlaylist.id ? removePlaylistClip(playlist, playlistSelection.clipId) : playlist))
          setPlaylistSelection({ kind: 'playlist', playlistId: selectedPlaylist.id })
          notify('已删除选中片段')
        } else {
          setPlaylists((current) => current.filter((playlist) => playlist.id !== selectedPlaylist.id))
          setPlaylistSelection(null)
          if (interactionMode?.kind === 'playlist-clips' && interactionMode.playlistId === selectedPlaylist.id) setInteractionMode(null)
          notify('已删除播放列表')
        }
        return true
      }
      if (event.code === 'Space' && !interactive) {
        event.preventDefault()
        spacePressedRef.current = true
      }
      if (event.key === 'Escape') {
        marqueeRef.current = null
        setMarquee(null)
        spacePanRef.current = null
        setSpacePanning(false)
        if (interactionMode) { setInteractionMode(null); return }
        setCanvasMenuOpen(false)
        setDrawer(null)
        setQuickAdd(null)
        setCanvasContextMenu(null)
        setContinuation(null)
        setContextAdd(null)
        setAlignmentGuides([])
        if (!editing) {
          setNodes((current) => current.map((node) => ({ ...node, selected: false })))
          setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
        }
        return
      }
      if (isPlaylistDeleteShortcutTarget(target, event.key) && deletePlaylistSelection()) return
      if (interactive && !isDeleteShortcut) return
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'v') {
        setCanvasTool('move')
        setCanvasToolOpen(false)
        notify('已切换为移动工具')
        return
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'h') {
        setCanvasTool('hand')
        setCanvasToolOpen(false)
        notify('已切换为抓手工具')
        return
      }
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelection() }
      if (modifier && event.key.toLowerCase() === 'z' && event.shiftKey) { event.preventDefault(); redo() }
      else if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); undo() }
      if (isDeleteShortcut) {
        if (editing) return
        if (deletePlaylistSelection()) return
        const selectedNodeIds = nodesRef.current.filter((node) => node.selected).map((node) => node.id)
        const selectedEdgeIds = edgesRef.current.filter((edge) => edge.selected).map((edge) => edge.id)
        if (selectedNodeIds.length || selectedEdgeIds.length) {
          event.preventDefault()
          deleteSelection(selectedNodeIds, selectedEdgeIds)
        }
      }
      if (event.key.toLowerCase() === 'f' && !modifier) { event.preventDefault(); fitView({ padding: 0.16, duration: 280 }) }
    }
    const onKeyUp = (event: KeyboardEvent) => { if (event.code === 'Space') spacePressedRef.current = false }
    const onWindowBlur = () => {
      spacePressedRef.current = false
      spacePanRef.current = null
      setSpacePanning(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [deleteSelection, duplicateSelection, fitView, imageEditor, interactionMode, notify, playlistSelection, redo, saveHistory, setEdges, setNodes, setPlaylists, undo])

  const selectedItemCount = nodes.filter((node) => node.selected).length + edges.filter((edge) => edge.selected).length
  const videoEditAssets = useMemo<PromptAssetReference[]>(() => nodes
    .filter((node) => node.data.nodeType === 'image' && Boolean((node.data.content ?? '').trim()))
    .map((node) => ({
      id: `canvas:${node.id}`,
      title: node.data.title,
      category: 'personal',
      nodeType: 'image',
      mediaVariant: node.data.mediaVariant ?? 'dog',
      media: node.data.media ? structuredClone(node.data.media) : undefined,
      role: 'reference',
    })), [nodes])
  const seedanceComplianceAssets = useMemo(() => nodes.filter((node) => node.data.seedanceCompliance === 'approved'), [nodes])

  const actions = useMemo(() => ({
    updateNode,
    renameNode,
    runGeneration: (nodeId: string) => startTask(nodeId),
    retryGeneration,
    deleteEdge,
    createImageDerivative,
    prepareImageEditor,
    completeImageEditor,
    cancelPendingImageEditor,
    prepareImageUpscale,
    completeImageUpscale,
    regenerateImage,
    prepareVideoOperation,
    cancelPendingVideoOperation,
    completeVideoOperation,
    createLipSyncDerivative,
    completeVideoEdit,
    createAudioTrimDerivative,
    uploadNodeMedia,
    openImageEditor,
    openContinuation,
    openContextAdd,
    beginReferenceSelection,
    changeVideoGenerationMode,
    beginMarkerSelection,
    removeReference,
    hoverReference: setHoveredReferenceNodeId,
    addPromptMarker,
    updatePromptMarker,
    markersForSource,
    hoveredPromptMarkerId,
    hoverPromptMarker: setHoveredPromptMarkerId,
    interactionMode,
    isInteractionCandidate,
    selectedItemCount,
    isConnectionTargetCandidate,
    exitInteractionMode,
    videoEditAssets,
    seedanceComplianceAssets,
    notify,
  }), [addPromptMarker, beginMarkerSelection, beginReferenceSelection, cancelPendingImageEditor, cancelPendingVideoOperation, changeVideoGenerationMode, completeImageEditor, completeImageUpscale, completeVideoEdit, completeVideoOperation, createAudioTrimDerivative, createImageDerivative, createLipSyncDerivative, deleteEdge, exitInteractionMode, hoveredPromptMarkerId, interactionMode, isConnectionTargetCandidate, isInteractionCandidate, markersForSource, notify, openContextAdd, openContinuation, openImageEditor, prepareImageEditor, prepareImageUpscale, prepareVideoOperation, regenerateImage, removeReference, renameNode, retryGeneration, seedanceComplianceAssets, selectedItemCount, startTask, updateNode, updatePromptMarker, uploadNodeMedia, videoEditAssets])

  const activeTasks = tasks.filter((task) => task.status === 'queued' || task.status === 'running').length
  const pinCounts = nodes.reduce<Record<PinColor, number>>((counts, node) => {
    if (node.data.pinColor) counts[node.data.pinColor] += 1
    return counts
  }, { red: 0, orange: 0, yellow: 0, green: 0, cyan: 0, blue: 0, purple: 0 })
  const selectedIds = useMemo(() => new Set(nodes.filter((node) => node.selected).map((node) => node.id)), [nodes])
  const selectedNodes = useMemo(() => nodes.filter((node) => node.selected), [nodes])
  const canCreatePlaylistFromSelection = selectedNodes.length >= 2 && selectedNodes.every(isPlayablePlaylistVideo)
  const selectedComplianceCount = useMemo(() => selectedNodes.filter(isSeedanceComplianceEligible).length, [selectedNodes])
  const selectedGroup = useMemo(() => groups.find((group) => group.nodeIds.length === selectedNodes.length && group.nodeIds.every((id) => selectedIds.has(id))), [groups, selectedIds, selectedNodes.length])
  const selectionBounds = useMemo(() => selectedGroup?.bounds ?? calculateGroupBounds(selectedNodes, 12), [selectedGroup, selectedNodes])
  const selectionToolbarPosition = selectionBounds ? flowToScreenPosition({ x: selectionBounds.x + selectionBounds.width / 2, y: selectionBounds.y }) : null
  const renderedEdges = useMemo(() => edges.map((edge) => ({
    ...edge,
    data: {
      ...edge.data,
      relationType: edge.data?.relationType ?? 'generation-input',
      highlighted: selectedIds.has(edge.source) || selectedIds.has(edge.target) || hoveredReferenceNodeId === edge.source,
      hovered: hoveredEdgeId === edge.id,
    },
  })), [edges, hoveredEdgeId, hoveredReferenceNodeId, selectedIds])
  const renderedNodes = useMemo(() => nodes.map((node) => playlistDropPreview?.nodeId === node.id
    ? { ...node, className: `${node.className ?? ''} is-playlist-drop-source`.trim() }
    : node), [nodes, playlistDropPreview?.nodeId])
  const continuationSource = continuation ? nodes.find((node) => node.id === continuation.sourceNodeId) : undefined
  const contextAddTarget = contextAdd ? nodes.find((node) => node.id === contextAdd.targetNodeId) : undefined

  return (
    <CanvasActionContext.Provider value={actions}>
      <main className="prototype-shell">
        <header className="canvas-topbar">
          <div className="canvas-identity">
            <div className="brand-lockup" aria-label="节点式画布"><span>节点</span><span>灵创</span></div>
            <button
              ref={canvasMenuButtonRef}
              type="button"
              className="canvas-switcher-trigger"
              onClick={() => setCanvasMenuOpen((current) => !current)}
              aria-label="切换或新建画布"
              aria-haspopup="menu"
              aria-expanded={canvasMenuOpen}
            >
              <span>产品宣传片</span><i>/</i><strong>{activeCanvas.name}</strong><ChevronDown size={14} />
            </button>
          </div>
          <div className="canvas-status"><button type="button" className="credit-pill"><span className="chestnut-dot" />生产栗 <strong>681</strong></button><div className="share-entry"><button type="button" className="share-button ui-tooltip-control share-tooltip" data-tooltip="发布与分享" onClick={() => setShareMenuOpen((current) => !current)}><Share2 size={16} />分享</button>{shareMenuOpen && <section className="share-menu" role="menu" aria-label="发布与分享"><strong>发布与分享</strong><button type="button" role="menuitem" onClick={openShareLink}><span><Link2 size={18} /></span><p><b>分享链接</b><small>拥有此链接的人可以查看并复制你的画布。</small></p></button></section>}</div></div>
        </header>

        {shareDialogOpen && <div className="share-dialog-layer" data-canvas-overlay="true" onMouseDown={() => setShareDialogOpen(false)}><section className="share-dialog" role="dialog" aria-modal="true" aria-label="分享链接" onMouseDown={(event) => event.stopPropagation()}><header><strong>分享链接</strong><button type="button" onClick={() => setShareDialogOpen(false)} aria-label="关闭分享链接"><X size={18} /></button></header><div className="share-dialog-link"><input value={shareLink} readOnly aria-label="分享链接地址" /><button type="button" onClick={async () => { try { await copyCanvasShareLink(shareLink); notify('链接已复制') } catch { notify('复制失败，请检查浏览器权限') } }}><Copy size={15} />复制链接</button></div><div className="share-dialog-access"><strong>访问权限设置</strong><label><span>选择范围</span><select value={shareAccess} onChange={(event) => { const next = event.target.value as 'public' | 'private'; setShareAccess(next); if (next === 'private') { const token = canvasShareTokenFromHash(new URL(shareLink).hash); if (token) window.localStorage.removeItem(`node-canvas-share:${token}`) } }}><option value="public">公开访问</option><option value="private">仅自己可见</option></select></label>{shareAccess === 'private' && <small>已撤销外部访问，已有链接不可继续查看。</small>}</div></section></div>}

        <AnchoredPopover anchorRef={canvasMenuButtonRef} open={canvasMenuOpen} onClose={() => { setCanvasMenuOpen(false); setCanvasActionsId(null) }} className="canvas-switcher-menu" align="start">
          <header><strong>画布</strong><button type="button" onClick={createCanvas} aria-label="新建画布" title="新建画布"><Plus size={16} /></button></header>
          <div className="canvas-menu-list">
            {canvases.map((canvas) => (
              <div className={`canvas-menu-row ${canvas.id === activeCanvasId ? 'active' : ''}`} key={canvas.id}>
                {renamingCanvasId === canvas.id ? (
                  <label className="canvas-rename-field"><span className="sr-only">画布名称</span><input autoFocus value={canvasNameDraft} onChange={(event) => setCanvasNameDraft(event.target.value)} onBlur={finishCanvasRename} onKeyDown={(event) => { if (event.key === 'Enter') finishCanvasRename(); if (event.key === 'Escape') setRenamingCanvasId(null) }} /></label>
                ) : (
                  <button type="button" className="canvas-select-action" onClick={() => switchCanvas(canvas.id)}><span>{canvas.name}</span>{canvas.id === activeCanvasId && <Check size={15} />}</button>
                )}
                <button type="button" className="canvas-actions-trigger" onClick={() => setCanvasActionsId((current) => current === canvas.id ? null : canvas.id)} aria-label={`管理${canvas.name}`} aria-haspopup="menu" aria-expanded={canvasActionsId === canvas.id}><Ellipsis size={15} /></button>
                {canvasActionsId === canvas.id && <div className="canvas-row-menu" role="menu" aria-label={`${canvas.name}操作`}>
                  <button type="button" role="menuitem" onClick={() => openCanvasInWindow(canvas.id)}><ExternalLink size={14} />在新窗口打开</button>
                  <button type="button" role="menuitem" onClick={() => { setCanvasActionsId(null); startCanvasRename(canvas) }}><Pencil size={14} />重命名画布</button>
                  <button type="button" role="menuitem" onClick={() => duplicateCanvas(canvas.id)}><Copy size={14} />复制画布</button>
                  <button type="button" role="menuitem" className="danger" disabled={canvases.length === 1} onClick={() => { setCanvasActionsId(null); setDeleteCanvasId(canvas.id) }}><Trash2 size={14} />删除画布</button>
                </div>}
              </div>
            ))}
          </div>
        </AnchoredPopover>

        <aside className="left-rail" aria-label="画布功能">
          <nav>{drawerItems.map((item) => <div key={item.key} className={item.separated ? 'rail-separated' : ''}>
            <button type="button" className={`ui-tooltip-control tooltip-right ${drawer === item.key ? 'active' : ''}`} data-tooltip={item.label} onClick={() => { setCanvasToolOpen(false); setQuickAdd(null); setDrawer((current) => current === item.key ? null : item.key) }} aria-label={item.label} aria-pressed={drawer === item.key}>{item.icon}{item.key === 'content' && activeTasks > 0 && <em>{activeTasks}</em>}</button>
            {item.key === 'add' && <div className="canvas-tool-picker"><button type="button" className={`ui-tooltip-control tooltip-right ${canvasToolOpen ? 'active' : ''}`} data-tooltip={canvasTool === 'move' ? '移动工具 (V)' : '抓手工具 (H)'} onClick={() => { setDrawer(null); setCanvasToolOpen((open) => !open) }} aria-label={canvasTool === 'move' ? '移动工具' : '抓手工具'}>{canvasTool === 'move' ? <MousePointer2 size={19} /> : <Hand size={19} />}</button>{canvasToolOpen && <div role="menu" aria-label="画布工具"><button type="button" className={canvasTool === 'move' ? 'active' : ''} onClick={() => { setCanvasTool('move'); setCanvasToolOpen(false) }}><MousePointer2 size={16} /><span><strong>移动</strong><small>选择和移动节点</small></span><kbd>V</kbd></button><button type="button" className={canvasTool === 'hand' ? 'active' : ''} onClick={() => { setCanvasTool('hand'); setCanvasToolOpen(false) }}><Hand size={16} /><span><strong>抓手工具</strong><small>拖动画布视图</small></span><kbd>H</kbd></button></div>}</div>}
          </div>)}</nav>
        </aside>

        {pinColors.some((color) => pinCounts[color] > 0) && <details className="pin-summary"><summary aria-label="查看 Pin 标记">{pinColors.filter((color) => pinCounts[color] > 0).map((color) => <span key={color} className={`pin-summary-dot pin-${color}`}>{pinCounts[color]}</span>)}<Ellipsis size={16} /></summary><div>{pinColors.map((color) => <button type="button" key={color} onClick={() => clearPins(color)} disabled={!pinCounts[color]}><i className={`pin-${color}`} />清空 {pinCounts[color]} 个 Pin</button>)}<button type="button" onClick={() => clearPins()}>清空全部 Pin</button></div></details>}

        <DrawerPanel
          active={drawer}
          nodes={nodes}
          tasks={tasks}
          onClose={() => setDrawer(null)}
          onAddNode={addNode}
          onUploadFiles={uploadFiles}
          onAuxiliaryTool={addAuxiliaryTool}
          onAddSessionAsset={addSessionAsset}
          onLocateNode={locateNode}
          onDeleteNode={(nodeId) => deleteNodes([nodeId])}
          onRenameNode={renameNode}
          onDuplicateNode={(nodeId) => duplicateSelection([nodeId])}
          onDownloadNodes={downloadSelection}
          groups={groups}
          playlists={playlists}
          onLocateGroup={locateGroup}
          onRenameGroup={renameGroup}
          onDuplicateGroup={duplicateGroup}
          onUngroup={ungroupGroup}
          onLocatePlaylist={locatePlaylist}
          onRenamePlaylist={renamePlaylist}
          onDuplicatePlaylist={duplicatePlaylist}
          onDeletePlaylist={deletePlaylist}
          onToggleNodeFavorite={(nodeId, favorite) => updateNode(nodeId, { favorite })}
          sessionAssets={sessionAssets}
          assetFolders={assetFolders}
        />

        <section className={`canvas-stage tool-${canvasTool} ${marquee ? 'is-marquee-selecting' : ''} ${spacePanning ? 'is-space-panning' : ''} ${interactionMode ? `is-interaction-mode interaction-${interactionMode.kind}` : ''}`} aria-label="节点画布" onContextMenuCapture={(event) => {
          if (!canOpenCanvasContextMenu(event.target)) return
          event.preventDefault()
          event.stopPropagation()
          marqueeRef.current = null
          setMarquee(null)
          suppressPaneClickRef.current = false
          openCanvasContextMenu(event.clientX, event.clientY)
        }} onPointerDownCapture={(event) => {
          const onBlankPane = isBlankCanvasTarget(event.target)
          if (!onBlankPane) return
          if (event.button === 0) setPlaylistSelection(null)
          if (canvasTool === 'hand') return
          if (event.button === 0 && spacePressedRef.current) {
            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.setPointerCapture(event.pointerId)
            spacePanRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              pointerId: event.pointerId,
              viewport: getViewport(),
            }
            setSpacePanning(true)
            return
          }
          if (interactionMode || !canStartMarquee(event.button, spacePressedRef.current)) return
          if (event.button === 0) {
            const currentTap = { x: event.clientX, y: event.clientY, time: Date.now() }
            if (event.detail >= 2 || isRepeatedBlankCanvasTap(blankCanvasTapRef.current, currentTap)) {
              event.preventDefault()
              event.stopPropagation()
              blankCanvasTapRef.current = null
              marqueeRef.current = null
              setMarquee(null)
              suppressPaneClickRef.current = true
              pendingQuickAddRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
              return
            }
            blankCanvasTapRef.current = currentTap
          }
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.setPointerCapture(event.pointerId)
          suppressPaneClickRef.current = true
          setContinuation(null)
          setContextAdd(null)
          setQuickAdd(null)
          const nextMarquee = { startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY, additive: event.shiftKey, pointerId: event.pointerId }
          marqueeRef.current = nextMarquee
          setMarquee(nextMarquee)
        }} onPointerMoveCapture={(event) => {
          const pendingQuickAdd = pendingQuickAddRef.current
          if (pendingQuickAdd && event.pointerId === pendingQuickAdd.pointerId) {
            event.preventDefault()
            event.stopPropagation()
            if (Math.hypot(event.clientX - pendingQuickAdd.x, event.clientY - pendingQuickAdd.y) > 12) {
              pendingQuickAddRef.current = null
              suppressPaneClickRef.current = false
            }
            return
          }
          const currentPan = spacePanRef.current
          if (currentPan && event.pointerId === currentPan.pointerId) {
            event.preventDefault()
            event.stopPropagation()
            const viewport = {
              ...currentPan.viewport,
              x: currentPan.viewport.x + event.clientX - currentPan.startX,
              y: currentPan.viewport.y + event.clientY - currentPan.startY,
            }
            spacePanRef.current = { ...currentPan, startX: event.clientX, startY: event.clientY, viewport }
            setViewport(viewport)
            return
          }
          const currentMarquee = marqueeRef.current
          if (!currentMarquee || event.pointerId !== currentMarquee.pointerId) return
          event.preventDefault()
          event.stopPropagation()
          if (Math.hypot(event.clientX - currentMarquee.startX, event.clientY - currentMarquee.startY) > 12) blankCanvasTapRef.current = null
          const nextMarquee = { ...currentMarquee, currentX: event.clientX, currentY: event.clientY }
          marqueeRef.current = nextMarquee
          setMarquee(nextMarquee)
        }} onPointerUpCapture={(event) => {
          const pendingQuickAdd = pendingQuickAddRef.current
          if (pendingQuickAdd && event.pointerId === pendingQuickAdd.pointerId) {
            event.preventDefault()
            event.stopPropagation()
            pendingQuickAddRef.current = null
            openQuickAdd(event.clientX, event.clientY)
            window.setTimeout(() => { suppressPaneClickRef.current = false }, 0)
            return
          }
          const currentPan = spacePanRef.current
          if (currentPan && event.pointerId === currentPan.pointerId) {
            event.preventDefault()
            event.stopPropagation()
            spacePanRef.current = null
            setSpacePanning(false)
            updateCanvas(activeCanvasId, (canvas) => ({ ...canvas, viewport: currentPan.viewport }))
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
            return
          }
          const currentMarquee = marqueeRef.current
          if (!currentMarquee || event.pointerId !== currentMarquee.pointerId) return
          event.preventDefault()
          event.stopPropagation()
          const isBlankRightClick = event.button === 2
            && Math.hypot(event.clientX - currentMarquee.startX, event.clientY - currentMarquee.startY) <= 12
          if (isBlankRightClick) {
            marqueeRef.current = null
            setMarquee(null)
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
            suppressPaneClickRef.current = false
            openCanvasContextMenu(event.clientX, event.clientY)
            return
          }
          finishMarquee({ ...currentMarquee, currentX: event.clientX, currentY: event.clientY })
          marqueeRef.current = null
          setMarquee(null)
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          window.setTimeout(() => { suppressPaneClickRef.current = false }, 0)
        }} onPointerCancelCapture={(event) => {
          if (pendingQuickAddRef.current?.pointerId === event.pointerId) {
            pendingQuickAddRef.current = null
            suppressPaneClickRef.current = false
          }
          const currentPan = spacePanRef.current
          if (currentPan && event.pointerId === currentPan.pointerId) {
            spacePanRef.current = null
            setSpacePanning(false)
            return
          }
          const currentMarquee = marqueeRef.current
          if (!currentMarquee || event.pointerId !== currentMarquee.pointerId) return
          marqueeRef.current = null
          setMarquee(null)
          suppressPaneClickRef.current = false
        }} onDoubleClick={(event) => {
          if (isBlankCanvasTarget(event.target)) openQuickAdd(event.clientX, event.clientY)
        }}>
          {nodes.length === 0 && <section className="canvas-starter" data-canvas-overlay="true" aria-label="新建画布快速开始">
            <strong>选择一个起点</strong>
            <div>{starterExamples.map((example) => <button type="button" key={example.id} onClick={() => startFromExample(example.id)}><span className="starter-example-route"><i><MediaTypeIcon type={example.sourceType} size={16} /></i><ArrowRight size={13} /><i><MediaTypeIcon type={example.targetType} size={16} /></i></span><b>{example.label}</b></button>)}</div>
          </section>}
          <ReactFlow<CanvasFlowNode, CanvasFlowEdge>
            nodes={renderedNodes}
            edges={renderedEdges}
            nodeTypes={stableNodeTypes}
            edgeTypes={stableEdgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onEdgeMouseEnter={(_event, edge) => setHoveredEdgeId(edge.id)}
            onEdgeMouseLeave={(_event, edge) => setHoveredEdgeId((current) => current === edge.id ? null : current)}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onMove={(_event, viewport) => setZoom(viewport.zoom)}
            onMoveEnd={(_event, viewport) => updateCanvas(activeCanvasId, (canvas) => ({ ...canvas, viewport }))}
            onPaneClick={() => {
              if (suppressPaneClickRef.current) return
              if (interactionMode?.kind === 'playlist-clips') setInteractionMode(null)
              setPlaylistSelection(null)
              setQuickAdd(null)
              setCanvasContextMenu(null)
              setContinuation(null)
              setContextAdd(null)
              setAlignmentGuides([])
              setNodes((current) => current.map((node) => ({ ...node, selected: false })))
              setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
            }}
            fitView
            fitViewOptions={{ padding: 0.16, minZoom: 0.62, maxZoom: 0.94 }}
            minZoom={0.28}
            maxZoom={1.6}
            snapToGrid={snapEnabled}
            snapGrid={[20, 20]}
            deleteKeyCode={null}
            selectionOnDrag={canvasTool === 'move'}
            nodesDraggable={canvasTool === 'move' && !interactionMode}
            elementsSelectable={!interactionMode}
            multiSelectionKeyCode="Shift"
            panOnDrag={canvasTool === 'hand' ? [0, 1] : [1]}
            panOnScroll
            panActivationKeyCode="Space"
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: 'canvas', interactionWidth: 20 }}
            connectionLineStyle={{ stroke: 'oklch(0.66 0.07 48)', strokeWidth: 1.75 }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.1} color="oklch(0.29 0.008 50 / 0.58)" />
            <ViewportPortal>
              <div className="canvas-group-layer">
                {groups.map((group) => {
                  const members = nodes.filter((node) => group.nodeIds.includes(node.id))
                  if (!members.length) return null
                  return <CanvasGroupFrame key={group.id} group={group} bounds={group.bounds} active={selectedGroup?.id === group.id} zoom={zoom} onSelect={() => {
                    setNodes((current) => current.map((node) => ({ ...node, selected: group.nodeIds.includes(node.id) })))
                    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
                  }} onStartMove={() => saveHistory()} onTranslate={(dx, dy) => updateCanvas(activeCanvasId, (canvas) => ({
                    ...canvas,
                    nodes: translateGroupNodes(canvas.nodes, group.nodeIds, dx, dy),
                    groups: canvas.groups.map((item) => item.id === group.id ? { ...item, bounds: translateRect(item.bounds, dx, dy) } : item),
                  }))} onStartResize={() => saveHistory()} onResize={(corner, dx, dy) => {
                    const minimum = calculateGroupBounds(nodesRef.current.filter((node) => group.nodeIds.includes(node.id)), 12)
                    if (!minimum) return
                    setGroups((current) => current.map((item) => item.id === group.id ? { ...item, bounds: resizeGroupBounds(item.bounds, corner, dx, dy, minimum) } : item))
                  }} onRename={(name) => renameGroup(group.id, name)} />
                })}
              </div>
              <div className="canvas-playlist-layer">
                {playlists.map((playlist) => <PlaylistFrame
                  key={playlist.id}
                  playlist={playlist}
                  nodes={nodes}
                  zoom={zoom}
                  selected={selectedPlaylistId === playlist.id}
                  selectedClipId={playlistSelection?.kind === 'clip' && playlistSelection.playlistId === playlist.id ? playlistSelection.clipId : undefined}
                  selecting={interactionMode?.kind === 'playlist-clips' && interactionMode.playlistId === playlist.id}
                  mergeCandidate={interactionMode?.kind === 'playlist-clips' && interactionMode.playlistId !== playlist.id && playlist.clips.length > 0}
                  dropPreviewIndex={playlistDropPreview?.playlistId === playlist.id ? playlistDropPreview.insertionIndex : undefined}
                  onSelectPlaylist={(ensureVisible) => selectPlaylistFrame(playlist, ensureVisible)}
                  onSelectClip={(clipId, ensureVisible) => {
                    setPlaylists((current) => current.map((item) => item.id === playlist.id ? { ...item, activeClipId: clipId, playheadTime: undefined } : item))
                    selectPlaylistFrame(playlist, ensureVisible, clipId)
                  }}
                  onAppendPlaylist={() => interactionMode?.kind === 'playlist-clips' && appendPlaylistIntoPlaylist(interactionMode.playlistId, playlist.id)}
                  onBeginSelection={() => beginPlaylistSelection(playlist.id)}
                  onActivate={(clipId) => setPlaylists((current) => current.map((item) => item.id === playlist.id ? { ...item, activeClipId: clipId, playheadTime: undefined } : item))}
                  onLockTime={(time, clipId) => {
                    setPlaylistSelection({ kind: 'clip', playlistId: playlist.id, clipId })
                    setPlaylists((current) => current.map((item) => item.id === playlist.id ? { ...item, activeClipId: clipId, playheadTime: time } : item))
                  }}
                  onSplit={(clipId, splitTime) => {
                    const duration = nodes.find((node) => node.id === playlist.clips.find((clip) => clip.id === clipId)?.nodeId)?.data.media?.duration ?? 8
                    saveHistory()
                    setPlaylists((current) => current.map((item) => item.id === playlist.id ? splitPlaylistClipAtTime(item, clipId, splitTime, duration) : item))
                    notify(`已在 ${splitTime.toFixed(1)} 秒处切割片段`)
                  }}
                  onReorder={(clipId, insertionIndex) => {
                    const currentPlaylist = playlistsRef.current.find((item) => item.id === playlist.id)
                    if (!currentPlaylist || reorderPlaylistClip(currentPlaylist, clipId, insertionIndex) === currentPlaylist) return
                    saveHistory()
                    setPlaylists((current) => current.map((item) => item.id === playlist.id ? reorderPlaylistClip(item, clipId, insertionIndex) : item))
                    notify('已调整片段顺序')
                  }}
                  onExportToCanvas={() => exportPlaylistToCanvas(playlist.id)}
                  onStartMove={() => saveHistory()}
                  onMove={(dx, dy) => setPlaylists((current) => current.map((item) => item.id === playlist.id ? { ...item, position: { x: item.position.x + dx, y: item.position.y + dy } } : item))}
                  onStartResize={() => saveHistory()}
                  onResize={(width) => setPlaylists((current) => current.map((item) => item.id === playlist.id ? { ...item, width } : item))}
                />)}
              </div>
              {selectedNodes.length >= 2 && selectionBounds && !selectedGroup && <div className="canvas-selection-layer" aria-hidden="true">
                <div className="canvas-multi-selection-frame" style={{ left: selectionBounds.x, top: selectionBounds.y, width: selectionBounds.width, height: selectionBounds.height }} />
              </div>}
              <div className="alignment-guide-layer" aria-hidden="true">
                {alignmentGuides.map((guide, index) => guide.axis === 'x'
                  ? <i key={`${guide.axis}-${guide.position}-${index}`} className="alignment-guide guide-x" style={{ left: guide.position, top: guide.spanStart, height: guide.spanEnd - guide.spanStart }} />
                  : <i key={`${guide.axis}-${guide.position}-${index}`} className="alignment-guide guide-y" style={{ top: guide.position, left: guide.spanStart, width: guide.spanEnd - guide.spanStart }} />)}
              </div>
            </ViewportPortal>
            {showMiniMap && <MiniMap className="canvas-minimap" pannable zoomable nodeColor={(node) => ({ text: '#696969', image: '#7b675b', video: '#876452', audio: '#4d6d65' }[node.type ?? 'text'] ?? '#696969')} maskColor="rgba(5,5,5,.72)" />}
          </ReactFlow>
        </section>

        {selectedNodes.length >= 2 && selectionToolbarPosition && !interactionMode && <div className="multi-selection-toolbar nodrag nopan" style={{ left: selectionToolbarPosition.x, top: selectionToolbarPosition.y }} role="toolbar" aria-label={`已选择 ${selectedNodes.length} 个节点`}>
          <button type="button" onClick={() => duplicateSelection(selectedNodes.map((node) => node.id))}><Copy size={15} />创建副本</button>
          <button type="button" onClick={() => downloadSelection(selectedNodes.map((node) => node.id))}><Download size={15} />批量下载</button>
          <button type="button" disabled={!selectedComplianceCount} title={selectedComplianceCount ? `验证 ${selectedComplianceCount} 个图片、视频或音频节点` : '当前选区无可验证媒体'} onClick={() => verifySelectionCompliance(selectedNodes.map((node) => node.id))}><ShieldCheck size={15} />批量合规验证</button>
          {canCreatePlaylistFromSelection && <button type="button" onClick={() => createPlaylistFromSelection(selectedNodes)}><Play size={15} fill="currentColor" />创建播放列表</button>}
          <button type="button" onClick={() => createOrUngroupSelection(selectedNodes.map((node) => node.id))}>{selectedGroup ? <Ungroup size={15} /> : <Group size={15} />}{selectedGroup ? '解组' : '打组'}</button>
        </div>}

        {quickAdd && <QuickAddMenu
          position={{ x: quickAdd.x, y: quickAdd.y }}
          onAddNode={(type, source = 'created') => addNode(type, source, quickAdd.flowPosition)}
          onUploadFiles={(files) => uploadFiles(files, quickAdd.flowPosition)}
          onAuxiliaryTool={(tool) => addAuxiliaryTool(tool, quickAdd.flowPosition)}
          onClose={() => setQuickAdd(null)}
          ariaLabel="画布添加"
        />}
        {canvasContextMenu && <CanvasBlankContextMenu
          position={{ x: canvasContextMenu.x, y: canvasContextMenu.y }}
          onUploadFiles={(files) => uploadFiles(files, canvasContextMenu.flowPosition)}
          onOpenAssets={() => setDrawer('assets')}
          onAddNode={(type) => addNode(type, 'created', canvasContextMenu.flowPosition)}
          onAuxiliaryTool={(tool) => addAuxiliaryTool(tool, canvasContextMenu.flowPosition)}
          onUndo={undo}
          onRedo={redo}
          onPaste={() => { void pasteTextNode(canvasContextMenu.flowPosition) }}
          onClose={() => setCanvasContextMenu(null)}
        />}
        {continuation && continuationSource && <ContinuationMenu
          position={{ x: continuation.x, y: continuation.y }}
          sourceType={continuationSource.data.nodeType}
          onAddNode={(type) => createContinuationTarget(type)}
          onAuxiliaryTool={(tool) => addAuxiliaryTool(tool, continuation.flowPosition, continuationSource.id)}
          onClose={() => setContinuation(null)}
          ariaLabel="引用该节点生成"
        />}
        {contextAdd && contextAddTarget && <ContextMenu
          position={{ x: contextAdd.x, y: contextAdd.y }}
          target={contextAddTarget}
          onAddNode={(type) => createContextSource(type)}
          onClose={() => setContextAdd(null)}
          ariaLabel="添加上下文"
        />}
        {interactionMode && <div className={`canvas-interaction-banner mode-${interactionMode.kind}`} role="status"><span><strong>{interactionMode.kind === 'reference' ? '从画布选择参考' : interactionMode.kind === 'marker' ? '焦点编辑' : '选择播放片段'}</strong><small>{interactionMode.kind === 'reference' ? interactionMode.role === 'reference' ? '点击文本、图片、视频或音频节点，可连续添加' : '点击高亮节点，将它加入当前生成参考' : interactionMode.kind === 'marker' ? '在高亮图片上点击需要聚焦的位置' : '点击一个或多个高亮视频，按 Esc 完成选择'}</small></span><button type="button" onClick={exitInteractionMode}>退出</button></div>}
        {marquee && <div className="canvas-marquee" style={{ left: Math.min(marquee.startX, marquee.currentX), top: Math.min(marquee.startY, marquee.currentY), width: Math.abs(marquee.currentX - marquee.startX), height: Math.abs(marquee.currentY - marquee.startY) }} aria-hidden="true" />}
        {imageEditor && <ImageEditorWorkspace
          key={imageEditor.openedAt}
          source={imageEditorSource}
          assets={imageEditorAssets}
          initialAssets={imageEditorInitialAssets}
          historyAssets={imageEditorHistoryAssets}
          initialComposition={imageEditorInitialComposition}
          onClose={() => {
            setImageEditor(null)
          }}
          onSave={saveImageEditor}
        />}
        {deleteCanvasId && (() => {
          const target = canvases.find((canvas) => canvas.id === deleteCanvasId)
          if (!target) return null
          return <div className="canvas-delete-backdrop" role="presentation" onMouseDown={() => setDeleteCanvasId(null)}>
            <section className="canvas-delete-dialog" role="alertdialog" aria-modal="true" aria-label="删除画布" onMouseDown={(event) => event.stopPropagation()}>
              <div className="canvas-delete-icon"><Trash2 size={18} /></div>
              <div><strong>删除「{target.name}」？</strong><p>这张画布中的节点和任务会从本次会话中移除。</p></div>
              <footer><button type="button" onClick={() => setDeleteCanvasId(null)}>取消</button><button type="button" className="danger" onClick={() => deleteCanvas(target.id)}>删除画布</button></footer>
            </section>
          </div>
        })()}

        <div className="view-controls" role="toolbar" aria-label="画布视图控制">
          <button type="button" className="ui-tooltip-control" data-tooltip="整理画布" onClick={organizeCanvas} aria-label="整理画布"><AlignHorizontalSpaceAround size={17} /></button>
          <button type="button" className={`ui-tooltip-control ${showMiniMap ? 'active' : ''}`} data-tooltip="小地图" onClick={() => setShowMiniMap((value) => !value)} aria-label="切换小地图"><MapIcon size={17} /></button>
          <button type="button" className={`ui-tooltip-control ${snapEnabled ? 'active' : ''}`} data-tooltip="网格吸附" onClick={() => setSnapEnabled((value) => !value)} aria-label="切换网格吸附"><Grid3X3 size={17} /></button>
          <button type="button" className="ui-tooltip-control" data-tooltip="适应画布" onClick={() => fitView({ padding: 0.16, duration: 280 })} aria-label="适应画布"><Box size={17} /></button>
          <span className="control-divider" />
          <button type="button" className="ui-tooltip-control" data-tooltip="缩小" onClick={() => zoomOut({ duration: 140 })} aria-label="缩小"><Minus size={15} /></button>
          <span className="zoom-value">{Math.round(zoom * 100)}%</span>
          <button type="button" className="ui-tooltip-control" data-tooltip="放大" onClick={() => zoomIn({ duration: 140 })} aria-label="放大"><Plus size={15} /></button>
        </div>

        <div className="prototype-note"><Sparkles size={14} /><span>V2.0.1 交互原型 · Mock 数据</span></div>
        {toast && <div className={`toast ${toast.includes('\n') ? 'has-detail' : ''}`} role="status" aria-live="polite">{toast.includes('\n') ? <><Check size={18} /><span><strong>{toast.split('\n')[0]}</strong><small>{toast.split('\n')[1]}</small></span></> : /任务已进入队列|生成中|处理中|等待执行|^正在/.test(toast) ? <ShinyText text={toast} speed={1.8} color="#393638" shineColor="#ffffff" spread={92} /> : toast}</div>}
      </main>
    </CanvasActionContext.Provider>
  )
}

export default function App() {
  const [routeHash, setRouteHash] = useState(() => window.location.hash)
  useEffect(() => {
    const syncRoute = () => setRouteHash(window.location.hash)
    window.addEventListener('hashchange', syncRoute)
    window.addEventListener('popstate', syncRoute)
    return () => {
      window.removeEventListener('hashchange', syncRoute)
      window.removeEventListener('popstate', syncRoute)
    }
  }, [])

  if (canvasShareTokenFromHash(routeHash)) {
    let result: SharedCanvasLoadResult
    try {
      result = loadCanvasShareSnapshot(window.localStorage, routeHash)
    } catch {
      result = { status: 'invalid' }
    }
    return <SharedCanvasPage result={result} />
  }
  if (shareTokenFromHash(routeHash)) {
    let result: SharedVideoLoadResult
    try {
      result = loadVideoShareSnapshot(window.localStorage, routeHash)
    } catch {
      result = { status: 'invalid' }
    }
    return <SharedVideoPage result={result} />
  }
  return <ReactFlowProvider><CanvasPrototype /></ReactFlowProvider>
}
