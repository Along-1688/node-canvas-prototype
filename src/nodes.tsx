import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Handle, NodeProps, NodeResizer, Position, useReactFlow, useUpdateNodeInternals, useViewport } from '@xyflow/react'
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowUp,
  AudioLines,
  Bold,
  Brush,
  Camera,
  CaptionsOff,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Copy,
  Crop,
  Download,
  Eraser,
  Expand,
  Film,
  FlipHorizontal2,
  FlipVertical2,
  Gauge,
  Grid3X3,
  GripVertical,
  Globe2,
  Image as ImageIcon,
  Italic,
  Languages,
  Lightbulb,
  List,
  LoaderCircle,
  Maximize2,
  Mic2,
  MonitorUp,
  MoreHorizontal,
  Music2,
  Palette,
  Pause,
  Pipette,
  Pin,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  ShieldCheck,
  ScanFace,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Star,
  SunMedium,
  Type,
  Undo2,
  Upload,
  Video,
  Volume2,
  VolumeX,
  WandSparkles,
  Waves,
  X,
  ZoomIn,
} from 'lucide-react'
import { useCanvasActions, type CanvasInteractionMode } from './canvasContext'
import { canFavoriteMediaNode, canUploadToEmptyMediaNode } from './assetEligibility'
import { AnchoredPopover } from './floating'
import { ImageEditorCompositionPreview } from './imageEditor'
import { ShinyText } from './ShinyText'
import {
  EXPAND_SOURCE_RECT,
  buildRepaintResult,
  buildGridSlices,
  expandRectRatio,
  frameForExpandRatio,
  isQuarterTurn,
  moveExpandRect,
  resizeExpandRect,
  shouldShowImageGenerationPrompt,
} from './imageOperations'
import { generationDefinitions, videoModeOptions, videoModelCapabilities } from './mockData'
import { fitMediaAspect, formatMediaResolution } from './mediaGeometry'
import {
  mediaFileExtension,
  resolveVideoGenerationParams,
  shouldShowVideoGenerationPanel,
  videoModelCapabilityFor,
  videoOperationCost,
  videoTimelineFrameUrls,
  videoTimelineTimes,
} from './videoGeneration'
import type {
  CanvasFlowNode,
  CanvasNodeData,
  AnnotationMark,
  ImageOperation,
  ImageOperationResult,
  ImageGenerationParams,
  GenerationReferenceRole,
  MediaMetadata,
  ModelParameter,
  NodeReference,
  PinColor,
  PromptAssetReference,
  RepaintMask,
  TextFormat,
  VideoGenerationMode,
  VideoGenerationParams,
  VideoEditPreviewResult,
  VideoOperation,
  VideoOperationResult,
} from './types'

const textBackgrounds = [
  { value: 'default', label: '默认', color: '#242220' },
  { value: 'paper', label: '白色', color: '#eeeae4' },
  { value: 'rose', label: '红色', color: '#713637' },
  { value: 'amber', label: '橙色', color: '#74431f' },
  { value: 'olive', label: '黄色', color: '#686027' },
  { value: 'teal', label: '绿色', color: '#285746' },
  { value: 'blue', label: '蓝色', color: '#244f68' },
  { value: 'violet', label: '紫色', color: '#58316a' },
] as const

const pinOptions: Array<{ value?: PinColor; label: string }> = [
  { label: '无' },
  { value: 'red', label: '红色' },
  { value: 'orange', label: '橙色' },
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'cyan', label: '青色' },
  { value: 'blue', label: '蓝色' },
  { value: 'purple', label: '紫色' },
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

const defaultImageGeneration: ImageGenerationParams = {
  ratio: '16:9', resolution: '2K', count: 1, styleCategory: 'all', enhancePrompt: false, webSearch: false,
  camera: { body: 'Red V-Raptor', lens: 'Arri Signature Prime', focalLength: '24mm', aperture: 'f/4' },
}

const quickReferenceAssets: PromptAssetReference[] = [
  { id: 'asset-anime-city', title: '樱花城市', category: 'personal', mediaVariant: 'anime' },
  { id: 'asset-dog-studio', title: '柴犬棚拍', category: 'personal', mediaVariant: 'dog' },
  { id: 'asset-world-cup', title: '世界杯海报', category: 'personal', mediaVariant: 'poster' },
  { id: 'asset-street-ip', title: '街头少年', category: 'community', mediaVariant: 'ip' },
]

const imageStylePresets = [
  { id: 'frame', name: '框式构图', category: 'lighting' },
  { id: 'warm-shadow', name: '国风光影', category: 'lighting' },
  { id: 'anime-clean', name: '清新日漫', category: 'anime' },
  { id: 'anime-coast', name: '新海诚光感', category: 'anime' },
  { id: 'illustration', name: '柔和插画', category: 'illustration' },
  { id: 'sticker', name: '卡通黏土', category: 'illustration' },
  { id: 'oil-light', name: '光感油画', category: 'painting' },
  { id: 'plein-air', name: '外光写生', category: 'painting' },
  { id: 'minimal', name: '极简商务', category: 'contemporary' },
  { id: 'shadow-art', name: '剪影艺术', category: 'contemporary' },
] as const

type VideoReferenceRole = Extract<GenerationReferenceRole, 'first-frame' | 'last-frame' | 'reference'>
type VideoOperationKind = Exclude<VideoOperation, 'lip-sync'>
type VideoGenerationState = VideoGenerationParams
type PendingVideoOperation = Exclude<VideoOperationResult, { operation: 'lip-sync' }>

type VideoActionExtensions = ReturnType<typeof useCanvasActions> & {
  changeVideoGenerationMode: (nodeId: string, mode: VideoGenerationMode) => void
  prepareVideoOperation: (nodeId: string, operation: VideoOperationKind) => void
  completeVideoOperation: (nodeId: string, result: VideoOperationResult) => void
  createLipSyncDerivative: (nodeId: string, result: Extract<VideoOperationResult, { operation: 'lip-sync' }>) => void
  completeVideoEdit: (nodeId: string, result: Extract<VideoOperationResult, { operation: 'edit' }>) => void
  cancelPendingVideoOperation?: (nodeId: string) => void
}

function videoGenerationFor(data: CanvasNodeData) {
  return resolveVideoGenerationParams(data)
}

function videoModeFor(data: CanvasNodeData): VideoGenerationMode {
  const model = videoModelCapabilityFor(data.modelId)
  const requested = data.modeId === 'first-frame' || data.modeId === 'first-last-frame' || data.modeId === 'reference' ? data.modeId : undefined
  return requested && model.supportedModes.includes(requested) ? requested : model.supportedModes[0]
}

function NodeHeader({ id, data, icon, draggable = false }: { id: string; data: CanvasNodeData; icon: React.ReactNode; draggable?: boolean }) {
  const { renameNode, runGeneration, updateNode } = useCanvasActions()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.title)
  const [staleMenuOpen, setStaleMenuOpen] = useState(false)
  const staleButtonRef = useRef<HTMLButtonElement>(null)
  const resolution = (data.nodeType === 'image' || data.nodeType === 'video')
    && data.media?.width
    && data.media?.height
    && (Boolean((data.content ?? '').trim()) || Boolean(data.media.url))
    ? formatMediaResolution(data.media.width, data.media.height)
    : null

  useEffect(() => setDraft(data.title), [data.title])
  useEffect(() => {
    if (data.status !== 'stale' || data.staleNoticeDismissed) setStaleMenuOpen(false)
  }, [data.staleNoticeDismissed, data.status])

  const commit = () => {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== data.title) renameNode(id, next)
    else setDraft(data.title)
  }

  return (
    <div className={`node-header ${draggable ? 'node-drag-handle' : ''}`} title={draggable ? '拖动移动音频节点' : undefined}>
      <span className="node-type-icon" aria-hidden="true">{icon}</span>
      {editing ? (
        <input
          className="node-title-input nodrag"
          aria-label="节点名称"
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') { setDraft(data.title); setEditing(false) }
          }}
        />
      ) : (
        <button type="button" className="node-title nodrag" title="双击重命名" onDoubleClick={() => setEditing(true)}>
          {data.title}
        </button>
      )}
      {resolution && <span className="node-resolution-label" title={`媒体分辨率 ${resolution}`}>{resolution}</span>}
      {data.status === 'stale' && !data.staleNoticeDismissed && <>
        <button
          ref={staleButtonRef}
          type="button"
          className="node-input-updated nodrag"
          aria-label="输入已更新"
          aria-expanded={staleMenuOpen}
          onClick={() => setStaleMenuOpen((open) => !open)}
        ><AlertCircle size={13} /><span>输入已更新</span><ChevronDown size={12} /></button>
        <AnchoredPopover anchorRef={staleButtonRef} open={staleMenuOpen} onClose={() => setStaleMenuOpen(false)} className="toolbar-menu input-updated-menu" align="end">
          <div role="menu" aria-label="输入已更新操作">
            <button type="button" role="menuitem" onClick={() => { setStaleMenuOpen(false); runGeneration(id) }}><RefreshCw size={14} />更新生成</button>
            <button type="button" role="menuitem" onClick={() => { setStaleMenuOpen(false); updateNode(id, { staleNoticeDismissed: true }) }}><X size={14} />关闭提示</button>
          </div>
        </AnchoredPopover>
      </>}
      {data.seedanceCompliance === 'checking' && <span className="node-compliance-checking" role="status"><LoaderCircle size={13} /><ShinyText text="正在验证" speed={1.6} color="#d7a25b" shineColor="#fff3df" spread={84} /></span>}
      {data.seedanceCompliance === 'approved' && <span className="node-compliance-approved nodrag" tabIndex={0} aria-label="素材已合规，可用于 Seedance 2.0 视频生产"><ShieldCheck size={15} /><span className="node-compliance-tooltip" role="tooltip">素材已合规，可用于 Seedance 2.0 视频生产</span></span>}
      {data.pinColor && <span className={`node-pin-dot pin-${data.pinColor}`} title={`${pinOptions.find((item) => item.value === data.pinColor)?.label ?? ''} Pin`} />}
      <InteractionCandidateBadge id={id} type={data.nodeType} />
      {draggable && <span className="node-drag-indicator" aria-hidden="true"><GripVertical size={15} /></span>}
    </div>
  )
}

export function SmartPort({ nodeId, id, type, position, label }: { nodeId?: string; id: 'input' | 'output'; type: 'source' | 'target'; position: Position; label: string }) {
  const { openContinuation, openContextAdd } = useCanvasActions()
  const updateNodeInternals = useUpdateNodeInternals()
  const [offset, setOffset] = useState(70)
  const side = position === Position.Left ? 'left' : 'right'
  useLayoutEffect(() => {
    if (nodeId) updateNodeInternals(nodeId)
  }, [nodeId, offset, updateNodeInternals])
  const openFromLauncher = (launcher: HTMLElement, clientX?: number, clientY?: number) => {
    const resolvedNodeId = nodeId ?? launcher.closest<HTMLElement>('.react-flow__node')?.dataset.id
    if (!resolvedNodeId) return
    const rect = launcher.getBoundingClientRect()
    const x = clientX ?? rect.left + rect.width / 2
    const y = clientY ?? rect.top + rect.height / 2
    if (type === 'source') openContinuation(resolvedNodeId, x, y)
    else openContextAdd(resolvedNodeId, x, y)
  }
  return (
    <>
      <Handle id={id} type={type} position={position} className={`port-anchor port-anchor-${side}`} aria-hidden="true" />
      <div
        className={`port-track port-track-${side}`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setOffset(Math.min(Math.max(event.clientY - rect.top, 27), rect.height - 27))
        }}
      >
        <Handle id={`${id}-launcher`} type={type} position={position} className="port-launcher nodrag" style={{ top: offset }} aria-label={label} tabIndex={0} onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          openFromLauncher(event.currentTarget)
        }} onClick={(event) => {
          event.stopPropagation()
          openFromLauncher(event.currentTarget, event.clientX, event.clientY)
        }}>
          <Plus size={13} strokeWidth={2.2} />
        </Handle>
      </div>
    </>
  )
}

function ConnectionHandles({ nodeId, source = true, target = true }: { nodeId?: string; source?: boolean; target?: boolean }) {
  return (
    <>
      {target && <SmartPort nodeId={nodeId} id="input" type="target" position={Position.Left} label="添加上下文" />}
      {source && <SmartPort nodeId={nodeId} id="output" type="source" position={Position.Right} label="引用该节点生成" />}
    </>
  )
}

function VideoOperationOutputHandle() {
  return <Handle id="video-operation-output" type="source" position={Position.Right} isConnectable={false} className="video-operation-anchor" aria-hidden="true" />
}

function IconAction({ label, active = false, children, onClick, className = '', buttonRef }: { label: string; active?: boolean; children: React.ReactNode; onClick?: () => void; className?: string; buttonRef?: React.RefObject<HTMLButtonElement | null> }) {
  return <button ref={buttonRef} type="button" className={`node-icon-action ui-tooltip-control nodrag ${active ? 'active' : ''} ${className}`} data-tooltip={label} aria-label={label} onClick={(event) => { event.stopPropagation(); onClick?.() }}>{children}</button>
}

function MediaDownloadAction({ label, filename, href, children, className = '' }: { label: string; filename: string; href: string; children: ReactNode; className?: string }) {
  return <a className={`node-icon-action ui-tooltip-control nodrag ${className}`} data-tooltip={label} aria-label={label} href={href} download={filename} onClick={(event) => event.stopPropagation()}>{children}</a>
}

function PinControl({ id, value }: { id: string; value?: PinColor }) {
  const { updateNode } = useCanvasActions()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="pin-control nodrag">
      <IconAction buttonRef={buttonRef} label="Pin 标记" active={Boolean(value)} className="pin-dot-action" onClick={() => setOpen((current) => !current)}>{value ? <i className={`pin-${value}`} /> : <Pin size={15} />}</IconAction>
      <AnchoredPopover anchorRef={buttonRef} open={open} onClose={() => setOpen(false)} className="pin-popover" align="end">
        <div role="menu" aria-label="选择 Pin 颜色" className="pin-palette">{pinOptions.map((item) => <button type="button" key={item.value ?? 'none'} className={value === item.value ? 'active' : ''} title={item.label} aria-label={`${item.label} Pin`} onClick={() => { updateNode(id, { pinColor: item.value }); setOpen(false) }}>{item.value ? <i className={`pin-${item.value}`} /> : <span>无</span>}</button>)}</div>
      </AnchoredPopover>
    </div>
  )
}

function useStableOverlayVariables() {
  const { zoom } = useViewport()
  return {
    '--node-overlay-scale': String(1 / Math.max(zoom, 0.01)),
    '--node-overlay-gap': `${8 / Math.max(zoom, 0.01)}px`,
  } as CSSProperties
}

function useKeepNodeOverlayInViewport(rootRef: RefObject<HTMLElement | null>, selector: string | null) {
  const viewport = useViewport()
  const { setViewport } = useReactFlow<CanvasFlowNode>()
  useLayoutEffect(() => {
    if (!selector) return
    let frame = 0
    const ensureVisible = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const overlays = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(selector) ?? [])
          .filter((element) => element.getClientRects().length > 0)
        if (!overlays.length) return
        const rects = overlays.map((element) => element.getBoundingClientRect())
        const bounds = {
          left: Math.min(...rects.map((rect) => rect.left)),
          top: Math.min(...rects.map((rect) => rect.top)),
          right: Math.max(...rects.map((rect) => rect.right)),
          bottom: Math.max(...rects.map((rect) => rect.bottom)),
        }
        const margin = 12
        let dx = 0
        let dy = 0
        if (bounds.left < margin) dx = margin - bounds.left
        else if (bounds.right > window.innerWidth - margin) dx = window.innerWidth - margin - bounds.right
        if (bounds.top < margin) dy = margin - bounds.top
        else if (bounds.bottom > window.innerHeight - margin) dy = window.innerHeight - margin - bounds.bottom
        if (Math.abs(dx) > .5 || Math.abs(dy) > .5) {
          void setViewport({ x: viewport.x + dx, y: viewport.y + dy, zoom: viewport.zoom }, { duration: 180 })
        }
      })
    }
    ensureVisible()
    window.addEventListener('resize', ensureVisible)
    const observer = new ResizeObserver(ensureVisible)
    rootRef.current?.querySelectorAll<HTMLElement>(selector).forEach((element) => observer.observe(element))
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', ensureVisible)
      observer.disconnect()
    }
  }, [rootRef, selector, setViewport, viewport.x, viewport.y, viewport.zoom])
}

function startDownload(filename: string, href: string, textContent?: string) {
  const anchor = document.createElement('a')
  anchor.download = filename
  if (textContent === undefined) anchor.href = href
  else anchor.href = URL.createObjectURL(new Blob([textContent], { type: 'text/plain;charset=utf-8' }))
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  if (textContent !== undefined) URL.revokeObjectURL(anchor.href)
}

function assetUrl(data: CanvasNodeData) {
  if (data.media?.url && data.nodeType === 'image') return data.media.url
  if (data.nodeType === 'image' && data.imageOperation?.editorComposition?.renderedDataUrl) return data.imageOperation.editorComposition.renderedDataUrl
  if (data.media?.posterUrl) return data.media.posterUrl
  if (data.mediaVariant === 'ip') return '/node-canvas-prototype/assets/virtual-ip-portrait.jpg'
  if (data.mediaVariant === 'anime') return '/node-canvas-prototype/assets/generated-anime.png'
  if (data.mediaVariant === 'poster') return '/node-canvas-prototype/assets/text-poster.png'
  return '/node-canvas-prototype/assets/asset-dog.png'
}

function imageDownloadSource(data: CanvasNodeData) {
  const href = data.media?.url ?? data.imageOperation?.editorComposition?.renderedDataUrl ?? assetUrl(data)
  const renderedMime = href.match(/^data:([^;,]+)/)?.[1]
  const media = data.media?.url === href ? data.media : { url: href, mimeType: renderedMime }
  return { href, extension: mediaFileExtension(media, 'image') }
}

function promptAssetUrl(asset: PromptAssetReference) {
  if (asset.media?.posterUrl) return asset.media.posterUrl
  if (asset.media?.url && asset.nodeType === 'image') return asset.media.url
  return assetUrl({ mediaVariant: asset.mediaVariant } as CanvasNodeData)
}

function referenceAssetUrl(reference: NodeReference) {
  if (reference.media?.posterUrl) return reference.media.posterUrl
  if (reference.media?.url && reference.nodeType === 'image') return reference.media.url
  if (reference.mediaVariant === 'ip') return '/node-canvas-prototype/assets/virtual-ip-portrait.jpg'
  if (reference.mediaVariant === 'anime' || reference.nodeType === 'video') return '/node-canvas-prototype/assets/generated-anime.png'
  if (reference.mediaVariant === 'poster') return '/node-canvas-prototype/assets/text-poster.png'
  return '/node-canvas-prototype/assets/asset-dog.png'
}

function InteractionCandidateBadge({ id, type }: { id: string; type: CanvasNodeData['nodeType'] }) {
  const { interactionMode, isInteractionCandidate } = useCanvasActions()
  if (!interactionMode || !isInteractionCandidate(id)) return null
  return <span className={`interaction-candidate candidate-${interactionMode.kind}`} aria-hidden="true">{interactionMode.kind === 'reference' ? `引用${{ text: '文本', image: '图片', video: '视频', audio: '音频' }[type]}` : interactionMode.kind === 'playlist-clips' ? '选择片段' : '选择焦点'}</span>
}

function interactionNodeClass(id: string, interactionMode: CanvasInteractionMode, isCandidate: boolean) {
  if (!interactionMode) return ''
  if ((interactionMode.kind === 'reference' || interactionMode.kind === 'marker') && interactionMode.targetNodeId === id) return 'is-interaction-target'
  return isCandidate ? 'is-interaction-candidate-node' : 'is-interaction-dimmed'
}

function useSeedanceCompliance(id: string) {
  const { updateNode, notify } = useCanvasActions()
  return () => {
    updateNode(id, { seedanceCompliance: 'checking' })
    notify('正在进行 Seedance 2.0 合规验证')
    window.setTimeout(() => {
      updateNode(id, { seedanceCompliance: 'approved' })
      notify('验证完成：素材已加入 Seedance 2.0 合规素材库')
    }, 950)
  }
}

function ReferenceChip({ targetId, reference }: { targetId: string; reference: NodeReference }) {
  const { removeReference, hoverReference } = useCanvasActions()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<number | null>(null)
  const openCard = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    setOpen(true)
    hoverReference(reference.nodeId)
  }
  const closeCard = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => { setOpen(false); hoverReference(null) }, 120)
  }
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current) }, [])
  const preview = () => reference.nodeType === 'image' || reference.nodeType === 'video'
    ? <img src={referenceAssetUrl(reference)} alt="" />
    : reference.nodeType === 'audio'
      ? <span className="reference-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      : <span className="reference-text-preview">T</span>
  return <div className="reference-chip-wrap" onPointerEnter={openCard} onPointerLeave={closeCard}>
    <button ref={buttonRef} type="button" className={`reference-tile ref-${reference.nodeType}`} aria-label={`${reference.label}参考预览`} onFocus={openCard} onBlur={closeCard} onClick={openCard}>{preview()}</button>
    <button type="button" className="reference-remove-button" aria-label={`删除${reference.label}参考`} title="删除参考" onClick={(event) => { event.stopPropagation(); setOpen(false); hoverReference(null); removeReference(targetId, reference.nodeId) }}><X size={11} /></button>
    <AnchoredPopover anchorRef={buttonRef} open={open} onClose={() => { setOpen(false); hoverReference(null) }} className="reference-hover-card" align="start" placement="top">
      <div className={`reference-hover-preview ref-${reference.nodeType}`} onPointerEnter={openCard} onPointerLeave={closeCard}>{preview()}</div>
    </AnchoredPopover>
  </div>
}

function ReferenceStrip({ targetId, references = [], onAdd, addLabel = '从画布添加参考' }: { targetId: string; references?: NodeReference[]; onAdd?: () => void; addLabel?: string }) {
  return <div className="reference-strip" aria-label="生成参考">
    {references.map((reference) => <ReferenceChip key={reference.nodeId} targetId={targetId} reference={reference} />)}
    <button type="button" className="reference-add-button ui-tooltip-control" data-tooltip={addLabel} onClick={onAdd} aria-label={addLabel}><Plus size={15} /></button>
  </div>
}

function PromptAssetTray({ assets = [], onRemove }: { assets?: PromptAssetReference[]; onRemove: (assetId: string) => void }) {
  if (!assets.length) return null
  return <div className="prompt-asset-tray" aria-label="已引用资产">{assets.map((asset) => <span key={asset.id} className="prompt-asset-chip"><img src={promptAssetUrl(asset)} alt="" /><span>{asset.title}</span><button type="button" aria-label={`移除${asset.title}引用`} onClick={() => onRemove(asset.id)}><X size={11} /></button></span>)}</div>
}

function FocusMarkerTray({ targetId, markers = [] }: { targetId: string; markers?: CanvasNodeData['promptMarkers'] }) {
  const { updatePromptMarker, hoverPromptMarker } = useCanvasActions()
  if (!markers.length) return null
  return <div className="focus-marker-tray" aria-label="焦点编辑结果">{markers.map((marker) => <span key={marker.id} className="prompt-marker-token" onMouseEnter={() => hoverPromptMarker(marker.id)} onMouseLeave={() => hoverPromptMarker(null)} onDoubleClick={() => { const next = window.prompt('重命名焦点', marker.label); if (next?.trim()) updatePromptMarker(targetId, marker.id, next.trim()) }}><i>@</i>{marker.label}<button type="button" onClick={() => updatePromptMarker(targetId, marker.id)} aria-label={`删除${marker.label}`}><X size={11} /></button></span>)}</div>
}

function QuickReferenceMenu({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (asset: PromptAssetReference) => void }) {
  const [query, setQuery] = useState('')
  useEffect(() => { if (open) setQuery('') }, [open])
  if (!open) return null
  const filtered = quickReferenceAssets.filter((asset) => asset.title.toLowerCase().includes(query.trim().toLowerCase()))
  return <section className="quick-reference-menu" role="dialog" aria-label="快捷引用">
    <header><strong>快捷引用</strong><button type="button" onClick={onClose} aria-label="关闭快捷引用"><X size={15} /></button></header>
    <label className="quick-reference-search"><Search size={15} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资产" aria-label="搜索快捷引用资产" /></label>
    {(['personal', 'community'] as const).map((category) => {
      const assets = filtered.filter((asset) => asset.category === category)
      if (!assets.length) return null
      return <div className="quick-reference-group" key={category}><p>{category === 'personal' ? '个人资产' : '社区资产'}</p>{assets.map((asset) => <button type="button" key={asset.id} onClick={() => onSelect(asset)}><img src={promptAssetUrl(asset)} alt="" /><span><strong>{asset.title}</strong><small>图片资产</small></span><Plus size={14} /></button>)}</div>
    })}
    {!filtered.length && <p className="quick-reference-empty">没有匹配的资产</p>}
  </section>
}

function useQuickReferenceDismiss(open: boolean, onClose: () => void, rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, open, rootRef])
}

function formatVideoTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function VideoPlayer({ label, media, className = '', compact = false, seekTime }: { label: string; media?: MediaMetadata; className?: string; compact?: boolean; seekTime?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(media?.duration ?? 8)

  const togglePlayback = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }, [])
  const seekVideo = (time: number) => {
    if (videoRef.current) videoRef.current.currentTime = time
    setCurrentTime(time)
  }

  useEffect(() => {
    if (seekTime === undefined) return
    const video = videoRef.current
    if (!video) return
    const applySeek = () => {
      const availableDuration = Number.isFinite(video.duration) ? video.duration : media?.duration ?? duration
      const nextTime = Math.min(Math.max(seekTime, 0), Math.max(availableDuration - 0.02, 0))
      video.pause()
      video.currentTime = nextTime
      setCurrentTime(nextTime)
      setPlaying(false)
    }
    if (video.readyState >= 1) applySeek()
    else video.addEventListener('loadedmetadata', applySeek, { once: true })
    return () => video.removeEventListener('loadedmetadata', applySeek)
  }, [duration, media?.duration, media?.url, seekTime])

  return (
    <div className={`real-video-player nowheel ${compact ? 'is-compact' : ''} ${className}`} aria-label={label}>
      <video
        ref={videoRef}
        draggable={false}
        src={media?.url ?? '/node-canvas-prototype/assets/virtual-ip-host-video.mp4'}
        poster={media?.posterUrl}
        muted={muted}
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 8)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
      />
      <div className="video-player-controls nodrag nowheel">
        <button type="button" onClick={togglePlayback} aria-label={playing ? '暂停视频' : '播放视频'}>{playing ? <Pause size={compact ? 13 : 15} fill="currentColor" /> : <Play size={compact ? 13 : 15} fill="currentColor" />}</button>
        <span>{formatVideoTime(currentTime)} / {formatVideoTime(duration)}</span>
        <input aria-label="视频播放进度" type="range" min={0} max={Math.max(duration, .1)} step={.05} value={Math.min(currentTime, duration)} onInput={(event) => seekVideo(Number(event.currentTarget.value))} onChange={(event) => seekVideo(Number(event.currentTarget.value))} />
        <button type="button" onClick={() => { const next = !muted; setMuted(next); if (videoRef.current) videoRef.current.muted = next }} aria-label={muted ? '打开视频声音' : '静音视频'}>{muted ? <VolumeX size={compact ? 13 : 15} /> : <Volume2 size={compact ? 13 : 15} />}</button>
        {!compact && <button type="button" onClick={() => void videoRef.current?.requestFullscreen?.()} aria-label="全屏播放视频"><Maximize2 size={15} /></button>}
      </div>
    </div>
  )
}

function previewPrompt(data: CanvasNodeData) {
  if (data.sourceKind !== 'generated' || data.imageOperation || data.videoOperation || data.playlistComposition) return null
  return data.localPrompt?.trim() || data.promptHistory?.find((item) => item.trim()) || null
}

function previewSourceLabel(data: CanvasNodeData) {
  if (data.imageOperation) return `图片工具 · ${operationCopy[data.imageOperation.operation]}`
  if (data.videoOperation) {
    const labels: Record<VideoOperation, string> = {
      'super-resolution': '视频超分',
      'frame-interpolation': '视频补帧',
      'subtitle-removal': '字幕擦除',
      'lip-sync': '对口型',
      edit: '视频编辑',
    }
    return `视频工具 · ${labels[data.videoOperation.operation]}`
  }
  if (data.playlistComposition) return '播放列表导出'
  return {
    generated: '模型生成',
    upload: '本地上传',
    asset: '从资产添加',
    'virtual-ip': '虚拟 IP',
    created: '画布新建',
  }[data.sourceKind]
}

function previewModelLabel(data: CanvasNodeData) {
  if (data.sourceKind !== 'generated' || data.imageOperation || data.videoOperation || data.playlistComposition) return undefined
  if (data.nodeType === 'image') return data.modelId === 'seedream-3' ? 'Seedream 3.0' : data.modelId
  if (data.nodeType === 'video') return videoModelCapabilities.find((item) => item.id === data.modelId)?.label ?? data.modelId
  return undefined
}

function previewCreatedAt(data: CanvasNodeData) {
  return data.createdAt?.trim() || '2026/07/31'
}

function previewAspectRatio(data: CanvasNodeData) {
  const configuredRatio = data.nodeType === 'image' ? data.imageGeneration?.ratio : data.videoGeneration?.ratio
  if (configuredRatio && configuredRatio !== 'auto') return configuredRatio
  const { width, height } = data.media ?? {}
  if (!width || !height) return undefined
  const knownRatios: Array<[number, string]> = [
    [1, '1:1'], [16 / 9, '16:9'], [9 / 16, '9:16'], [3 / 4, '3:4'], [4 / 3, '4:3'], [3 / 2, '3:2'], [2 / 3, '2:3'], [21 / 9, '21:9'],
  ]
  const ratio = width / height
  return knownRatios.find(([value]) => Math.abs(value - ratio) < .025)?.[1] ?? `${width}:${height}`
}

function previewMediaFormat(data: CanvasNodeData) {
  const mimeType = data.media?.mimeType
  if (!mimeType) return undefined
  const subtype = mimeType.split('/')[1]
  return subtype ? subtype.toUpperCase() : mimeType.toUpperCase()
}

function PreviewMetadata({ data, onClose }: { data: CanvasNodeData; onClose: () => void }) {
  const prompt = previewPrompt(data)
  const resolution = formatMediaResolution(data.media?.width, data.media?.height)
  const model = previewModelLabel(data)
  const aspectRatio = previewAspectRatio(data)
  const format = previewMediaFormat(data)
  const metadata = [
    { label: '来源', value: previewSourceLabel(data) },
    ...(model ? [{ label: '模型', value: model }] : []),
    ...(resolution ? [{ label: '分辨率', value: resolution }] : []),
    ...(aspectRatio ? [{ label: '宽高比', value: aspectRatio }] : []),
    ...(data.nodeType === 'video' && data.duration !== undefined ? [{ label: '时长', value: formatVideoTime(data.duration) }] : []),
    ...(data.nodeType === 'video' && data.media?.hasAudio !== undefined ? [{ label: '音频', value: data.media.hasAudio ? '有' : '无' }] : []),
    ...(format ? [{ label: '格式', value: format }] : []),
    { label: '日期', value: previewCreatedAt(data) },
  ]
  const imageDownload = data.nodeType === 'image' ? imageDownloadSource(data) : undefined
  const downloadLabel = data.nodeType === 'image' ? '下载图片' : '下载视频'
  const downloadHref = imageDownload?.href ?? data.media?.url ?? '/node-canvas-prototype/assets/virtual-ip-host-video.mp4'
  const downloadExtension = imageDownload?.extension ?? mediaFileExtension(data.media, 'video')

  return <aside className="preview-metadata-panel" aria-label={`${data.title}素材信息`}>
    <header>
      <span><strong>{data.title}</strong><small>{data.nodeType === 'image' ? '图片预览' : '视频预览'}</small></span>
      <button type="button" autoFocus onClick={onClose} aria-label="关闭全屏预览"><X size={19} /></button>
    </header>
    <section className="preview-metadata-section" aria-labelledby="preview-prompt-title">
      <h2 id="preview-prompt-title">提示词</h2>
      <p className={prompt ? '' : 'is-empty'}>{prompt ?? '暂无提示词'}</p>
    </section>
    <section className="preview-metadata-section" aria-labelledby="preview-information-title">
      <h2 id="preview-information-title">信息</h2>
      <dl>{metadata.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
    </section>
    <footer>
      <MediaDownloadAction className="preview-download-action" label={downloadLabel} filename={`${data.title}.${downloadExtension}`} href={downloadHref}><Download size={15} /><span>{downloadLabel}</span></MediaDownloadAction>
    </footer>
  </aside>
}

export function PreviewOverlay({ open, onClose, id, data }: { open: boolean; onClose: () => void; id: string; data: CanvasNodeData }) {
  const { updateNode } = useCanvasActions()
  const format = data.textFormat ?? { block: 'body', bold: false, italic: false }
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])

  if (!open) return null
  const isMediaPreview = data.nodeType === 'image' || data.nodeType === 'video'
  return createPortal(
    <div className="node-preview-overlay" data-isolate-canvas-shortcuts="true" role="dialog" aria-modal="true" aria-label={`${data.title}${data.nodeType === 'text' ? '全屏编辑' : '全屏预览'}`} onMouseDown={onClose}>
      <section className={`node-preview-panel preview-${data.nodeType} ${data.nodeType === 'text' ? 'fullscreen-text-editor' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
        {!isMediaPreview && data.nodeType !== 'text' && <header><strong>{data.title}</strong><button type="button" autoFocus onClick={onClose} aria-label="关闭全屏预览"><X size={19} /></button></header>}
        {data.nodeType === 'text' ? (
          <><TextToolbar id={id} data={data} variant="fullscreen" onClose={onClose} /><textarea className={`fullscreen-text text-bg-${data.backgroundColor ?? 'default'} text-block-${format.block} ${format.bold ? 'is-bold' : ''} ${format.italic ? 'is-italic' : ''}`} aria-label="全屏编辑文本" value={data.content ?? ''} placeholder="输入文本内容" onChange={(event) => updateNode(id, { content: event.target.value, status: event.target.value.trim() ? 'ready' : 'idle' })} /></>
        ) : data.nodeType === 'audio' ? (
          <div className="fullscreen-audio"><Waves size={46} /><strong>{data.content}</strong><span>音频预览</span></div>
        ) : <>
          <main className="preview-media-stage">
            {data.nodeType === 'video'
              ? <VideoPlayer label={`${data.title}全屏播放器`} media={data.media} className="fullscreen-video-player" />
              : <img src={assetUrl(data)} alt={data.content || data.title} />}
          </main>
          <PreviewMetadata data={data} onClose={onClose} />
        </>}
      </section>
    </div>,
    document.body,
  )
}

function TextToolbar({ id, data, onExpand, onClose, variant = 'node' }: { id: string; data: CanvasNodeData; onExpand?: () => void; onClose?: () => void; variant?: 'node' | 'fullscreen' }) {
  const { updateNode, notify } = useCanvasActions()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const paletteButtonRef = useRef<HTMLButtonElement>(null)
  const listButtonRef = useRef<HTMLButtonElement>(null)
  const format = data.textFormat ?? { block: 'body', bold: false, italic: false }
  const setFormat = (patch: Partial<TextFormat>) => updateNode(id, { textFormat: { ...format, ...patch } })
  const applyList = (ordered: boolean) => {
    const lines = (data.content ?? '').split('\n').map((line) => line.replace(/^\s*(?:[\u2022-]|\d+\.)\s*/, ''))
    updateNode(id, { content: lines.map((line, index) => `${ordered ? `${index + 1}.` : '•'} ${line}`).join('\n') })
  }
  const clearList = () => updateNode(id, { content: (data.content ?? '').split('\n').map((line) => line.replace(/^\s*(?:[•-]|\d+\.)\s*/, '')).join('\n') })

  return (
    <div className={`${variant === 'fullscreen' ? 'fullscreen-text-toolbar' : 'text-toolbar zoom-stable-ui nodrag'}`} role="toolbar" aria-label={variant === 'fullscreen' ? '全屏文本工具' : '文本节点工具'}>
      <div className="palette-control">
        <IconAction buttonRef={paletteButtonRef} label="背景颜色" onClick={() => setPaletteOpen((current) => !current)}><Palette size={15} /></IconAction>
        <AnchoredPopover anchorRef={paletteButtonRef} open={paletteOpen} onClose={() => setPaletteOpen(false)} className="color-popover">
          <div role="menu" aria-label="选择文本背景颜色">{textBackgrounds.map((item) => <button key={item.value} type="button" title={item.label} aria-label={item.label} className={data.backgroundColor === item.value ? 'active' : ''} style={{ background: item.color }} onClick={() => { updateNode(id, { backgroundColor: item.value }); setPaletteOpen(false) }} />)}</div>
        </AnchoredPopover>
      </div>
      <label className="toolbar-select"><span className="sr-only">文字层级</span><select aria-label="文字层级" value={format.block} onChange={(event) => setFormat({ block: event.target.value as TextFormat['block'] })}><option value="body">正文</option><option value="h1">标题 1</option><option value="h2">标题 2</option><option value="h3">标题 3</option></select></label>
      <span className="toolbar-divider" />
      <IconAction label="加粗" active={format.bold} onClick={() => setFormat({ bold: !format.bold })}><Bold size={15} /></IconAction>
      <IconAction label="斜体" active={format.italic} onClick={() => setFormat({ italic: !format.italic })}><Italic size={15} /></IconAction>
      <div className="list-control"><IconAction label="项目符号列表" onClick={() => applyList(false)}><List size={15} /></IconAction><button ref={listButtonRef} type="button" className="list-chevron nodrag" aria-label="选择列表类型" title="选择列表类型" onClick={() => setListOpen((current) => !current)}><ChevronDown size={12} /></button><AnchoredPopover anchorRef={listButtonRef} open={listOpen} onClose={() => setListOpen(false)} className="toolbar-menu list-format-menu" align="start"><div role="menu"><button type="button" onClick={() => { applyList(false); setListOpen(false) }}><List size={14} />项目符号</button><button type="button" onClick={() => { applyList(true); setListOpen(false) }}><span className="numbered-list-icon">1.</span>编号列表</button><button type="button" onClick={() => { clearList(); setListOpen(false) }}><X size={14} />清除列表格式</button></div></AnchoredPopover></div>
      <span className="toolbar-divider" />
      <PinControl id={id} value={data.pinColor} />
      <IconAction label="复制文本" onClick={async () => {
        const text = data.content ?? ''
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
          } else {
            const input = document.createElement('textarea')
            input.value = text
            input.style.position = 'fixed'
            input.style.opacity = '0'
            document.body.append(input)
            input.select()
            document.execCommand('copy')
            input.remove()
          }
          notify('已复制文本')
        } catch {
          notify('复制失败，请检查浏览器权限')
        }
      }}><Copy size={15} /></IconAction>
      {onExpand && <IconAction label="全屏编辑" onClick={onExpand}><Expand size={15} /></IconAction>}
      {variant === 'fullscreen' && onClose && <button type="button" className="node-icon-action fullscreen-text-close" autoFocus onClick={onClose} aria-label="关闭全屏编辑" title="关闭"><X size={15} /></button>}
    </div>
  )
}

function TextGenerationConfig({ id, data }: { id: string; data: CanvasNodeData }) {
  const { updateNode, runGeneration, notify, beginReferenceSelection } = useCanvasActions()
  const definition = generationDefinitions.find((item) => item.nodeType === 'text')!
  const mode = definition.modes.find((item) => item.id === data.modeId) ?? definition.modes[0]
  const model = mode.models.find((item) => item.id === data.modelId) ?? mode.models[0]
  const busy = data.status === 'queued' || data.status === 'running'

  return (
    <section className="text-generation-config node-panel zoom-stable-ui nodrag nowheel" aria-label="文本生成配置">
      <ReferenceStrip targetId={id} references={data.references} onAdd={() => beginReferenceSelection(id)} />
      <div className="text-prompt-row">
        <textarea aria-label="文本生成提示词" placeholder="描述你想生成的文本内容" value={data.localPrompt ?? ''} onChange={(event) => updateNode(id, { localPrompt: event.target.value, modeId: mode.id, modelId: model.id })} />
      </div>
      <footer>
        <select aria-label="文本生成模型" value={model.id} onChange={(event) => updateNode(id, { modelId: event.target.value })}>{mode.models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <span className="panel-spacer" />
        <button type="button" className="translate-text-action" onClick={() => notify('已翻译提示词（Mock）')} title="翻译提示词" aria-label="翻译提示词"><Languages size={15} /></button>
        <span className="generation-cost"><span className="chestnut-dot" />{data.cost ?? 1}</span>
        <button type="button" className="generate-button" onClick={() => runGeneration(id)} disabled={busy || (!(data.localPrompt ?? '').trim() && !(data.references?.length))} aria-label={busy ? '文本生成中' : '生成文本'}>{busy ? <Pause size={16} /> : <ArrowUp size={17} />}</button>
      </footer>
    </section>
  )
}

export const TextNode = memo(function TextNode({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const { updateNode, selectedItemCount, isConnectionTargetCandidate, interactionMode, isInteractionCandidate } = useCanvasActions()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const overlayVariables = useStableOverlayVariables()
  const content = data.content ?? ''
  const format = data.textFormat ?? { block: 'body', bold: false, italic: false }
  const focused = selected && selectedItemCount === 1
  const candidate = isConnectionTargetCandidate(id)
  const interactionClass = interactionNodeClass(id, interactionMode, isInteractionCandidate(id))
  const editorClass = `text-node-editor text-block-${format.block} ${format.bold ? 'is-bold' : ''} ${format.italic ? 'is-italic' : ''}`

  useEffect(() => { if (!focused) setEditing(false) }, [focused])

  return (
    <article className={`canvas-node text-node ${selected ? 'is-selected' : ''} ${candidate ? 'is-connection-candidate' : ''} ${content.trim() ? '' : 'is-empty'} ${interactionClass}`} style={overlayVariables}>
      <NodeResizer isVisible={focused} minWidth={250} minHeight={150} handleClassName="text-resize-handle" lineClassName="text-resize-line" />
      <ConnectionHandles nodeId={id} />
      {focused && Boolean(content.trim()) && <TextToolbar id={id} data={data} onExpand={() => setPreviewOpen(true)} />}
      <NodeHeader id={id} data={data} icon={<span className="text-node-icon">T</span>} />
      <div className={`node-surface text-surface text-bg-${data.backgroundColor ?? 'default'}`}>
        {editing ? <textarea autoFocus className={`${editorClass} nodrag nowheel is-editing`} aria-label="文本节点内容" placeholder="输入文本内容" value={content} onChange={(event) => updateNode(id, { content: event.target.value, status: event.target.value.trim() ? 'ready' : 'idle' })} onBlur={() => setEditing(false)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.blur() } }} /> : <div className={`${editorClass} text-node-browser`} role="textbox" aria-readonly="true" aria-label="文本节点内容，双击编辑" onDoubleClick={(event) => { event.stopPropagation(); setEditing(true) }}>{content || <span className="text-node-placeholder">双击输入文本内容</span>}</div>}
      </div>
      {focused && <TextGenerationConfig id={id} data={data} />}
      <PreviewOverlay open={previewOpen} onClose={() => setPreviewOpen(false)} id={id} data={data} />
    </article>
  )
})

interface ImageToolPanelProps {
  id: string
  data: CanvasNodeData
  tool: Extract<ImageOperation, 'multi-angle' | 'relight'>
  onClose: () => void
}

function RangeField({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="range-field"><span>{label}<strong>{value}{suffix}</strong></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>
}

type CropFrame = { x: number; y: number; width: number; height: number }
type RepaintMode = 'smart' | 'brush' | 'eraser'

const cropRatios = ['原图比例', '1:1', '4:3', '3:4', '16:9', '9:16', '自定义比例'] as const
const expandRatios = ['原图比例', '1:1', '4:3', '3:4', '16:9', '9:16', '自由比例'] as const

function numericRatio(value: string) {
  if (value === '原图比例') return 16 / 10
  const match = value.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/)
  return match ? Number(match[1]) / Number(match[2]) : 1
}

function frameForRatio(value: string): CropFrame {
  const ratio = numericRatio(value)
  const width = ratio < 0.9 ? 42 : ratio > 1.7 ? 78 : 68
  const height = Math.min(82, width * 1.6 / ratio)
  return { x: (100 - width) / 2, y: (100 - height) / 2, width, height }
}

function ImageFocusEditor({ id, data, tool, onClose }: { id: string; data: CanvasNodeData; tool: 'crop' | 'repaint' | 'expand'; onClose: () => void }) {
  const { createImageDerivative, notify } = useCanvasActions()
  const stageRef = useRef<HTMLDivElement>(null)
  const pointerState = useRef<null | { action: string; x: number; y: number; frame: CropFrame }>(null)
  const lastPaintPoint = useRef<{ x: number; y: number } | null>(null)
  const smartTargetInputRef = useRef<HTMLInputElement>(null)
  const [aspectRatio, setAspectRatio] = useState('原图比例')
  const [customRatio, setCustomRatio] = useState('5:4')
  const [cropFrame, setCropFrame] = useState<CropFrame>(() => frameForRatio('原图比例'))
  const [expandFrame, setExpandFrame] = useState<CropFrame>(() => frameForExpandRatio('原图比例'))
  const [mode, setMode] = useState<RepaintMode>('smart')
  const [brushSize, setBrushSize] = useState(42)
  const [zoom, setZoom] = useState(100)
  const [prompt, setPrompt] = useState('')
  const [smartTarget, setSmartTarget] = useState('')
  const [masks, setMasks] = useState<RepaintMask[]>([])
  const [undoStack, setUndoStack] = useState<RepaintMask[][]>([])
  const [redoStack, setRedoStack] = useState<RepaintMask[][]>([])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  useEffect(() => {
    if (tool === 'repaint' && mode === 'smart') smartTargetInputRef.current?.focus()
  }, [mode, tool])

  const selectedRatio = aspectRatio === '自定义比例' ? customRatio : aspectRatio
  const applyRatio = (ratio: string) => {
    setAspectRatio(ratio)
    if (tool === 'expand') setExpandFrame(frameForExpandRatio(ratio))
    else setCropFrame(frameForRatio(ratio === '自定义比例' ? customRatio : ratio))
  }
  const rememberMasks = () => {
    setUndoStack((current) => [...current.slice(-20), masks])
    setRedoStack([])
  }
  const pointFromEvent = (event: React.PointerEvent) => {
    const rect = stageRef.current!.getBoundingClientRect()
    return { x: Math.min(Math.max((event.clientX - rect.left) / rect.width * 100, 0), 100), y: Math.min(Math.max((event.clientY - rect.top) / rect.height * 100, 0), 100) }
  }
  const paintPoints = useCallback((points: Array<{ x: number; y: number }>) => {
    if (mode === 'eraser') {
      const stage = stageRef.current?.getBoundingClientRect()
      const radiusX = stage ? brushSize / stage.width * 58 : brushSize / 5
      const radiusY = stage ? brushSize / stage.height * 58 : brushSize / 5
      setMasks((current) => current.filter((mask) => !points.some((point) => Math.hypot((mask.x - point.x) / radiusX, (mask.y - point.y) / radiusY) <= 1)))
      return
    }
    const createdAt = Date.now()
    setMasks((current) => [...current, ...points.map((point, index) => ({
      id: `mask-${createdAt}-${current.length + index}`,
      x: point.x,
      y: point.y,
      size: brushSize,
      kind: 'brush' as const,
    }))])
  }, [brushSize, mode, smartTarget])
  const paintAt = useCallback((x: number, y: number) => paintPoints([{ x, y }]), [paintPoints])
  const paintSegment = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const stage = stageRef.current?.getBoundingClientRect()
    if (!stage) return paintAt(to.x, to.y)
    const distance = Math.hypot((to.x - from.x) / 100 * stage.width, (to.y - from.y) / 100 * stage.height)
    const step = Math.max(2, brushSize * .18)
    const segments = Math.max(1, Math.ceil(distance / step))
    paintPoints(Array.from({ length: segments }, (_, index) => {
      const progress = (index + 1) / segments
      return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress }
    }))
  }, [brushSize, paintAt, paintPoints])
  const applySmartSelection = () => {
    const target = smartTarget.trim()
    if (!target) {
      smartTargetInputRef.current?.focus()
      notify('请输入需要智能选择的人物或物体')
      return
    }
    rememberMasks()
    const seed = target.split('').reduce((total, character) => total + character.charCodeAt(0), 0)
    setMasks((current) => [...current, {
      id: `smart-mask-${Date.now()}`,
      kind: 'smart',
      x: 38 + seed % 25,
      y: 36 + seed % 18,
      size: 96,
      label: target,
    }])
    notify(`已识别并选中“${target}”`)
  }
  const beginStagePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== 'repaint') return
    if (mode === 'smart') return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    rememberMasks()
    const point = pointFromEvent(event)
    paintAt(point.x, point.y)
    lastPaintPoint.current = point
    pointerState.current = { action: 'paint', x: event.clientX, y: event.clientY, frame: cropFrame }
  }
  const beginFramePointer = (event: React.PointerEvent, action: string, frame: CropFrame) => {
    event.preventDefault()
    event.stopPropagation()
    stageRef.current?.setPointerCapture(event.pointerId)
    pointerState.current = { action, x: event.clientX, y: event.clientY, frame }
  }
  const movePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerState.current
    if (!state || !stageRef.current) return
    const stage = stageRef.current.getBoundingClientRect()
    if (state.action === 'paint') {
      const point = pointFromEvent(event)
      paintSegment(lastPaintPoint.current ?? point, point)
      lastPaintPoint.current = point
      return
    }
    const dx = (event.clientX - state.x) / stage.width * 100
    const dy = (event.clientY - state.y) / stage.height * 100
    if (state.action === 'expand-move') {
      setExpandFrame(moveExpandRect(state.frame, dx, dy))
      return
    }
    if (state.action.startsWith('expand-')) {
      setAspectRatio('自由比例')
      setExpandFrame(resizeExpandRect(state.frame, state.action.replace('expand-', ''), dx, dy))
      return
    }
    if (state.action === 'move') {
      setCropFrame({ ...state.frame, x: Math.min(Math.max(state.frame.x + dx, 0), 100 - state.frame.width), y: Math.min(Math.max(state.frame.y + dy, 0), 100 - state.frame.height) })
      return
    }
    const ratio = numericRatio(selectedRatio)
    const fromWest = state.action.includes('w')
    const fromNorth = state.action.includes('n')
    const horizontalDelta = fromWest ? -dx : dx
    const maxWidth = fromWest ? state.frame.x + state.frame.width : 100 - state.frame.x
    const maxHeight = fromNorth ? state.frame.y + state.frame.height : 100 - state.frame.y
    const width = Math.min(Math.max(state.frame.width + horizontalDelta, 16), maxWidth, maxHeight * ratio / 1.6)
    const height = width * 1.6 / ratio
    setCropFrame({ x: fromWest ? state.frame.x + state.frame.width - width : state.frame.x, y: fromNorth ? state.frame.y + state.frame.height - height : state.frame.y, width, height })
  }
  const stopPointer = () => { pointerState.current = null; lastPaintPoint.current = null }
  const undoMask = () => {
    const previous = undoStack.at(-1)
    if (!previous) return
    setRedoStack((current) => [...current, masks])
    setMasks(previous)
    setUndoStack((current) => current.slice(0, -1))
  }
  const redoMask = () => {
    const next = redoStack.at(-1)
    if (!next) return
    setUndoStack((current) => [...current, masks])
    setMasks(next)
    setRedoStack((current) => current.slice(0, -1))
  }
  const confirm = () => {
    if (tool === 'crop') createImageDerivative(id, 'crop', { operation: 'crop', aspectRatio: selectedRatio, cropRect: cropFrame })
    else if (tool === 'expand') createImageDerivative(id, 'expand', { operation: 'expand', aspectRatio: aspectRatio === '自由比例' ? `${expandRectRatio(expandFrame).toFixed(2)}:1` : aspectRatio, expandRect: expandFrame, prompt })
    else createImageDerivative(id, 'repaint', buildRepaintResult(masks, mode, brushSize, prompt))
    onClose()
  }

  return createPortal(
    <div className={`image-focus-editor focus-${tool}`} data-canvas-overlay="true" data-isolate-canvas-shortcuts="true" role="dialog" aria-modal="true" aria-label={tool === 'crop' ? '裁剪图片' : tool === 'expand' ? '智能扩图' : '局部重绘'}>
      <header className="focus-editor-header"><button type="button" onClick={onClose} aria-label="退出编辑"><X size={18} /></button><div><strong>{tool === 'crop' ? '裁剪画面' : tool === 'expand' ? '智能扩图' : '局部重绘'}</strong><span>{data.title}</span></div></header>
      <div className="focus-editor-toolbar" role="toolbar" aria-label={tool === 'crop' ? '裁剪工具' : tool === 'expand' ? '扩图工具' : '重绘工具'}>
        {tool === 'crop' ? <>
          <span className="focus-toolbar-label"><Crop size={15} />画面比例</span>
          {cropRatios.map((ratio) => <button key={ratio} type="button" className={aspectRatio === ratio ? 'active' : ''} onClick={() => applyRatio(ratio)}>{ratio}</button>)}
          {aspectRatio === '自定义比例' && <input aria-label="自定义裁剪比例" value={customRatio} onChange={(event) => { setCustomRatio(event.target.value); setCropFrame(frameForRatio(event.target.value)) }} />}
        </> : tool === 'expand' ? <>
          <span className="focus-toolbar-label"><Maximize2 size={15} />扩图比例</span>
          {expandRatios.map((ratio) => <button key={ratio} type="button" className={aspectRatio === ratio ? 'active' : ''} onClick={() => applyRatio(ratio)}>{ratio}</button>)}
        </> : <>
          <button type="button" className={mode === 'smart' ? 'active' : ''} onClick={() => { setMode('smart'); window.setTimeout(() => smartTargetInputRef.current?.focus(), 0) }}><WandSparkles size={15} />智能选择</button>
          <button type="button" className={mode === 'brush' ? 'active' : ''} onClick={() => setMode('brush')}><Brush size={15} />笔刷</button>
          <button type="button" className={mode === 'eraser' ? 'active' : ''} onClick={() => setMode('eraser')}><Eraser size={15} />橡皮擦</button>
          {mode === 'smart' && <label className="smart-selection-input"><span className="sr-only">智能选择对象</span><input ref={smartTargetInputRef} value={smartTarget} onChange={(event) => setSmartTarget(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') applySmartSelection() }} placeholder="输入要选择的人物或物体" /><button type="button" onClick={applySmartSelection}>选择</button></label>}
          <label className="focus-brush-size"><span>{mode === 'eraser' ? '橡皮擦' : '笔刷'} {brushSize}px</span><input type="range" min="12" max="96" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label>
          <span className="focus-toolbar-divider" />
          <button type="button" onClick={undoMask} disabled={!undoStack.length} aria-label="撤销蒙版"><Undo2 size={15} /></button>
          <button type="button" onClick={redoMask} disabled={!redoStack.length} aria-label="重做蒙版"><Redo2 size={15} /></button>
          <button type="button" onClick={() => { rememberMasks(); setMasks([]) }} aria-label="清空蒙版"><RotateCcw size={15} /></button>
        </>}
      </div>
      <main className="focus-editor-canvas">
        <div ref={stageRef} className={`focus-image-stage ${tool === 'repaint' ? `repaint-mode-${mode}` : ''} ${tool === 'expand' ? 'focus-expand-stage' : ''}`} style={{ '--focus-image': `url(${assetUrl(data)})`, '--focus-zoom': String(zoom / 100) } as CSSProperties} onPointerDown={beginStagePointer} onPointerMove={movePointer} onPointerUp={stopPointer} onPointerCancel={stopPointer}>
          {tool === 'expand' ? <div className="expand-source-image" style={{ left: `${EXPAND_SOURCE_RECT.x}%`, top: `${EXPAND_SOURCE_RECT.y}%`, width: `${EXPAND_SOURCE_RECT.width}%`, height: `${EXPAND_SOURCE_RECT.height}%`, backgroundImage: `url(${assetUrl(data)})` }} /> : <div className="focus-image-layer" />}
          {tool === 'crop' ? <div className="crop-frame" style={{ left: `${cropFrame.x}%`, top: `${cropFrame.y}%`, width: `${cropFrame.width}%`, height: `${cropFrame.height}%` }} onPointerDown={(event) => beginFramePointer(event, 'move', cropFrame)}>
            <i className="crop-grid-line grid-v-one" /><i className="crop-grid-line grid-v-two" /><i className="crop-grid-line grid-h-one" /><i className="crop-grid-line grid-h-two" />
            {['nw', 'ne', 'sw', 'se'].map((corner) => <button key={corner} type="button" className={`crop-handle crop-${corner}`} onPointerDown={(event) => beginFramePointer(event, corner, cropFrame)} aria-label={`从${corner}调整裁剪范围`} />)}
          </div> : tool === 'expand' ? <div className="expand-frame" style={{ left: `${expandFrame.x}%`, top: `${expandFrame.y}%`, width: `${expandFrame.width}%`, height: `${expandFrame.height}%` }} onPointerDown={(event) => beginFramePointer(event, 'expand-move', expandFrame)}>
            {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => <button key={handle} type="button" className={`expand-handle expand-${handle}`} onPointerDown={(event) => beginFramePointer(event, `expand-${handle}`, expandFrame)} aria-label={`从${handle}调整扩图范围`} />)}
          </div> : <div className="repaint-mask-layer" aria-label="重绘蒙版">
            {masks.map((point) => <span key={point.id} className={point.kind === 'smart' ? 'smart-mask-region' : 'brush-mask-point'} style={{ left: `${point.x}%`, top: `${point.y}%`, width: point.kind === 'smart' ? 112 : point.size, height: point.kind === 'smart' ? 78 : point.size }}>{point.kind === 'smart' && <em>{point.label}</em>}</span>)}
          </div>}
        </div>
        {tool === 'repaint' && <label className="focus-zoom-control"><ZoomIn size={15} /><input type="range" min="80" max="150" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><span>{zoom}%</span></label>}
      </main>
      <footer className={`focus-editor-footer ${tool === 'repaint' || tool === 'expand' ? 'with-prompt' : ''}`}>
        {tool === 'crop' ? <span>拖动裁剪框调整位置，拖动四角改变范围</span> : tool === 'expand' ? <><textarea aria-label="扩图描述" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述希望扩展的环境（可选）" /><span className="generation-cost"><span className="chestnut-dot" />6</span></> : <><select aria-label="重绘模式"><option>替换成</option><option>移除</option></select><textarea aria-label="替换内容" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="请输入替换成的内容" /><span className="generation-cost"><span className="chestnut-dot" />6</span></>}
        <button type="button" className="focus-confirm" disabled={tool === 'repaint' && (!masks.length || !prompt.trim())} onClick={confirm}>确认生成</button>
      </footer>
    </div>,
    document.body,
  )
}

const lightPresets = [
  ['自然光', 'natural'], ['黄金时刻', 'golden'], ['蓝调时刻', 'blue'], ['伦勃朗光', 'rembrandt'],
  ['夜晚光', 'night'], ['光绘', 'painting'], ['延时摄影', 'timelapse'], ['阴影', 'shadow'],
] as const

function ImageToolPanel({ id, tool, onClose }: ImageToolPanelProps) {
  const { createImageDerivative } = useCanvasActions()
  const [angle, setAngle] = useState(0)
  const [tilt, setTilt] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [wideAngle, setWideAngle] = useState(false)
  const [secondaryLight, setSecondaryLight] = useState(false)
  const [activeLight, setActiveLight] = useState<'primary' | 'secondary'>('primary')
  const [lightPosition, setLightPosition] = useState({ x: 72, y: 24 })
  const [secondaryLightPosition, setSecondaryLightPosition] = useState({ x: 26, y: 68 })
  const [brightness, setBrightness] = useState(50)
  const [lightColor, setLightColor] = useState('#ffd7a6')
  const [colorOpen, setColorOpen] = useState(false)
  const [lightSmartMode, setLightSmartMode] = useState(false)
  const [lightPreset, setLightPreset] = useState('natural')
  const [lightPrompt, setLightPrompt] = useState('')

  const confirm = () => {
    const result: ImageOperationResult = { operation: tool }
    if (tool === 'multi-angle') Object.assign(result, { angle, tilt, zoom, wideAngle })
    if (tool === 'relight') Object.assign(result, {
      secondaryLight,
      lightPosition: `${Math.round(lightPosition.x)},${Math.round(lightPosition.y)}`,
      secondaryLightPosition: `${Math.round(secondaryLightPosition.x)},${Math.round(secondaryLightPosition.y)}`,
      lightColor,
      lightSmartMode,
      lightPreset,
      prompt: lightSmartMode ? lightPrompt : undefined,
      brightness,
    })
    createImageDerivative(id, tool, result)
    onClose()
  }

  return (
    <section className={`image-tool-panel node-panel zoom-stable-ui nodrag nowheel tool-${tool}`} aria-label={`${operationCopy[tool]}配置`}>
      <header><div><span>{tool === 'multi-angle' ? <RotateCw size={15} /> : <SunMedium size={15} />}</span><strong>{operationCopy[tool]}</strong></div><button type="button" onClick={onClose} aria-label={`关闭${operationCopy[tool]}`}><X size={16} /></button></header>
      <div className="tool-panel-body">
        {tool === 'multi-angle' && <div className="angle-workbench">
          <div className="angle-preview" style={{ '--angle-x': `${tilt}deg`, '--angle-y': `${angle}deg`, '--angle-scale': String(zoom / 100), '--angle-perspective': wideAngle ? '520px' : '900px' } as CSSProperties} aria-label="角度实时预览">
            <div className="angle-orbit"><i /><i /><i /></div><div className="angle-image-card" /><span className="angle-axis angle-axis-x">X</span><span className="angle-axis angle-axis-y">Y</span><span className="angle-axis angle-axis-z">Z</span>
          </div>
          <div className="angle-controls"><RangeField label="水平旋转" value={angle} min={-45} max={45} suffix="°" onChange={setAngle} /><RangeField label="垂直倾斜" value={tilt} min={-30} max={30} suffix="°" onChange={setTilt} /><RangeField label="镜头缩放" value={zoom} min={70} max={140} suffix="%" onChange={setZoom} /><label className="toggle-row"><span>广角透视</span><input type="checkbox" checked={wideAngle} onChange={(event) => setWideAngle(event.target.checked)} /></label><button type="button" className="angle-reset" onClick={() => { setAngle(0); setTilt(0); setZoom(100); setWideAngle(false) }}><RotateCcw size={13} />恢复默认</button></div>
        </div>}
        {tool === 'relight' && <div className="relight-workbench">
          <div className="relight-stage-column"><div className="relight-source-switch"><button type="button" className={activeLight === 'primary' ? 'active' : ''} onClick={() => setActiveLight('primary')}>主光源</button><button type="button" className={activeLight === 'secondary' ? 'active' : ''} disabled={!secondaryLight} onClick={() => setActiveLight('secondary')}>副光源</button><label><input type="checkbox" checked={secondaryLight} onChange={(event) => { setSecondaryLight(event.target.checked); if (!event.target.checked) setActiveLight('primary') }} /><span /></label></div>
            <div className="relight-scene" onPointerDown={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const next = { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 }; if (activeLight === 'primary') setLightPosition(next); else setSecondaryLightPosition(next) }}>
              <div className="relight-globe"><i /><i /><i /></div><div className="relight-image-plane" /><span className="relight-beam primary-beam" style={{ left: `${lightPosition.x}%`, top: `${lightPosition.y}%`, background: lightColor }} /><span className="relight-point primary-point" style={{ left: `${lightPosition.x}%`, top: `${lightPosition.y}%`, background: lightColor }} />{secondaryLight && <><span className="relight-beam secondary-beam" style={{ left: `${secondaryLightPosition.x}%`, top: `${secondaryLightPosition.y}%` }} /><span className="relight-point secondary-point" style={{ left: `${secondaryLightPosition.x}%`, top: `${secondaryLightPosition.y}%` }} /></>}
            </div><small>点击球体区域调整当前光源位置</small></div>
          <div className="relight-settings"><div className="relight-settings-head"><strong>全局设置</strong><label className="smart-light-toggle"><span>智能模式</span><input type="checkbox" checked={lightSmartMode} onChange={(event) => setLightSmartMode(event.target.checked)} /></label></div>
            {lightSmartMode ? <><label className="smart-light-prompt"><span>打光描述</span><textarea value={lightPrompt} onChange={(event) => setLightPrompt(event.target.value)} placeholder="描述希望呈现的光线方向、时间与氛围" /></label><div className="light-preset-grid">{lightPresets.map(([label, value]) => <button type="button" key={value} className={`light-preset preset-${value} ${lightPreset === value ? 'active' : ''}`} onClick={() => { setLightPreset(value); setLightPrompt(`使用${label}重塑主体光线`) }}><i /><span>{label}</span></button>)}</div></> : <><RangeField label="亮度" value={brightness} min={0} max={100} suffix="%" onChange={setBrightness} /><div className="light-color-row"><span>颜色</span><button type="button" className="light-color-trigger" style={{ '--light-color': lightColor } as CSSProperties} onClick={() => setColorOpen((current) => !current)}><i />{lightColor}<Pipette size={13} /></button>{colorOpen && <div className="light-color-popover"><input type="color" value={lightColor} onChange={(event) => setLightColor(event.target.value)} /><div>{['#ffffff', '#ffd7a6', '#ff9f6e', '#8fc8ff', '#b8a4ff', '#78e0ce'].map((color) => <button key={color} type="button" style={{ background: color }} onClick={() => setLightColor(color)} aria-label={`选择颜色${color}`} />)}</div><label><span>#</span><input value={lightColor.slice(1)} onChange={(event) => setLightColor(`#${event.target.value.replace(/[^0-9a-f]/gi, '').slice(0, 6)}`)} /></label><footer><button type="button" onClick={() => setLightColor('#ffffff')}>清空</button><button type="button" onClick={() => setColorOpen(false)}>确定</button></footer></div>}</div></>}
          </div>
        </div>}
      </div>
      <footer><button type="button" className="tool-cancel" onClick={onClose}>取消</button>{tool === 'multi-angle' && <button type="button" className="tool-cancel" onClick={() => { setAngle(0); setTilt(0); setZoom(100); setWideAngle(false) }}>重置</button>}<button type="button" className="tool-confirm" onClick={confirm}>确认生成 <span className="generation-cost"><span className="chestnut-dot" />6</span></button></footer>
    </section>
  )
}

const promptEditorSpacer = '\u200b'

function promptPlainTextLength(node: Node): number {
  if (node.nodeType === Node.ELEMENT_NODE && (node as Element).hasAttribute('data-prompt-marker-id')) return 0
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replaceAll(promptEditorSpacer, '').length
  return Array.from(node.childNodes).reduce((length, child) => length + promptPlainTextLength(child), 0)
}

function getPromptSelectionOffset(editor: HTMLElement | null) {
  if (!editor) return null
  const selection = window.getSelection()
  if (!selection?.rangeCount || !selection.focusNode || !editor.contains(selection.focusNode)) return null
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.setEnd(selection.focusNode, selection.focusOffset)
  return promptPlainTextLength(range.cloneContents())
}

function restorePromptSelection(editor: HTMLElement | null, offset: number) {
  if (!editor) return
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest('[data-prompt-marker-id]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  let consumed = 0
  let textNode = walker.nextNode() as Text | null
  while (textNode) {
    const raw = textNode.data
    const length = raw.replaceAll(promptEditorSpacer, '').length
    if (offset <= consumed + length) {
      const range = document.createRange()
      const selection = window.getSelection()
      range.setStart(textNode, Math.min(Math.max(offset - consumed, 0), raw.length))
      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)
      return
    }
    consumed += length
    textNode = walker.nextNode() as Text | null
  }
}

function readPromptEditor(editor: HTMLElement) {
  let text = ''
  const offsets = new Map<string, number>()
  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement
      const markerId = element.dataset.promptMarkerId
      if (markerId) {
        offsets.set(markerId, text.length)
        return
      }
      if (element.tagName === 'BR') {
        text += '\n'
        return
      }
    }
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.textContent ?? '').replaceAll(promptEditorSpacer, '')
      return
    }
    node.childNodes.forEach(walk)
  }
  editor.childNodes.forEach(walk)
  return { text, offsets }
}

const cameraControlDefinitions = [
  { key: 'body', label: '相机', options: ['Red V-Raptor', 'ARRI Alexa 35', 'Sony Venice 2'] },
  { key: 'lens', label: '镜头', options: ['Arri Signature Prime', 'Cooke S8/i', 'Zeiss Supreme'] },
  { key: 'focalLength', label: '焦段', options: ['24mm', '35mm', '50mm', '85mm'] },
  { key: 'aperture', label: '光圈', options: ['f/2', 'f/2.8', 'f/4', 'f/5.6'] },
] as const

function CameraScrollWheel({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (value: string) => void }) {
  const currentIndex = Math.max(options.indexOf(value), 0)
  const selectOffset = (offset: number) => onChange(options[(currentIndex + offset + options.length) % options.length])
  return (
    <section className="camera-scroll-control" aria-label={`${label}滚动选择`}>
      <header><Camera size={14} /><span>{label}</span></header>
      <button type="button" className="camera-wheel-arrow" aria-label={`上一项${label}`} onClick={() => selectOffset(-1)}><ChevronUp size={14} /></button>
      <div className="camera-scroll-wheel" tabIndex={0} role="spinbutton" aria-label={label} aria-valuetext={value} onWheel={(event) => { event.preventDefault(); selectOffset(event.deltaY > 0 ? 1 : -1) }} onKeyDown={(event) => { if (event.key === 'ArrowUp') { event.preventDefault(); selectOffset(-1) }; if (event.key === 'ArrowDown') { event.preventDefault(); selectOffset(1) } }}>
        <span>{options[(currentIndex - 1 + options.length) % options.length]}</span>
        <strong>{value}</strong>
        <span>{options[(currentIndex + 1) % options.length]}</span>
      </div>
      <button type="button" className="camera-wheel-arrow" aria-label={`下一项${label}`} onClick={() => selectOffset(1)}><ChevronDown size={14} /></button>
    </section>
  )
}

function CameraControlPanel({ value, onChange, onSave }: { value: ImageGenerationParams['camera']; onChange: (value: ImageGenerationParams['camera']) => void; onSave: () => void }) {
  return (
    <div className="camera-control-panel">
      <header><div><Camera size={16} /><strong>摄影机控制</strong></div><button type="button" onClick={onSave}>保存</button></header>
      <div className="camera-scroll-grid">
        {cameraControlDefinitions.map((control) => <CameraScrollWheel key={control.key} label={control.label} options={control.options} value={value[control.key]} onChange={(next) => onChange({ ...value, [control.key]: next })} />)}
      </div>
    </div>
  )
}

function GeneratedImagePrompt({ id, data }: { id: string; data: CanvasNodeData }) {
  const { regenerateImage, notify, updateNode, beginReferenceSelection, beginMarkerSelection, updatePromptMarker, hoverPromptMarker } = useCanvasActions()
  const [draft, setDraft] = useState(data.localPrompt ?? data.promptHistory?.[0] ?? '')
  const [quickReferenceOpen, setQuickReferenceOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [paramsOpen, setParamsOpen] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const modelButtonRef = useRef<HTMLButtonElement>(null)
  const paramsButtonRef = useRef<HTMLButtonElement>(null)
  const styleButtonRef = useRef<HTMLButtonElement>(null)
  const cameraButtonRef = useRef<HTMLButtonElement>(null)
  const advancedButtonRef = useRef<HTMLButtonElement>(null)
  const promptEditorRef = useRef<HTMLDivElement>(null)
  const promptComposerRef = useRef<HTMLDivElement>(null)
  const restorePromptOffsetRef = useRef<number | null>(null)
  const params = data.imageGeneration ?? defaultImageGeneration
  const setParams = (patch: Partial<ImageGenerationParams>) => updateNode(id, { imageGeneration: { ...params, ...patch } })
  useQuickReferenceDismiss(quickReferenceOpen, () => setQuickReferenceOpen(false), promptComposerRef)

  const promptContent = useMemo(() => {
    const parts: ReactNode[] = []
    let cursor = 0
    const markers = [...(data.promptMarkers ?? [])].sort((left, right) => (left.promptOffset ?? draft.length) - (right.promptOffset ?? draft.length))
    markers.forEach((marker) => {
      const offset = Math.min(Math.max(marker.promptOffset ?? draft.length, cursor), draft.length)
      if (offset > cursor) parts.push(<span key={`text-${cursor}-${offset}`} className="prompt-text-segment">{draft.slice(cursor, offset)}</span>)
      parts.push(<span key={marker.id} className="prompt-marker-token" data-prompt-marker-id={marker.id} contentEditable={false} onMouseEnter={() => hoverPromptMarker(marker.id)} onMouseLeave={() => hoverPromptMarker(null)} onDoubleClick={() => { const next = window.prompt('重命名焦点', marker.label); if (next?.trim()) updatePromptMarker(id, marker.id, next.trim()) }}><i>@</i>{marker.label}<button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => updatePromptMarker(id, marker.id)} aria-label={`删除${marker.label}`}><X size={11} /></button></span>)
      cursor = offset
    })
    const tail = draft.slice(cursor)
    parts.push(<span key="prompt-tail" className="prompt-text-segment prompt-text-tail" data-placeholder="描述画面，输入 @ 引用资产">{tail || promptEditorSpacer}</span>)
    return parts
  }, [data.promptMarkers, draft, hoverPromptMarker, id, updatePromptMarker])

  useEffect(() => setDraft(data.localPrompt ?? data.promptHistory?.[0] ?? ''), [data.localPrompt, data.promptHistory])
  useLayoutEffect(() => {
    if (restorePromptOffsetRef.current === null || document.activeElement !== promptEditorRef.current) return
    restorePromptSelection(promptEditorRef.current, restorePromptOffsetRef.current)
    restorePromptOffsetRef.current = null
  }, [data.promptMarkers, draft])

  const syncPromptEditor = () => {
    const editor = promptEditorRef.current
    if (!editor) return
    const selectionOffset = getPromptSelectionOffset(editor) ?? draft.length
    const next = readPromptEditor(editor)
    const nextMarkers = (data.promptMarkers ?? [])
      .filter((marker) => next.offsets.has(marker.id))
      .map((marker) => ({ ...marker, promptOffset: next.offsets.get(marker.id)! }))
    restorePromptOffsetRef.current = selectionOffset
    setDraft(next.text)
    updateNode(id, { localPrompt: next.text, promptMarkers: nextMarkers })
    if (next.text.endsWith('@')) setQuickReferenceOpen(true)
  }

  const selectPromptAsset = (asset: PromptAssetReference) => {
    const nextDraft = draft.replace(/@\s*$/, '')
    const nextAssets = [...(data.promptAssets ?? []).filter((item) => item.id !== asset.id), asset]
    setDraft(nextDraft)
    updateNode(id, { localPrompt: nextDraft, promptAssets: nextAssets })
    setQuickReferenceOpen(false)
  }

  return (
    <section className="image-prompt-panel image-generation-config generation-config-shell node-panel advanced-image-prompt zoom-stable-ui nodrag nowheel" aria-label="图片生成 Prompt">
      <div className="image-prompt-actions image-reference-row generation-reference-row">
        <IconAction label="焦点编辑" className="image-prompt-action video-reference-tool" onClick={() => beginMarkerSelection(id)}><WandSparkles size={15} /></IconAction>
        <ReferenceStrip targetId={id} references={data.references} onAdd={() => beginReferenceSelection(id)} />
      </div>
      <div ref={promptComposerRef} className="image-prompt-composer generation-prompt-composer">
        <PromptAssetTray assets={data.promptAssets} onRemove={(assetId) => updateNode(id, { promptAssets: (data.promptAssets ?? []).filter((asset) => asset.id !== assetId) })} />
        <div ref={promptEditorRef} className={`prompt-rich-editor ${draft.trim() ? '' : 'is-empty'}`} role="textbox" aria-label="图片 Prompt" aria-multiline="true" contentEditable suppressContentEditableWarning onInput={syncPromptEditor}>{promptContent}</div>
        <span className="video-prompt-count">{draft.length} / 3000</span>
        {params.webSearch && <span className="search-mock-badge" title="来源：Node 素材库、公开摄影集、城市光影样例" aria-label="Mock 资料 3 条，来源为 Node 素材库、公开摄影集和城市光影样例"><Globe2 size={12} />Mock 资料 3 条</span>}
        <QuickReferenceMenu open={quickReferenceOpen} onClose={() => setQuickReferenceOpen(false)} onSelect={selectPromptAsset} />
      </div>
      <footer className="image-config-footer generation-config-footer">
        <button ref={modelButtonRef} type="button" className="image-config-trigger generation-config-trigger model-trigger" onClick={() => { setModelOpen((open) => !open); setParamsOpen(false); setStyleOpen(false); setCameraOpen(false); setAdvancedOpen(false) }} aria-expanded={modelOpen}><ImageIcon size={14} /><span>Seedream 3.0</span><ChevronDown size={12} /></button>
        <AnchoredPopover anchorRef={modelButtonRef} open={modelOpen} onClose={() => setModelOpen(false)} className="video-model-popover image-model-popover" align="start" placement="top"><div role="menu" aria-label="选择图片模型"><header><strong>选择模型</strong><small>当前原型可用模型</small></header><button type="button" className="active" onClick={() => setModelOpen(false)}><span className="video-model-logo"><ImageIcon size={16} /></span><span><strong>Seedream 3.0</strong><small>通用图片生成与编辑</small></span><em>默认</em><Check size={15} /></button></div></AnchoredPopover>
        <button ref={paramsButtonRef} type="button" className="image-config-trigger generation-config-trigger params-trigger" onClick={() => { setParamsOpen((open) => !open); setModelOpen(false); setStyleOpen(false); setCameraOpen(false); setAdvancedOpen(false) }} aria-expanded={paramsOpen}><SlidersHorizontal size={14} /><span>{params.ratio === 'auto' ? '智能' : params.ratio} · {params.resolution} · {params.count}张</span><ChevronDown size={12} /></button>
        <AnchoredPopover anchorRef={paramsButtonRef} open={paramsOpen} onClose={() => setParamsOpen(false)} className="image-params-popover video-params-popover" align="start" placement="top"><div aria-label="图片生成参数"><fieldset><legend>选择比例</legend><div className="video-option-grid ratios image-ratio-options">{(['auto', '1:1', '9:16', '16:9', '3:2', '2:3', '3:4', '4:3', '21:9'] as const).map((ratio) => <button type="button" key={ratio} className={params.ratio === ratio ? 'active' : ''} onClick={() => setParams({ ratio })}><span className={`ratio-shape ratio-${ratio.replace(':', '-')}`} />{ratio === 'auto' ? '智能' : ratio}</button>)}</div></fieldset><fieldset><legend>选择分辨率</legend><div className="video-option-grid image-resolution-options">{(['1K', '2K', '4K'] as const).map((resolution) => <button type="button" key={resolution} className={params.resolution === resolution ? 'active' : ''} onClick={() => setParams({ resolution })}>{resolution}</button>)}</div></fieldset><fieldset><legend>选择生成数量</legend><div className="video-option-grid four">{([1, 2, 3, 4] as const).map((count) => <button type="button" key={count} className={params.count === count ? 'active' : ''} onClick={() => setParams({ count })}>{count}张</button>)}</div></fieldset></div></AnchoredPopover>
        <button ref={styleButtonRef} type="button" className="image-config-trigger generation-config-trigger style-trigger" onClick={() => { setStyleOpen((open) => !open); setModelOpen(false); setParamsOpen(false); setCameraOpen(false); setAdvancedOpen(false) }} aria-expanded={styleOpen}><Grid3X3 size={13} /><span>{params.stylePreset ? imageStylePresets.find((preset) => preset.id === params.stylePreset)?.name : '风格'}</span><ChevronDown size={12} /></button>
        <AnchoredPopover anchorRef={styleButtonRef} open={styleOpen} onClose={() => setStyleOpen(false)} className="style-picker-popover" align="start" placement="top"><div><header><strong>风格</strong></header><nav>{([['all', '全部'], ['lighting', '光影构图'], ['anime', '动漫'], ['illustration', '插画'], ['painting', '油画'], ['contemporary', '现当代']] as const).map(([value, label]) => <button type="button" key={value} className={params.styleCategory === value ? 'active' : ''} onClick={() => setParams({ styleCategory: value })}>{label}</button>)}</nav><div className="style-preset-grid">{imageStylePresets.filter((preset) => params.styleCategory === 'all' || preset.category === params.styleCategory).map((preset) => <button type="button" key={preset.id} className={params.stylePreset === preset.id ? 'active' : ''} onClick={() => { setParams({ stylePreset: preset.id }); setStyleOpen(false) }}><i className={`style-thumb style-${preset.id}`} /><span>{preset.name}</span></button>)}</div></div></AnchoredPopover>
        <button ref={cameraButtonRef} type="button" className="image-config-trigger generation-config-trigger camera-trigger" onClick={() => { setCameraOpen((open) => !open); setModelOpen(false); setParamsOpen(false); setStyleOpen(false); setAdvancedOpen(false) }} aria-expanded={cameraOpen}><Camera size={13} /><span>{params.camera.body}</span><ChevronDown size={12} /></button>
        <AnchoredPopover anchorRef={cameraButtonRef} open={cameraOpen} onClose={() => setCameraOpen(false)} className="camera-popover" align="start" placement="top"><CameraControlPanel value={params.camera} onChange={(camera) => setParams({ camera })} onSave={() => setCameraOpen(false)} /></AnchoredPopover>
        <button ref={advancedButtonRef} type="button" className={`generation-icon-toggle ui-tooltip-control ${params.enhancePrompt || params.webSearch ? 'active' : ''}`} data-tooltip="高级设置" onClick={() => { setAdvancedOpen((open) => !open); setModelOpen(false); setParamsOpen(false); setStyleOpen(false); setCameraOpen(false) }} aria-label="高级设置" aria-expanded={advancedOpen}><SlidersHorizontal size={14} /></button>
        <AnchoredPopover anchorRef={advancedButtonRef} open={advancedOpen} onClose={() => setAdvancedOpen(false)} className="advanced-image-settings" align="end" placement="top"><div><button type="button" className={params.enhancePrompt ? 'active' : ''} onClick={() => setParams({ enhancePrompt: !params.enhancePrompt })}><span><Sparkles size={14} />提示词增强</span><i /></button><button type="button" className={params.webSearch ? 'active' : ''} onClick={() => { setParams({ webSearch: !params.webSearch }); if (!params.webSearch) notify('已加载 3 条 Mock 搜索结果') }}><span><Globe2 size={14} />联网搜索</span><i /></button></div></AnchoredPopover>
        <button type="button" className="generation-icon-toggle ui-tooltip-control" data-tooltip="翻译 Prompt" onClick={() => notify('已翻译 Prompt（Mock）')} aria-label="翻译 Prompt"><Languages size={15} /></button>
        <button type="button" className="generation-icon-toggle ui-tooltip-control" data-tooltip="快捷引用资产" onClick={() => setQuickReferenceOpen(true)} aria-label="快捷引用资产"><span>@</span></button>
        <span className="panel-spacer" />
        <span className="generation-cost"><span className="chestnut-dot" />18</span>
        <button type="button" className="generate-button" onClick={() => regenerateImage(id, draft, params)} disabled={data.status === 'queued' || data.status === 'running' || (!draft.trim() && !(data.references?.length) && !(data.promptMarkers?.length) && !(data.promptAssets?.length))} aria-label={data.status === 'queued' || data.status === 'running' ? '图片生成中' : '重新生成图片'}><ArrowUp size={17} /></button>
      </footer>
    </section>
  )
}

function ImageToolbar({ id, data, activeTool, onTool, onExpand }: { id: string; data: CanvasNodeData; activeTool: Exclude<ImageOperation, 'prompt-regenerate'> | null; onTool: (tool: Exclude<ImageOperation, 'prompt-regenerate'>) => void; onExpand: () => void }) {
  const { notify, createImageDerivative, prepareImageEditor, prepareImageUpscale } = useCanvasActions()
  const verifySeedance = useSeedanceCompliance(id)
  const [moreOpen, setMoreOpen] = useState(false)
  const [gridOpen, setGridOpen] = useState(false)
  const [gridHover, setGridHover] = useState({ columns: 2, rows: 2 })
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const primaryTools: Array<{ id: Exclude<ImageOperation, 'prompt-regenerate'>; label: string; icon: React.ReactNode }> = [
    { id: 'crop', label: '裁剪', icon: <Crop size={15} /> },
    { id: 'multi-angle', label: '多角度', icon: <RotateCw size={15} /> },
    { id: 'repaint', label: '重绘', icon: <Brush size={15} /> },
    { id: 'relight', label: '打光', icon: <Lightbulb size={15} /> },
  ]
  const moreTools: Array<{ id: Exclude<ImageOperation, 'prompt-regenerate'>; label: string; icon: React.ReactNode }> = [
    { id: 'rotate', label: '旋转', icon: <RotateCw size={14} /> },
    { id: 'edit-text', label: '编辑文字', icon: <Type size={14} /> },
    { id: 'annotate', label: '标注', icon: <Brush size={14} /> },
    { id: 'expand', label: '智能扩图', icon: <Maximize2 size={14} /> },
    { id: 'upscale', label: '图片高清', icon: <Sparkles size={14} /> },
  ]
  const canContinueEditing = (data.imageOperation?.operation === 'image-editor' || data.imageOperation?.operation === 'image-compose')
    && Boolean(data.imageOperation.editorComposition)

  if (canContinueEditing) {
    const download = imageDownloadSource(data)
    return (
      <div className="image-toolbar media-toolbar image-editor-result-toolbar zoom-stable-ui nodrag" role="toolbar" aria-label="图片编辑器工具">
        <IconAction label="下载图片" onClick={() => { startDownload(`${data.title}.${download.extension}`, download.href); notify('已开始下载') }}><Download size={15} /></IconAction>
        <IconAction label="全屏预览" onClick={onExpand}><Expand size={15} /></IconAction>
      </div>
    )
  }

  const createGridResult = (columns: number, rows: number) => {
    createImageDerivative(id, 'grid-split', { operation: 'grid-split', grid: Math.max(columns, rows), gridColumns: columns, gridRows: rows })
    setGridOpen(false)
    setMoreOpen(false)
  }
  const runMoreTool = (tool: Exclude<ImageOperation, 'prompt-regenerate'>) => {
    if (tool === 'upscale') prepareImageUpscale(id)
    else if (tool === 'rotate' || tool === 'edit-text') prepareImageEditor(id, tool)
    else onTool(tool)
    setMoreOpen(false)
  }

  return (
    <div className="image-toolbar media-toolbar zoom-stable-ui nodrag" role="toolbar" aria-label="图片节点工具">
      {primaryTools.map((tool) => <button type="button" key={tool.id} className={`tool-button ${activeTool === tool.id ? 'active' : ''}`} onClick={() => onTool(tool.id)} title={tool.label}>{tool.icon}<span>{tool.label}</span></button>)}
      <div className="more-control"><button ref={moreButtonRef} type="button" className={`tool-button icon-only-tool ${activeTool && moreTools.some((tool) => tool.id === activeTool) ? 'active' : ''}`} onClick={() => { setMoreOpen((current) => !current); setGridOpen(false) }} title="更多图片工具" aria-label="更多图片工具"><MoreHorizontal size={16} /></button><AnchoredPopover anchorRef={moreButtonRef} open={moreOpen} onClose={() => { setMoreOpen(false); setGridOpen(false) }} className={`toolbar-menu image-more-menu ${gridOpen ? 'show-grid-picker' : ''}`}><div className="image-more-menu-layout"><div role="menu">{moreTools.slice(0, 3).map((tool) => <button type="button" key={tool.id} onClick={() => runMoreTool(tool.id)}>{tool.icon}{tool.label}</button>)}<button type="button" className={gridOpen ? 'active' : ''} onMouseEnter={() => setGridOpen(true)} onClick={() => setGridOpen(true)}><Grid3X3 size={14} />快速切分<span className="menu-disclosure">›</span></button>{moreTools.slice(3).map((tool) => <button type="button" key={tool.id} onClick={() => runMoreTool(tool.id)}>{tool.icon}{tool.label}</button>)}<button type="button" className="seedance-compliance-menu-item" onClick={() => { setMoreOpen(false); verifySeedance() }}><ShieldCheck size={14} />Seedance 2.0 合规验证</button></div>{gridOpen && <section className="quick-grid-picker" aria-label="快速切分规格"><strong>快速切分</strong><div className="quick-grid-cells">{Array.from({ length: 64 }, (_, index) => { const column = index % 8 + 1; const row = Math.floor(index / 8) + 1; return <button type="button" key={index} className={column <= gridHover.columns && row <= gridHover.rows ? 'active' : ''} onMouseEnter={() => setGridHover({ columns: column, rows: row })} onClick={() => createGridResult(column, row)} aria-label={`${column}乘${row}切分`} /> })}</div><span>{gridHover.columns} × {gridHover.rows}</span><small>悬停预览，点击直接生成切分结果</small></section>}</div></AnchoredPopover></div>
      <span className="toolbar-divider" />
      <PinControl id={id} value={data.pinColor} />
      <IconAction label="下载图片" onClick={() => { const download = imageDownloadSource(data); startDownload(`${data.title}.${download.extension}`, download.href); notify('已开始下载') }}><Download size={15} /></IconAction>
      <IconAction label="全屏预览" onClick={onExpand}><Expand size={15} /></IconAction>
    </div>
  )
}

function RotationNodeEditor({ id, data }: { id: string; data: CanvasNodeData }) {
  const { updateNode, completeImageEditor, cancelPendingImageEditor } = useCanvasActions()
  const result = data.imageOperation ?? { operation: 'rotate' as const }
  const angle = result.angle ?? 0
  const flipHorizontal = result.flipHorizontal ?? false
  const flipVertical = result.flipVertical ?? false
  const updateTransform = (patch: Partial<ImageOperationResult>) => updateNode(id, { imageOperation: { ...result, operation: 'rotate', ...patch } })
  const rotate = (delta: number) => updateTransform({ angle: (angle + delta + 360) % 360 })
  return (
    <section className="rotation-node-editor zoom-stable-ui nodrag nowheel" aria-label="旋转编辑">
      <button type="button" aria-label="取消旋转编辑" title="取消" onClick={() => cancelPendingImageEditor(id)}><X size={15} /></button>
      <strong>{angle}°</strong>
      <button type="button" aria-label="逆时针旋转 90 度" title="逆时针旋转 90 度" onClick={() => rotate(-90)}><RotateCcw size={15} /></button>
      <button type="button" aria-label="顺时针旋转 90 度" title="顺时针旋转 90 度" onClick={() => rotate(90)}><RotateCw size={15} /></button>
      <span className="rotation-divider" />
      <button type="button" className={flipHorizontal ? 'active' : ''} aria-label="水平镜像" title="水平镜像" onClick={() => updateTransform({ flipHorizontal: !flipHorizontal })}><FlipHorizontal2 size={15} /></button>
      <button type="button" className={flipVertical ? 'active' : ''} aria-label="垂直镜像" title="垂直镜像" onClick={() => updateTransform({ flipVertical: !flipVertical })}><FlipVertical2 size={15} /></button>
      <button type="button" className="rotation-confirm" onClick={() => completeImageEditor(id, { angle, flipHorizontal, flipVertical })}><Check size={14} /><span>确认</span></button>
    </section>
  )
}

function ImageTextEditPanel({ id, data }: { id: string; data: CanvasNodeData }) {
  const { completeImageEditor, cancelPendingImageEditor } = useCanvasActions()
  const [layers, setLayers] = useState<string[]>(data.imageOperation?.textLayers ?? [])

  useEffect(() => setLayers(data.imageOperation?.textLayers ?? []), [data.imageOperation?.textLayers])

  const updateLayer = (index: number, value: string) => setLayers((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))
  const deleteLayer = (index: number) => setLayers((current) => current.filter((_item, itemIndex) => itemIndex !== index))

  return (
    <section className="text-edit-panel node-panel zoom-stable-ui nodrag nowheel" aria-label="编辑图片文字">
      <header><div><Type size={15} /><strong>编辑文字</strong></div><span>已识别 {layers.length} 处</span></header>
      <div className="text-edit-layers">
        {layers.length ? layers.map((layer, index) => <div className="text-edit-layer" key={index}><span>{index + 1}</span><input aria-label={`第 ${index + 1} 处图片文字`} value={layer} onChange={(event) => updateLayer(index, event.target.value)} /><button type="button" aria-label={`删除第 ${index + 1} 处图片文字`} title="删除文字" onClick={() => deleteLayer(index)}><X size={14} /></button></div>) : <p>未识别到可编辑文字</p>}
      </div>
      <footer><button type="button" onClick={() => cancelPendingImageEditor(id)}>取消</button><button type="button" className="text-edit-confirm" onClick={() => completeImageEditor(id, { textLayers: layers })}><Check size={14} />保存</button></footer>
    </section>
  )
}

type AnnotationTool = 'brush' | 'box' | 'eraser' | 'text'

function AnnotationOverlay({ marks }: { marks: AnnotationMark[] }) {
  return (
    <svg className="image-annotation-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {marks.map((mark) => {
        if (mark.kind === 'brush') {
          if (mark.points.length === 1) return <circle key={mark.id} cx={mark.points[0].x} cy={mark.points[0].y} r={Math.max(mark.size * .16, 1)} fill={mark.color} />
          return <path key={mark.id} d={`M ${mark.points.map((point) => `${point.x} ${point.y}`).join(' L ')}`} fill="none" stroke={mark.color} strokeWidth={Math.max(mark.size * .34, 1)} strokeLinecap="round" strokeLinejoin="round" />
        }
        if (mark.kind === 'box') return <rect key={mark.id} x={mark.x} y={mark.y} width={mark.width} height={mark.height} fill="transparent" stroke={mark.color} strokeWidth="1.2" rx="1.5" />
        return <text key={mark.id} x={mark.x} y={mark.y} fill={mark.color} fontSize="5" fontWeight="700" dominantBaseline="middle">{mark.text}</text>
      })}
    </svg>
  )
}

function annotationPoint(event: React.PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  return {
    x: Math.min(Math.max((event.clientX - rect.left) / rect.width * 100, 0), 100),
    y: Math.min(Math.max((event.clientY - rect.top) / rect.height * 100, 0), 100),
  }
}

function annotationHit(mark: AnnotationMark, point: { x: number; y: number }) {
  if (mark.kind === 'box') return point.x >= mark.x - 2 && point.x <= mark.x + mark.width + 2 && point.y >= mark.y - 2 && point.y <= mark.y + mark.height + 2
  if (mark.kind === 'text') return Math.abs(point.x - mark.x) <= 10 && Math.abs(point.y - mark.y) <= 6
  return mark.points.some((item) => Math.hypot(item.x - point.x, item.y - point.y) <= Math.max(mark.size * .45, 3))
}

function useWindowSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return size
}

function numericAspectRatio(value: string) {
  const match = value.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/)
  if (!match) return 16 / 10
  const width = Number(match[1])
  const height = Number(match[2])
  return width > 0 && height > 0 ? width / height : 16 / 10
}

function ImageAnnotationEditor({ id, data, onClose }: { id: string; data: CanvasNodeData; onClose: () => void }) {
  const { createImageDerivative } = useCanvasActions()
  const viewport = useWindowSize()
  const [tool, setTool] = useState<AnnotationTool>('brush')
  const [brushSize, setBrushSize] = useState(14)
  const [text, setText] = useState('文字标注')
  const [marks, setMarks] = useState<AnnotationMark[]>([])
  const [past, setPast] = useState<AnnotationMark[][]>([])
  const [future, setFuture] = useState<AnnotationMark[][]>([])
  const [draftBox, setDraftBox] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null)
  const marksRef = useRef<AnnotationMark[]>([])
  const drawingRef = useRef<{ id: string; before: AnnotationMark[] } | null>(null)

  const replaceMarks = (next: AnnotationMark[], record = true) => {
    if (record) {
      setPast((current) => [...current, marksRef.current])
      setFuture([])
    }
    marksRef.current = next
    setMarks(next)
  }

  const undo = () => {
    const previous = past[past.length - 1]
    if (!previous) return
    setPast((current) => current.slice(0, -1))
    setFuture((current) => [marksRef.current, ...current])
    marksRef.current = previous
    setMarks(previous)
  }

  const redo = () => {
    const next = future[0]
    if (!next) return
    setFuture((current) => current.slice(1))
    setPast((current) => [...current, marksRef.current])
    marksRef.current = next
    setMarks(next)
  }

  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const point = annotationPoint(event)
    if (tool === 'eraser') {
      const index = marksRef.current.reduce((latest, mark, markIndex) => annotationHit(mark, point) ? markIndex : latest, -1)
      if (index >= 0) replaceMarks(marksRef.current.filter((_mark, markIndex) => markIndex !== index))
      return
    }
    if (tool === 'text') {
      replaceMarks([...marksRef.current, { id: `annotation-text-${Date.now()}`, kind: 'text', x: point.x, y: point.y, text: text.trim() || '文字标注', color: '#ff473d' }])
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (tool === 'box') {
      drawingRef.current = { id: `annotation-box-${Date.now()}`, before: marksRef.current }
      setDraftBox({ start: point, end: point })
      return
    }
    const id = `annotation-brush-${Date.now()}`
    const before = marksRef.current
    drawingRef.current = { id, before }
    replaceMarks([...before, { id, kind: 'brush', points: [point], size: brushSize, color: '#ff473d' }], false)
  }

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return
    const point = annotationPoint(event)
    if (tool === 'box') {
      setDraftBox((current) => current ? { ...current, end: point } : current)
      return
    }
    const next = marksRef.current.map((mark) => mark.id === drawingRef.current?.id && mark.kind === 'brush' ? { ...mark, points: [...mark.points, point] } : mark)
    replaceMarks(next, false)
  }

  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return
    const drawing = drawingRef.current
    if (tool === 'box' && draftBox) {
      const x = Math.min(draftBox.start.x, draftBox.end.x)
      const y = Math.min(draftBox.start.y, draftBox.end.y)
      const width = Math.abs(draftBox.end.x - draftBox.start.x)
      const height = Math.abs(draftBox.end.y - draftBox.start.y)
      if (width > 1 && height > 1) replaceMarks([...marksRef.current, { id: drawing.id, kind: 'box', x, y, width, height, color: '#ff473d' }], false)
      setDraftBox(null)
    }
    setPast((current) => [...current, drawing.before])
    setFuture([])
    drawingRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const save = () => {
    createImageDerivative(id, 'annotate', { operation: 'annotate', annotations: marksRef.current })
    onClose()
  }

  const draftStyle = draftBox ? {
    left: `${Math.min(draftBox.start.x, draftBox.end.x)}%`,
    top: `${Math.min(draftBox.start.y, draftBox.end.y)}%`,
    width: `${Math.abs(draftBox.end.x - draftBox.start.x)}%`,
    height: `${Math.abs(draftBox.end.y - draftBox.start.y)}%`,
  } : undefined
  const stageRatio = numericAspectRatio(imageSurfaceRatio(data))
  const availableWidth = Math.max(280, viewport.width - 32)
  const availableHeight = Math.max(220, viewport.height - 118)
  const stageWidth = Math.min(availableWidth, availableHeight * stageRatio)
  const stageSize = { width: stageWidth, height: stageWidth / stageRatio }

  return createPortal(
    <div className="image-annotation-editor" data-canvas-overlay="true" role="dialog" aria-modal="true" aria-label="图片标注">
      <header><div><ImageIcon size={18} /><strong>{data.title}</strong></div><button type="button" aria-label="关闭标注编辑" onClick={onClose}><X size={17} /></button></header>
      <div className="annotation-toolbar" role="toolbar" aria-label="标注工具">
        <button type="button" className={tool === 'brush' ? 'active' : ''} aria-label="笔刷" title="笔刷" onClick={() => setTool('brush')}><Brush size={16} /></button>
        <button type="button" className={tool === 'box' ? 'active' : ''} aria-label="框选" title="框选" onClick={() => setTool('box')}><Crop size={16} /></button>
        <button type="button" className={tool === 'eraser' ? 'active' : ''} aria-label="橡皮擦" title="橡皮擦" onClick={() => setTool('eraser')}><Eraser size={16} /></button>
        <button type="button" className={tool === 'text' ? 'active' : ''} aria-label="文字标注" title="文字标注" onClick={() => setTool('text')}><Type size={16} /></button>
        <span className="annotation-color" title="标注颜色" aria-label="标注颜色" />
        <label className="annotation-size"><span className="sr-only">笔刷大小</span><input aria-label="笔刷大小" type="range" min="4" max="36" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label>
        <button type="button" aria-label="撤销标注" title="撤销" onClick={undo} disabled={!past.length}><Undo2 size={15} /></button>
        <button type="button" aria-label="重做标注" title="重做" onClick={redo} disabled={!future.length}><Redo2 size={15} /></button>
        <label className="annotation-text-field"><span className="sr-only">文字标注文案</span><input value={text} onChange={(event) => setText(event.target.value)} placeholder="文字标注" /></label>
        <button type="button" className="annotation-save" onClick={save}><Check size={15} />保存</button>
      </div>
      <div className={`annotation-stage annotation-${tool}`} style={stageSize} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <div className="annotation-source" style={{ backgroundImage: `url(${assetUrl(data)})` }} />
        <AnnotationOverlay marks={marks} />
        {draftBox && <span className="annotation-draft-box" style={draftStyle} />}
      </div>
    </div>,
    document.body,
  )
}

function operationStyle(data: CanvasNodeData): CSSProperties {
  const result = data.imageOperation
  if (!result) return {}
  const angle = result.angle ?? 0
  const tilt = result.tilt ?? 0
  const zoom = (result.zoom ?? 100) / 100
  const brightness = 1 + (result.brightness ?? 0) / 100
  const warmth = Math.max(0, result.temperature ?? 0)
  const quarterTurn = result.operation === 'rotate' && isQuarterTurn(angle)
  const flipHorizontal = result.flipHorizontal ? -1 : 1
  const flipVertical = result.flipVertical ? -1 : 1
  return {
    transform: `${quarterTurn ? 'translate(-50%, -50%) ' : ''}rotate(${angle}deg) skewX(${tilt}deg) scale(${zoom}) scaleX(${flipHorizontal}) scaleY(${flipVertical})`,
    filter: `brightness(${brightness}) sepia(${warmth / 180}) saturate(${1 + warmth / 180})`,
  }
}

function imageSurfaceRatio(data: CanvasNodeData) {
  const result = data.imageOperation
  const composition = result?.editorComposition
  if (!(data.content ?? '').trim() && !data.media?.url && !composition?.renderedDataUrl) return '4 / 3'
  if (result?.operation === 'grid-split') {
    const columns = result.gridColumns ?? result.grid ?? 1
    const rows = result.gridRows ?? result.grid ?? 1
    return `${16 * rows} / ${10 * columns}`
  }
  if (result?.operation === 'rotate' && isQuarterTurn(result.angle)) return '10 / 16'
  if (data.media?.width && data.media.height) return `${data.media.width} / ${data.media.height}`
  if (composition?.width && composition.height) return `${composition.width} / ${composition.height}`
  const ratio = result?.aspectRatio
  return ratio && /^\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?$/.test(ratio) ? ratio.replace(':', ' / ') : '16 / 10'
}

function ImageVisual({ data }: { data: CanvasNodeData }) {
  const result = data.imageOperation
  const gridColumns = result?.operation === 'grid-split' ? result.gridColumns ?? result.grid ?? 2 : null
  const gridRows = result?.operation === 'grid-split' ? result.gridRows ?? result.grid ?? 2 : null
  if (gridColumns && gridRows) {
    const slice = buildGridSlices(gridColumns, gridRows)[result?.gridIndex ?? 0]
    return <div className="image-grid-slice" style={{ backgroundImage: `url(${assetUrl(data)})`, backgroundSize: slice.backgroundSize, backgroundPosition: slice.backgroundPosition }} aria-label={`${gridColumns}乘${gridRows}宫格第${slice.row + 1}行第${slice.column + 1}列`} />
  }
  if (result?.operation === 'expand' && result.expandRect) {
    const frame = result.expandRect
    const sourceStyle = {
      left: `${(EXPAND_SOURCE_RECT.x - frame.x) / frame.width * 100}%`,
      top: `${(EXPAND_SOURCE_RECT.y - frame.y) / frame.height * 100}%`,
      width: `${EXPAND_SOURCE_RECT.width / frame.width * 100}%`,
      height: `${EXPAND_SOURCE_RECT.height / frame.height * 100}%`,
      backgroundImage: `url(${assetUrl(data)})`,
    }
    return <div className="expanded-image-result"><div className="expanded-image-fill" style={{ backgroundImage: `url(${assetUrl(data)})` }} /><div className="expanded-source-image" style={sourceStyle} /></div>
  }
  if (result?.editorComposition) {
    if (data.media?.url) return <div className="image-art" style={{ backgroundImage: `url(${data.media.url})` }} />
    return <ImageEditorCompositionPreview composition={result.editorComposition} />
  }
  const annotationMarks = result?.operation === 'annotate' ? result.annotations ?? [] : []
  const editedText = result?.operation === 'edit-text' ? result.textLayers?.[0]?.trim() : ''
  const quarterTurn = result?.operation === 'rotate' && isQuarterTurn(result.angle)
  return <>
    <div className={`image-art ${quarterTurn ? 'is-quarter-turn' : ''}`} style={{ backgroundImage: `url(${assetUrl(data)})`, ...operationStyle(data) }} />
    {editedText && <span className="image-text-edit-preview">{editedText}</span>}
    {annotationMarks.length > 0 && <AnnotationOverlay marks={annotationMarks} />}
  </>
}

function UpscaleNodeConfig({ id, data }: { id: string; data: CanvasNodeData }) {
  const { updateNode, completeImageUpscale } = useCanvasActions()
  const [resolution, setResolution] = useState<'2K' | '4K' | '6K'>(data.imageOperation?.resolution ?? '4K')
  const selectResolution = (next: '2K' | '4K' | '6K') => {
    setResolution(next)
    updateNode(id, { imageOperation: { ...(data.imageOperation ?? { operation: 'upscale' }), operation: 'upscale', resolution: next } })
  }
  return <section className="upscale-node-config node-panel zoom-stable-ui nodrag nowheel" aria-label="图片高清配置">
    <header><strong>输出清晰度</strong><span>默认 4K</span></header>
    <div className="resolution-options">{(['2K', '4K', '6K'] as const).map((item) => <button type="button" key={item} className={resolution === item ? 'active' : ''} onClick={() => selectResolution(item)}><strong>{item}</strong></button>)}</div>
    <footer><span className="generation-cost"><span className="chestnut-dot" />6</span><button type="button" className="tool-confirm" onClick={() => completeImageUpscale(id, resolution)}>生成高清图片</button></footer>
  </section>
}

export function MediaErrorState({ error, onRetry }: { error?: string; onRetry: () => void }) {
  return <div className="media-error-state" role="alert">
    <span><RefreshCw size={21} /></span>
    <strong>生成失败</strong>
    <p>{error ?? '生成任务未完成，请稍后重试。'}</p>
    <button type="button" className="nodrag" onClick={onRetry}>重新生成</button>
  </div>
}

function MediaGenerationProgress({ progress }: { progress?: number }) {
  const value = Math.min(99, Math.max(2, Math.round(progress ?? 2)))
  return <div className="media-generation-progress" role="status" aria-label={`生成中 ${value}%`}>
    <strong><ShinyText text={`生成中 ${value}%`} speed={1.7} color="#c7c1ba" shineColor="#ffffff" spread={96} /></strong>
  </div>
}

export const ImageNode = memo(function ImageNode({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const { updateNode, notify, retryGeneration, interactionMode, isInteractionCandidate, addPromptMarker, markersForSource, hoveredPromptMarkerId, hoverPromptMarker, selectedItemCount, isConnectionTargetCandidate, uploadNodeMedia, openImageEditor } = useCanvasActions()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<Exclude<ImageOperation, 'prompt-regenerate'> | null>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const nodeRef = useRef<HTMLElement>(null)
  const overlayVariables = useStableOverlayVariables()
  const pendingUpscale = data.status === 'ready' && data.imageOperation?.operation === 'upscale'
  const isGenerating = data.status === 'queued' || data.status === 'running'
  const hasContent = !pendingUpscale && Boolean((data.content ?? '').trim() || data.media?.url || data.imageOperation?.editorComposition?.renderedDataUrl)
  const isInitialImageEditor = data.imageOperation?.operation === 'image-editor' && !hasContent
  const canContinueEditing = (data.imageOperation?.operation === 'image-editor' || data.imageOperation?.operation === 'image-compose')
    && Boolean(data.imageOperation.editorComposition)
  const focused = selected && selectedItemCount === 1
  const candidate = isConnectionTargetCandidate(id)
  const interactionClass = interactionNodeClass(id, interactionMode, isInteractionCandidate(id))
  const pendingImageEditor = data.status === 'ready' && (data.imageOperation?.operation === 'rotate' || data.imageOperation?.operation === 'edit-text')
  const quarterTurn = data.imageOperation?.operation === 'rotate' && isQuarterTurn(data.imageOperation.angle)
  const showPrompt = focused && !isInitialImageEditor && shouldShowImageGenerationPrompt(data) && !activeTool
  const sourceMarkers = markersForSource(id)
  const visualRatio = imageSurfaceRatio(data)
  const overlaySelector = !focused
    ? null
    : pendingUpscale
      ? '.upscale-node-config'
      : pendingImageEditor
        ? data.imageOperation?.operation === 'rotate' ? '.rotation-node-editor' : '.text-edit-panel'
        : activeTool === 'multi-angle' || activeTool === 'relight'
          ? '.image-tool-panel'
          : showPrompt
            ? '.image-prompt-panel'
            : hasContent
              ? '.image-toolbar'
              : null

  const replaceStarterImage = (file: File) => {
    const url = URL.createObjectURL(file)
    updateNode(id, {
      title: file.name.replace(/\.[^.]+$/, '') || data.title,
      content: file.name,
      sourceKind: 'upload',
      mediaVariant: undefined,
      media: { url, mimeType: file.type || undefined },
      favorite: undefined,
    })
    const probe = new Image()
    probe.onload = () => updateNode(id, { media: { url, mimeType: file.type || undefined, width: probe.naturalWidth, height: probe.naturalHeight } })
    probe.src = url
  }

  useEffect(() => { if (!focused) setActiveTool(null) }, [focused])
  useKeepNodeOverlayInViewport(nodeRef, overlaySelector)

  if (isInitialImageEditor) {
    return (
      <article ref={nodeRef} className={`canvas-node image-node image-editor-node ${selected ? 'is-selected' : ''} ${candidate ? 'is-connection-candidate' : ''} ${interactionClass}`} style={overlayVariables}>
        <ConnectionHandles nodeId={id} source={false} />
        <NodeHeader id={id} data={data} icon={<ImageIcon size={13} />} />
        <div className="node-surface image-surface image-editor-node-surface">
          <div className="image-editor-node-empty">
            <span className="image-editor-node-icon"><ImageIcon size={29} /><Brush size={15} /></span>
            <button type="button" className="image-editor-open-button nodrag" onClick={() => openImageEditor(id)}>打开编辑器</button>
          </div>
        </div>
      </article>
    )
  }

  return (
    <article ref={nodeRef} className={`canvas-node image-node ${selected ? 'is-selected' : ''} ${candidate ? 'is-connection-candidate' : ''} ${hasContent || isGenerating || data.status === 'failed' ? '' : 'is-empty'} ${data.status === 'failed' ? 'has-error' : ''} ${quarterTurn ? 'is-quarter-turn' : ''} ${data.imageGeneration?.stylePreset ? `mock-style-${data.imageGeneration.stylePreset}` : ''} ${interactionClass}`} style={overlayVariables}>
      <ConnectionHandles nodeId={id} />
      {focused && hasContent && !isGenerating && !pendingImageEditor && <ImageToolbar id={id} data={data} activeTool={activeTool} onTool={(tool) => setActiveTool((current) => current === tool ? null : tool)} onExpand={() => setPreviewOpen(true)} />}
      <NodeHeader id={id} data={data} icon={<ImageIcon size={13} />} />
      {focused && !hasContent && !isGenerating && data.status !== 'failed' && !pendingUpscale && canUploadToEmptyMediaNode(data) && <><button type="button" className="empty-node-upload nodrag" onClick={() => uploadInputRef.current?.click()}><Upload size={14} />上传</button><input ref={uploadInputRef} className="sr-only" type="file" accept="image/*" aria-label="上传图片到当前节点" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadNodeMedia(id, file); event.currentTarget.value = '' }} /></>}
      <div className="node-surface image-surface" style={{ aspectRatio: visualRatio }} onClick={(event) => {
        if (interactionMode?.kind === 'marker' && isInteractionCandidate(id)) {
          event.stopPropagation()
          const rect = event.currentTarget.getBoundingClientRect()
          addPromptMarker(interactionMode.targetNodeId, id, Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1), Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1))
          return
        }
        if (!canContinueEditing || !focused || (event.target as HTMLElement).closest('button')) return
        event.stopPropagation()
        openImageEditor(id)
      }}>
        {data.status === 'failed'
          ? <MediaErrorState error={data.error} onRetry={() => retryGeneration(id)} />
            : isGenerating
              ? <MediaGenerationProgress progress={data.progress} />
              : hasContent
            ? <div className="image-preview" role="img" aria-label={data.content ?? data.title}><ImageVisual data={data} />{data.imageOperation?.operation === 'repaint' && <span className="repaint-result-mark" aria-label="重绘区域" />}</div>
            : <div className="empty-media-node"><ImageIcon size={25} />{pendingUpscale ? <strong>图片高清</strong> : <strong className="sr-only">图片</strong>}</div>}
        {hasContent && !isGenerating && canFavoriteMediaNode(data) && <button type="button" className={`image-favorite ${data.favorite ? 'active' : ''} nodrag`} onClick={() => { updateNode(id, { favorite: !data.favorite }); notify(data.favorite ? '已取消收藏' : '已收藏到资产') }} aria-label={data.favorite ? '取消收藏图片' : '收藏图片'} title={data.favorite ? '取消收藏' : '收藏'}><Star size={16} fill={data.favorite ? 'currentColor' : 'none'} /></button>}
        {hasContent && !isGenerating && data.starterReplaceable && <><button type="button" className="image-replace-action nodrag" onClick={(event) => { event.stopPropagation(); replaceInputRef.current?.click() }} aria-label={`替换${data.title}`}><Upload size={13} />替换</button><input ref={replaceInputRef} className="sr-only nodrag" type="file" accept="image/*" aria-label={`选择替换${data.title}`} onChange={(event) => { const file = event.target.files?.[0]; if (file) replaceStarterImage(file); event.currentTarget.value = '' }} /></>}
        {sourceMarkers.map((marker) => <button type="button" key={marker.id} className={`image-focus-hotspot ${hoveredPromptMarkerId === marker.id ? 'active' : ''}`} style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }} onMouseEnter={() => hoverPromptMarker(marker.id)} onMouseLeave={() => hoverPromptMarker(null)} aria-label={marker.label} title={marker.label}>{marker.label}</button>)}
      </div>
      {focused && (activeTool === 'crop' || activeTool === 'repaint' || activeTool === 'expand') && <ImageFocusEditor id={id} data={data} tool={activeTool} onClose={() => setActiveTool(null)} />}
      {focused && activeTool === 'annotate' && <ImageAnnotationEditor id={id} data={data} onClose={() => setActiveTool(null)} />}
      {focused && (activeTool === 'multi-angle' || activeTool === 'relight') && <ImageToolPanel id={id} data={data} tool={activeTool} onClose={() => setActiveTool(null)} />}
      {focused && pendingImageEditor && data.imageOperation?.operation === 'rotate' && <RotationNodeEditor id={id} data={data} />}
      {focused && pendingImageEditor && data.imageOperation?.operation === 'edit-text' && <ImageTextEditPanel id={id} data={data} />}
      {focused && pendingUpscale && <UpscaleNodeConfig id={id} data={data} />}
      {showPrompt && <GeneratedImagePrompt id={id} data={data} />}
      <PreviewOverlay open={previewOpen} onClose={() => setPreviewOpen(false)} id={id} data={data} />
    </article>
  )
})

function ParameterControl({ parameter, value, onChange }: { parameter: ModelParameter; value: string | number | boolean | undefined; onChange: (value: string | number | boolean) => void }) {
  if (parameter.type === 'toggle') return <label className="parameter-toggle nodrag"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><span>{parameter.label}</span></label>
  if (parameter.type === 'number') return <input className="config-number nodrag" aria-label={parameter.label} type="number" value={Number(value ?? parameter.defaultValue)} onChange={(event) => onChange(Number(event.target.value))} />
  return <label className="config-select-wrap nodrag"><span className="sr-only">{parameter.label}</span><select aria-label={parameter.label} value={String(value ?? parameter.defaultValue)} onChange={(event) => { const option = parameter.options?.find((item) => String(item.value) === event.target.value); onChange(option?.value ?? event.target.value) }}>{parameter.options?.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select></label>
}

function VideoReferenceSlot({ label, reference, onSelect }: { label: string; reference?: NodeReference; onSelect: () => void }) {
  return (
    <button type="button" className={`video-reference-slot ${reference ? 'has-reference' : ''}`} onClick={onSelect} aria-label={reference ? `替换${label}参考` : `添加${label}参考`}>
      {reference ? <><img src={referenceAssetUrl(reference)} alt="" /><span className="video-reference-slot-label">{label}</span></> : <Plus size={17} />}
    </button>
  )
}

const builtInSeedanceAssets = [
  { id: 'seedance-host', title: '品牌主播 · 合规', type: 'image' as const, posterUrl: '/node-canvas-prototype/assets/virtual-ip-portrait.jpg' },
  { id: 'seedance-city', title: '樱花城市 · 合规', type: 'image' as const, posterUrl: '/node-canvas-prototype/assets/generated-anime.png' },
  { id: 'seedance-landscape', title: '横屏广告片 · 合规', type: 'video' as const, posterUrl: '/node-canvas-prototype/assets/demo-landscape-video-poster.jpg' },
  { id: 'seedance-voice', title: '品牌女声 · 合规', type: 'audio' as const },
]

function SeedanceLibraryDialog({ data, onClose, onApply }: { data: CanvasNodeData; onClose: () => void; onApply: (ids: string[]) => void }) {
  const { seedanceComplianceAssets, notify } = useCanvasActions()
  const [selected, setSelected] = useState(() => new Set(data.seedanceComplianceAssetIds ?? []))
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'audio'>('all')
  const [uploadType, setUploadType] = useState<'image' | 'video' | 'audio'>('image')
  const [uploadName, setUploadName] = useState('')
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  const canvasAssets = seedanceComplianceAssets.map((node) => ({
    id: `canvas:${node.id}`,
    title: node.data.title,
    type: node.data.nodeType,
    posterUrl: node.data.media?.posterUrl ?? (node.data.nodeType === 'image' ? assetUrl(node.data) : undefined),
  }))
  const assets = [...builtInSeedanceAssets, ...canvasAssets]
    .filter((asset) => filter === 'all' || asset.type === filter)
    .filter((asset) => asset.title.toLowerCase().includes(search.trim().toLowerCase()))
  const selectAsset = (assetId: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(assetId)) next.delete(assetId)
      else next.add(assetId)
      return next
    })
  }
  const confirmUpload = () => {
    if (!uploadName) return notify('请先选择要上传的素材')
    setSelected((current) => new Set([...current, `upload:${uploadType}:${uploadName}`]))
    notify('上传素材已通过本地合规验证并加入选择（Mock）')
  }
  return createPortal(<div className="seedance-library-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="seedance-library-dialog" role="dialog" aria-modal="true" aria-label="Seedance 仿真人合规素材库" onMouseDown={(event) => event.stopPropagation()}>
      <header><span><ShieldCheck size={19} /><strong>Seedance 2.0 合规素材</strong><small>仅已授权、可追溯素材可用于仿真人视频生产</small></span><button type="button" onClick={onClose} aria-label="关闭合规素材库"><X size={18} /></button></header>
      <div className="seedance-library-body">
        <aside className="seedance-upload-panel"><h3>上传合规素材</h3><label><span>素材类型</span><select value={uploadType} onChange={(event) => setUploadType(event.target.value as typeof uploadType)}><option value="image">图片</option><option value="video">视频</option><option value="audio">音频</option></select></label><label className={`seedance-upload-drop ${uploadName ? 'has-file' : ''}`}><Upload size={24} /><strong>{uploadName || '点击选择素材'}</strong><small>图片 JPG/PNG，视频 MP4，音频 MP3/WAV</small><input type="file" accept="image/*,video/*,audio/*" onChange={(event) => setUploadName(event.target.files?.[0]?.name ?? '')} /></label><div className="seedance-upload-rules"><strong>上传规则</strong><p>素材需获得完整肖像、声音与商用授权；审核通过后才会进入合规素材库。</p></div><footer><button type="button" onClick={() => setUploadName('')}>重置</button><button type="button" className="primary" onClick={confirmUpload}>确认上传</button></footer></aside>
        <main className="seedance-library-panel"><div className="seedance-library-heading"><span><strong>Seedance 仿真人合规素材库</strong><small>当前已选择 {selected.size} 项</small></span><label><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索素材" /></label></div><div className="seedance-library-filters">{([['all', '全部'], ['image', '图片'], ['video', '视频'], ['audio', '音频']] as const).map(([value, label]) => <button type="button" key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}<span>按最近使用排序</span></div><div className="seedance-asset-grid">{assets.map((asset) => <article key={asset.id} className={selected.has(asset.id) ? 'selected' : ''}><button type="button" className="seedance-asset-preview" aria-pressed={selected.has(asset.id)} onClick={() => selectAsset(asset.id)}>{asset.posterUrl ? <img src={asset.posterUrl} alt="" /> : <span className="seedance-audio-preview"><Waves size={24} /><i /><i /><i /><i /></span>}<em><ShieldCheck size={12} />合规</em>{selected.has(asset.id) && <b><Check size={14} /></b>}</button><footer><span><strong>{asset.title}</strong><small>{asset.type === 'image' ? '图片' : asset.type === 'video' ? '视频' : '音频'}</small></span><button type="button" title="预览" aria-label={`预览${asset.title}`} onClick={() => notify(`正在预览${asset.title}（Mock）`)}><Play size={13} /></button><button type="button" title="重命名" aria-label={`重命名${asset.title}`} onClick={() => notify('可在素材详情中重命名（Mock）')}><Type size={13} /></button></footer></article>)}</div></main>
      </div>
      <footer className="seedance-dialog-footer"><span>已选择 {selected.size} 项素材</span><div><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" onClick={() => { onApply([...selected]); onClose(); notify(selected.size ? `已使用 ${selected.size} 项合规素材` : '已清空合规素材') }}>确认使用</button></div></footer>
    </section>
  </div>, document.body)
}

function VideoConfig({ id, data }: { id: string; data: CanvasNodeData }) {
  const actions = useCanvasActions() as VideoActionExtensions
  const { updateNode, runGeneration } = actions
  const [quickReferenceOpen, setQuickReferenceOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [paramsOpen, setParamsOpen] = useState(false)
  const [complianceLibraryOpen, setComplianceLibraryOpen] = useState(false)
  const promptComposerRef = useRef<HTMLDivElement>(null)
  const modelButtonRef = useRef<HTMLButtonElement>(null)
  const modeButtonRef = useRef<HTMLButtonElement>(null)
  const paramsButtonRef = useRef<HTMLButtonElement>(null)
  const generation = videoGenerationFor(data)
  const modeId = videoModeFor(data)
  const mode = videoModeOptions.find((item) => item.id === modeId)!
  const model = videoModelCapabilityFor(data.modelId)
  const availableModes = videoModeOptions.filter((item) => model.supportedModes.includes(item.id))
  const busy = data.status === 'queued' || data.status === 'running'
  const references = data.references ?? []
  const roleReference = (role: VideoReferenceRole) => references.find((item) => (item as NodeReference & { role?: VideoReferenceRole }).role === role)
  const beginRoleReference = (role: VideoReferenceRole) => {
    const current = role === 'reference' ? undefined : roleReference(role)
    ;(actions.beginReferenceSelection as (targetId: string, replaceSourceNodeId?: string, referenceRole?: VideoReferenceRole) => void)(id, current?.nodeId, role)
  }
  useQuickReferenceDismiss(quickReferenceOpen, () => setQuickReferenceOpen(false), promptComposerRef)

  const patchGeneration = (patch: Partial<VideoGenerationState>) => updateNode(id, { videoGeneration: { ...generation, ...patch } })
  const selectModel = (nextModel: (typeof videoModelCapabilities)[number]) => {
    const nextMode = nextModel.id === 'seedance-2' ? 'reference' : nextModel.supportedModes.includes(modeId) ? modeId : nextModel.supportedModes[0]
    const normalized = resolveVideoGenerationParams({ ...data, modelId: nextModel.id, videoGeneration: generation })
    updateNode(id, {
      modelId: nextModel.id,
      modeId: nextMode,
      videoGeneration: normalized,
    })
    setModelOpen(false)
  }
  const selectPromptAsset = (asset: PromptAssetReference) => {
    updateNode(id, {
      localPrompt: (data.localPrompt ?? '').replace(/@\s*$/, ''),
      promptAssets: [...(data.promptAssets ?? []).filter((item) => item.id !== asset.id), asset],
    })
    setQuickReferenceOpen(false)
  }

  return (
    <section className="video-config generation-config-shell node-panel zoom-stable-ui nodrag nowheel" aria-label="视频生成配置">
      <div className={`video-reference-row generation-reference-row mode-${modeId} ${model.id === 'seedance-2' ? 'has-seedance-library' : ''}`}>
        <IconAction label="焦点编辑" className="video-reference-tool" onClick={() => actions.beginMarkerSelection(id)}><WandSparkles size={16} /></IconAction>
        {modeId === 'first-frame' && <VideoReferenceSlot label="首帧" reference={roleReference('first-frame')} onSelect={() => beginRoleReference('first-frame')} />}
        {modeId === 'first-last-frame' && <><VideoReferenceSlot label="首帧" reference={roleReference('first-frame')} onSelect={() => beginRoleReference('first-frame')} /><VideoReferenceSlot label="尾帧" reference={roleReference('last-frame')} onSelect={() => beginRoleReference('last-frame')} /></>}
        {modeId === 'reference' && <ReferenceStrip targetId={id} references={references.filter((item) => (item as NodeReference & { role?: VideoReferenceRole }).role === 'reference' || !(item as NodeReference & { role?: VideoReferenceRole }).role)} onAdd={() => beginRoleReference('reference')} addLabel="全能参考" />}
        {model.id === 'seedance-2' && <button type="button" className={`seedance-library-slot ui-tooltip-control ${(data.seedanceComplianceAssetIds?.length ?? 0) > 0 ? 'has-assets' : ''}`} data-tooltip="SD 合规素材库" onClick={() => setComplianceLibraryOpen(true)} aria-label={data.seedanceComplianceAssetIds?.length ? `打开 SD 合规素材库，已选择 ${data.seedanceComplianceAssetIds.length} 项` : '打开 SD 合规素材库'}><ShieldCheck size={17} />{(data.seedanceComplianceAssetIds?.length ?? 0) > 0 && <Check size={11} className="seedance-library-selected-mark" />}</button>}
      </div>
      <div ref={promptComposerRef} className="video-prompt-composer generation-prompt-composer">
        <PromptAssetTray assets={data.promptAssets} onRemove={(assetId) => updateNode(id, { promptAssets: (data.promptAssets ?? []).filter((asset) => asset.id !== assetId) })} />
        <FocusMarkerTray targetId={id} markers={data.promptMarkers} />
        <textarea maxLength={3000} className="video-prompt" aria-label="视频 Prompt" placeholder="描述镜头、动作、节奏或风格，输入 @ 引用资产" value={data.localPrompt ?? ''} onChange={(event) => { updateNode(id, { localPrompt: event.target.value }); if (event.target.value.endsWith('@')) setQuickReferenceOpen(true) }} />
        <span className="video-prompt-count">{(data.localPrompt ?? '').length} / 3000</span>
        <QuickReferenceMenu open={quickReferenceOpen} onClose={() => setQuickReferenceOpen(false)} onSelect={selectPromptAsset} />
      </div>
      <footer className="video-config-footer generation-config-footer">
        <button ref={modelButtonRef} type="button" className="video-config-trigger generation-config-trigger model-trigger" onClick={() => { setModelOpen((open) => !open); setModeOpen(false); setParamsOpen(false) }} aria-expanded={modelOpen}><Film size={14} /><span>{model.label}</span><ChevronDown size={12} /></button>
        <AnchoredPopover anchorRef={modelButtonRef} open={modelOpen} onClose={() => setModelOpen(false)} className="video-model-popover" align="start" placement="top">
          <div role="menu" aria-label="选择视频模型"><header><strong>选择模型</strong><small>按当前创作需要选择</small></header>{videoModelCapabilities.map((item) => <button type="button" key={item.id} className={model.id === item.id ? 'active' : ''} onClick={() => selectModel(item)}><span className="video-model-logo"><Film size={16} /></span><span><strong>{item.label}</strong><small>{item.hint}</small></span><em>{item.badge}</em>{model.id === item.id && <Check size={15} />}</button>)}</div>
        </AnchoredPopover>
        <button ref={modeButtonRef} type="button" className="video-config-trigger generation-config-trigger mode-trigger" onClick={() => { setModeOpen((open) => !open); setModelOpen(false); setParamsOpen(false) }} aria-expanded={modeOpen}><span>{mode.label}</span><ChevronDown size={12} /></button>
        <AnchoredPopover anchorRef={modeButtonRef} open={modeOpen} onClose={() => setModeOpen(false)} className="video-mode-popover" align="start" placement="top"><div role="menu" aria-label="选择视频生成模式">{availableModes.map((item) => <button type="button" key={item.id} className={mode.id === item.id ? 'active' : ''} onClick={() => { actions.changeVideoGenerationMode(id, item.id); setModeOpen(false) }}><span><strong>{item.label}</strong><small>{item.hint}</small></span>{mode.id === item.id && <Check size={15} />}</button>)}</div></AnchoredPopover>
        <button ref={paramsButtonRef} type="button" className="video-config-trigger generation-config-trigger params-trigger" onClick={() => { setParamsOpen((open) => !open); setModelOpen(false); setModeOpen(false) }} aria-expanded={paramsOpen}><SlidersHorizontal size={14} /><span>{generation.ratio === 'auto' ? '智能比例' : generation.ratio} | {generation.resolution} | {generation.count}个 | {generation.duration}s</span><ChevronDown size={12} /></button>
        <AnchoredPopover anchorRef={paramsButtonRef} open={paramsOpen} onClose={() => setParamsOpen(false)} className="video-params-popover" align="end" placement="top"><div aria-label="视频生成参数">
          <fieldset><legend>选择比例</legend><div className="video-option-grid ratios">{model.ratios.map((ratio) => <button type="button" key={ratio} className={generation.ratio === ratio ? 'active' : ''} onClick={() => patchGeneration({ ratio })}><span className={`ratio-shape ratio-${ratio.replace(':', '-')}`} />{ratio === 'auto' ? '智能' : ratio}</button>)}</div></fieldset>
          <fieldset><legend>选择分辨率</legend><div className="video-option-grid four">{model.resolutions.map((resolution) => <button type="button" key={resolution} className={generation.resolution === resolution ? 'active' : ''} onClick={() => patchGeneration({ resolution })}>{resolution}</button>)}</div></fieldset>
          <fieldset><legend>选择生成数量</legend><div className="video-option-grid four">{([1, 2, 3, 4] as const).map((count) => <button type="button" key={count} className={generation.count === count ? 'active' : ''} onClick={() => patchGeneration({ count })}>{count}个</button>)}</div></fieldset>
          <label className="video-duration-control"><span>选择时长<strong>{generation.duration}s</strong></span><input aria-label="视频时长" type="range" min={1} max={model.maxDuration} value={Math.min(generation.duration, model.maxDuration)} onChange={(event) => patchGeneration({ duration: Number(event.target.value) })} /></label>
        </div></AnchoredPopover>
        <button type="button" className={`video-icon-toggle generation-icon-toggle ui-tooltip-control ${generation.webSearch ? 'active' : ''}`} data-tooltip={`联网搜索${generation.webSearch ? '开' : '关'}`} onClick={() => patchGeneration({ webSearch: !generation.webSearch })} aria-pressed={generation.webSearch} aria-label={`联网搜索${generation.webSearch ? '开' : '关'}`}><Globe2 size={16} /></button>
        <button type="button" className={`video-icon-toggle generation-icon-toggle ui-tooltip-control ${generation.generateAudio ? 'active' : ''}`} data-tooltip={`视频音效${generation.generateAudio ? '开' : '关'}`} onClick={() => patchGeneration({ generateAudio: !generation.generateAudio })} aria-pressed={generation.generateAudio} aria-label={`视频音效${generation.generateAudio ? '开' : '关'}`}><AudioLines size={16} /></button>
        <button type="button" className="video-icon-toggle generation-icon-toggle ui-tooltip-control" data-tooltip="快捷引用资产" onClick={() => setQuickReferenceOpen(true)} aria-label="快捷引用资产"><span>@</span></button>
        <span className="panel-spacer" />
        <span className="generation-cost"><span className="chestnut-dot" />{data.cost ?? 35}</span>
        <button type="button" className="generate-button" onClick={() => runGeneration(id)} disabled={busy} aria-label={busy ? '视频生成中' : '生成视频'}>{busy ? <Pause size={16} /> : <ArrowUp size={17} />}</button>
      </footer>
      {complianceLibraryOpen && <SeedanceLibraryDialog data={data} onClose={() => setComplianceLibraryOpen(false)} onApply={(ids) => updateNode(id, { seedanceComplianceAssetIds: ids })} />}
    </section>
  )
}

const videoOperationLabels: Record<VideoOperationKind, { title: string; description: string }> = {
  'super-resolution': { title: '视频超分', description: '增强画面细节并提升输出分辨率' },
  'frame-interpolation': { title: '视频补帧', description: '提升视频帧率，使画面更流畅' },
  'subtitle-removal': { title: '字幕擦除', description: '智能识别，一键去除字幕' },
  edit: { title: '视频编辑', description: '选择关键画面并将修改应用到整段视频' },
}

function VideoOperationConfig({ id, data }: { id: string; data: CanvasNodeData }) {
  const actions = useCanvasActions() as VideoActionExtensions
  const operationData = data.videoOperation as Exclude<PendingVideoOperation, { operation: 'edit' }>
  const copy = videoOperationLabels[operationData.operation]
  const sourceSuperResolution = operationData.operation === 'super-resolution' ? operationData : undefined
  const sourceInterpolation = operationData.operation === 'frame-interpolation' ? operationData : undefined
  const [model, setModel] = useState<'node' | 'topaz'>(sourceSuperResolution?.model ?? 'node')
  const [scale, setScale] = useState<2 | 4>(sourceSuperResolution?.scale ?? 2)
  const [targetFps, setTargetFps] = useState<50 | 60 | 90 | 120>(sourceInterpolation?.targetFps ?? 50)
  const complete = () => {
    if (operationData.operation === 'super-resolution') actions.completeVideoOperation(id, { operation: 'super-resolution', model, ...(model === 'topaz' ? { scale } : {}) })
    if (operationData.operation === 'frame-interpolation') actions.completeVideoOperation(id, { operation: 'frame-interpolation', targetFps })
    if (operationData.operation === 'subtitle-removal') actions.completeVideoOperation(id, { operation: 'subtitle-removal' })
  }
  return (
    <section className={`video-operation-config node-panel zoom-stable-ui nodrag nowheel operation-${operationData.operation}`} aria-label={`${copy.title}配置`}>
      <header><span><strong>{copy.title}</strong><small>{copy.description}</small></span><button type="button" aria-label={`取消${copy.title}`} title="取消" onClick={() => actions.cancelPendingVideoOperation ? actions.cancelPendingVideoOperation(id) : actions.notify('可使用撤销取消本次处理')}><X size={15} /></button></header>
      {operationData.operation === 'super-resolution' && <><div className="video-model-segments" role="group" aria-label="选择超分模型"><button type="button" className={model === 'node' ? 'active' : ''} onClick={() => setModel('node')}>基础模型 · 视频超分</button><button type="button" className={model === 'topaz' ? 'active' : ''} onClick={() => setModel('topaz')}>Topaz Labs</button></div><p className="video-operation-note">当前分辨率：<strong>{data.media?.width ?? 1248} × {data.media?.height ?? 1664}</strong></p>{model === 'topaz' && <div className="video-scale-options"><span>超清倍数</span>{([2, 4] as const).map((value) => <button type="button" key={value} className={scale === value ? 'active' : ''} onClick={() => setScale(value)}>{value}x</button>)}</div>}</>}
      {operationData.operation === 'frame-interpolation' && <div className="video-fps-panel"><div><strong>目标帧率</strong><small>帧率越高，画面越流畅</small></div><div role="group" aria-label="目标帧率">{([50, 60, 90, 120] as const).map((fps) => <button type="button" key={fps} className={targetFps === fps ? 'active' : ''} onClick={() => setTargetFps(fps)}>{fps}fps</button>)}</div></div>}
      {operationData.operation === 'subtitle-removal' && <div className="subtitle-removal-summary"><span><CaptionsOff size={20} /></span><p><strong>智能检测字幕区域</strong><small>将从当前视频节点识别硬字幕，并生成无字幕版本。</small></p><Check size={16} /></div>}
      <footer><span className="generation-cost"><span className="chestnut-dot" />{videoOperationCost(operationData.operation)}</span><button type="button" className="video-primary-action" onClick={complete}>立即生成</button></footer>
    </section>
  )
}

const voiceOptions = [
  { id: 'news-cn', label: '新闻资讯（中文）', meta: '沉稳 · 普通话' },
  { id: 'news-en', label: '新闻资讯（英语）', meta: '清晰 · 英语' },
  { id: 'commercial-cn', label: '电视广告（中文）', meta: '明亮 · 普通话' },
  { id: 'narration-cn', label: '电影旁白（中文）', meta: '厚重 · 普通话' },
  { id: 'poetry-cn', label: '诗词朗诵（中文）', meta: '舒缓 · 普通话' },
  { id: 'documentary-cn', label: '纪录片解说（中文）', meta: '自然 · 普通话' },
] as const

type VoiceSelection = { id: string; label: string }

export function VoicePicker({ value, onChange, onClose }: { value: VoiceSelection; onChange: (value: VoiceSelection) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value)
  const [tab, setTab] = useState<'select' | 'clone'>(value.id.startsWith('clone:') ? 'clone' : 'select')
  const [cloneFileName, setCloneFileName] = useState(value.id.startsWith('clone:') ? value.label.replace(/ · 克隆$/, '') : '')
  const restoreFocusRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  useEffect(() => () => {
    window.setTimeout(() => restoreFocusRef.current?.isConnected && restoreFocusRef.current.focus(), 0)
  }, [])
  const canConfirm = tab === 'select' || draft.id.startsWith('clone:')
  return createPortal(
    <div className="voice-picker-layer" data-canvas-overlay="true" data-isolate-canvas-shortcuts="true" onMouseDown={onClose} onKeyDown={(event) => { if (event.key !== 'Escape') return; event.preventDefault(); event.stopPropagation(); onClose() }}>
      <section role="dialog" aria-modal="true" aria-label="选择声音" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        <header><nav><button type="button" className={tab === 'select' ? 'active' : ''} onClick={() => setTab('select')}>选择声音</button><button type="button" className={tab === 'clone' ? 'active' : ''} onClick={() => setTab('clone')}>克隆声音</button></nav><button type="button" autoFocus onClick={onClose} aria-label="关闭声音选择"><X size={18} /></button></header>
        <div className="voice-picker-content">{tab === 'select' ? <><div className="voice-filters"><button type="button">性别 <ChevronDown size={11} /></button><button type="button">年龄 <ChevronDown size={11} /></button><button type="button">语种 <ChevronDown size={11} /></button><button type="button">风格 <ChevronDown size={11} /></button><label><input type="checkbox" />我收藏的</label></div><div className="voice-option-grid">{voiceOptions.map((voice) => <button type="button" key={voice.id} className={draft.id === voice.id ? 'active' : ''} onClick={() => setDraft({ id: voice.id, label: voice.label })}><span><Play size={15} fill="currentColor" /></span><strong>{voice.label}</strong><small>{voice.meta}</small></button>)}</div></> : <div className="voice-clone-empty"><Mic2 size={28} /><strong>克隆声音</strong><p>上传一段清晰人声，创建当前会话可用的音色。</p><label className="voice-clone-upload"><input type="file" accept="audio/*" aria-label="上传克隆声音样本" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setCloneFileName(file.name); setDraft({ id: `clone:${file.name}:${file.size}`, label: `${file.name} · 克隆` }) }} /><Upload size={14} /><span>{cloneFileName || '上传人声'}</span></label>{cloneFileName && <small>已创建当前会话克隆音色</small>}</div>}</div>
        <footer><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" disabled={!canConfirm} onClick={() => { if (!canConfirm) return; onChange(draft); onClose() }}>确定</button></footer>
      </section>
    </div>,
    document.body,
  )
}

export function LipSyncPanel({ id, data, onClose }: { id: string; data: CanvasNodeData; onClose: () => void }) {
  const actions = useCanvasActions() as VideoActionExtensions
  const personThumbnail = data.media?.posterUrl ?? data.media?.timelineFrameUrls?.[0]
  const detectedPeople = [{ id: 'person-primary', label: data.title.includes('主播') ? '主播' : '画面人物 1' }]
  const [personId, setPersonId] = useState(detectedPeople[0].id)
  const [audioMode, setAudioMode] = useState<'ai' | 'local'>('ai')
  const [script, setScript] = useState('')
  const [audioName, setAudioName] = useState('')
  const [voiceId, setVoiceId] = useState('news-cn')
  const [voiceLabel, setVoiceLabel] = useState<string>(voiceOptions[0].label)
  const [speed, setSpeed] = useState(1)
  const [pitch, setPitch] = useState(0)
  const [voicePickerOpen, setVoicePickerOpen] = useState(false)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewTime, setPreviewTime] = useState(0)
  const restoreFocusRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !voicePickerOpen) onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose, voicePickerOpen])
  useEffect(() => () => {
    window.setTimeout(() => restoreFocusRef.current?.isConnected && restoreFocusRef.current.focus(), 0)
  }, [])
  useEffect(() => {
    if (!previewPlaying) return
    const timer = window.setInterval(() => setPreviewTime((current) => {
      const next = Math.min(8, current + .5)
      if (next >= 8) setPreviewPlaying(false)
      return next
    }), 500)
    return () => window.clearInterval(timer)
  }, [previewPlaying])
  const selectedPerson = detectedPeople.find((person) => person.id === personId)
  const canGenerate = Boolean(selectedPerson && (audioMode === 'ai' ? script.trim() : audioName))
  const finish = () => {
    if (!selectedPerson) return actions.notify('请先选择需要对口型的人物')
    if (!canGenerate) return actions.notify(audioMode === 'ai' ? '请输入配音文案' : '请先上传配音')
    actions.createLipSyncDerivative(id, { operation: 'lip-sync', personId: selectedPerson.id, personLabel: selectedPerson.label, source: audioMode, script: audioMode === 'ai' ? script.trim() : '', voiceId: audioMode === 'ai' ? voiceId : undefined, speed, pitch, audioName: audioMode === 'local' ? audioName : undefined })
    onClose()
  }
  const previewReady = audioMode === 'ai' ? Boolean(script.trim()) : Boolean(audioName)
  return (
    <section className="lip-sync-panel node-panel zoom-stable-ui nodrag nowheel" data-isolate-canvas-shortcuts="true" aria-label="对口型配置">
      <header><div><ScanFace size={17} /><span><strong>对口型</strong><small>使用当前视频节点</small></span></div><button type="button" onClick={onClose} aria-label="关闭对口型配置"><X size={17} /></button></header>
      <div className="lip-sync-panel-body">
        <section className="lip-person-section" aria-label="选择人物"><header><strong>选择人物</strong><small>已识别 {detectedPeople.length} 人</small></header><div className="lip-person-grid">{detectedPeople.map((person) => <button type="button" key={person.id} className={personId === person.id ? 'active' : ''} aria-pressed={personId === person.id} onClick={() => setPersonId(person.id)}>{personThumbnail ? <img src={personThumbnail} alt="" /> : <div className="lip-person-placeholder"><ScanFace size={21} /></div>}<span><strong>{person.label}</strong><small>当前视频 · 已识别</small></span>{personId === person.id && <Check size={16} />}</button>)}</div></section>
        <div className="dubbing-mode" role="group" aria-label="配音来源"><button type="button" className={audioMode === 'ai' ? 'active' : ''} aria-pressed={audioMode === 'ai'} onClick={() => { setAudioMode('ai'); setPreviewPlaying(false); setPreviewTime(0) }}>AI 配音</button><button type="button" className={audioMode === 'local' ? 'active' : ''} aria-pressed={audioMode === 'local'} onClick={() => { setAudioMode('local'); setPreviewPlaying(false); setPreviewTime(0) }}>本地配音</button></div>
        {audioMode === 'ai' ? <><label className="dubbing-script"><span>配音文案<small>{script.length} / 500</small></span><textarea maxLength={500} value={script} onChange={(event) => { setScript(event.target.value); setPreviewPlaying(false); setPreviewTime(0) }} placeholder="输入需要人物说出的内容" /></label><div className="voice-select-row"><span><strong>音色</strong><small>{voiceLabel}</small></span><button type="button" className="ui-tooltip-control" data-tooltip="选择声音" aria-label="选择声音" onClick={() => setVoicePickerOpen(true)}><ArrowLeftRight size={16} /></button></div></> : <label className="local-audio-upload"><input type="file" accept="audio/*" aria-label="上传本地配音" onChange={(event) => { setAudioName(event.target.files?.[0]?.name ?? ''); setPreviewPlaying(false); setPreviewTime(0) }} /><Upload size={20} /><span><strong>{audioName || '上传本地配音'}</strong><small>支持 MP3、WAV，2-60s</small></span></label>}
        <div className="dubbing-range-grid"><RangeField label="语速" value={speed} min={.8} max={1.2} step={.1} suffix="x" onChange={(value) => { setSpeed(value); setPreviewTime(0) }} /><RangeField label="语调" value={pitch} min={-2} max={2} onChange={(value) => { setPitch(value); setPreviewTime(0) }} /></div>
        <div className="dubbing-preview"><strong>配音预览</strong><button type="button" disabled={!previewReady} aria-label={previewPlaying ? '暂停试听配音' : '试听配音'} onClick={() => { if (!previewReady) return; if (previewTime >= 8) setPreviewTime(0); setPreviewPlaying((playing) => !playing) }}>{previewPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button><span>{formatVideoTime(previewTime)}</span><i><b style={{ width: `${previewTime / 8 * 100}%` }} /></i><span>0:08</span></div>
      </div>
      <footer><span className="generation-cost"><span className="chestnut-dot" />{videoOperationCost('lip-sync')}</span><button type="button" className="video-primary-action" onClick={finish} disabled={!canGenerate}>立即生成</button></footer>
      {voicePickerOpen && <VoicePicker value={{ id: voiceId, label: voiceLabel }} onChange={(voice) => { setVoiceId(voice.id); setVoiceLabel(voice.label) }} onClose={() => setVoicePickerOpen(false)} />}
    </section>
  )
}

function videoEditPreviewFilter(prompt: string, referenceAssetId: string | undefined, selectedTime: number, variant: number) {
  const seed = `${prompt}|${referenceAssetId ?? ''}|${selectedTime}|${variant}`
    .split('')
    .reduce((total, character) => total + character.charCodeAt(0), 0)
  return `hue-rotate(${seed % 25 - 12}deg) saturate(${1.06 + (seed % 7) * .04}) brightness(${1.01 + (seed % 5) * .025})`
}

export function VideoEditPanel({ id, data }: { id: string; data: CanvasNodeData }) {
  const actions = useCanvasActions() as VideoActionExtensions
  const existing = data.videoOperation?.operation === 'edit' ? data.videoOperation : undefined
  const duration = data.media?.duration ?? data.duration ?? 8
  const timelineItems = useMemo(() => {
    const frameUrls = videoTimelineFrameUrls(data.media)
    const times = videoTimelineTimes(duration, Math.max(frameUrls.length, 1))
    return frameUrls.length
      ? frameUrls.map((url, index) => ({ url, time: times[index] ?? 0 }))
      : [{ url: undefined, time: times[0] ?? 0 }]
  }, [data.media, duration])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(() => {
    if (!existing?.prompt.trim() && !existing?.previewUrl && !existing?.previewResults?.length) return null
    const targetTime = existing.selectedTime
    return timelineItems.reduce((closestIndex, item, index) => (
      Math.abs(item.time - targetTime) < Math.abs(timelineItems[closestIndex].time - targetTime) ? index : closestIndex
    ), 0)
  })
  const [prompt, setPrompt] = useState(existing?.prompt ?? '')
  const existingLocalReference = existing?.referenceAssetId?.startsWith('local:')
  const [referenceAssetId, setReferenceAssetId] = useState<string | undefined>(existingLocalReference ? existing?.referenceAssetId : undefined)
  const [referenceAssetLabel, setReferenceAssetLabel] = useState<string | undefined>(existingLocalReference ? existing?.referenceAssetLabel : undefined)
  const [referenceMedia, setReferenceMedia] = useState<MediaMetadata | undefined>(existingLocalReference ? existing?.referenceMedia : undefined)
  const restoredPreviewResults = useMemo<VideoEditPreviewResult[]>(() => {
    if (existing?.previewResults?.length) return existing.previewResults.map((result) => ({ ...result }))
    if (!existing?.previewUrl) return []
    const sourceFrameUrl = timelineItems.reduce((closest, item) => (
      Math.abs(item.time - existing.selectedTime) < Math.abs(closest.time - existing.selectedTime) ? item : closest
    ), timelineItems[0])?.url ?? existing.previewUrl
    return [{
      id: existing.selectedPreviewId ?? 'video-edit-preview-1',
      selectedTime: existing.selectedTime,
      sourceFrameUrl,
      prompt: existing.prompt,
      referenceAssetId: existing.referenceAssetId,
      referenceAssetLabel: existing.referenceAssetLabel,
      referenceMedia: existing.referenceMedia,
      previewUrl: existing.previewUrl,
      previewFilter: existing.previewFilter ?? videoEditPreviewFilter(existing.prompt, existing.referenceAssetId, existing.selectedTime, 1),
    }]
  }, [existing, timelineItems])
  const [previewResults, setPreviewResults] = useState<VideoEditPreviewResult[]>(() => restoredPreviewResults)
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | undefined>(() => {
    if (existing?.selectedPreviewId && restoredPreviewResults.some((result) => result.id === existing.selectedPreviewId)) return existing.selectedPreviewId
    return restoredPreviewResults.at(-1)?.id
  })
  const [comparisonPositions, setComparisonPositions] = useState<Record<string, number>>(() => Object.fromEntries(restoredPreviewResults.map((result) => [result.id, 50])))
  const previewSequenceRef = useRef(restoredPreviewResults.length)
  const comparisonCleanupRef = useRef<(() => void) | null>(null)
  const selectedItem = selectedIndex === null ? undefined : timelineItems[selectedIndex]
  const selectedTime = selectedItem?.time
  const selectedFrameUrl = selectedItem?.url
  const selectedPreview = previewResults.find((result) => result.id === selectedPreviewId)
  const persistPreviewSelection = (results: VideoEditPreviewResult[], selected: VideoEditPreviewResult) => {
    actions.updateNode(id, {
      videoOperation: {
        operation: 'edit',
        selectedTime: selected.selectedTime,
        prompt: selected.prompt,
        referenceAssetId: selected.referenceAssetId,
        referenceAssetLabel: selected.referenceAssetLabel,
        referenceMedia: selected.referenceMedia,
        previewUrl: selected.previewUrl,
        previewFilter: selected.previewFilter,
        previewResults: results,
        selectedPreviewId: selected.id,
      },
    })
  }
  const generatePreview = () => {
    if (!selectedFrameUrl) return actions.notify('关键帧仍在提取，请稍后重试')
    if (!prompt.trim()) return actions.notify('请先描述需要修改的画面')
    if (selectedTime === undefined) return
    const variant = previewSequenceRef.current + 1
    previewSequenceRef.current = variant
    const result: VideoEditPreviewResult = {
      id: `video-edit-preview-${Date.now()}-${variant}`,
      selectedTime,
      sourceFrameUrl: selectedFrameUrl,
      prompt: prompt.trim(),
      referenceAssetId,
      referenceAssetLabel,
      referenceMedia,
      previewUrl: selectedFrameUrl,
      previewFilter: videoEditPreviewFilter(prompt.trim(), referenceAssetId, selectedTime, variant),
    }
    const nextResults = [...previewResults, result]
    setPreviewResults(nextResults)
    setSelectedPreviewId(result.id)
    setComparisonPositions((current) => ({ ...current, [result.id]: 50 }))
    persistPreviewSelection(nextResults, result)
    actions.notify(`第 ${nextResults.length} 张预览图已生成`)
  }
  const applyEdit = () => {
    if (!selectedPreview) return
    actions.completeVideoEdit(id, {
      operation: 'edit',
      selectedTime: selectedPreview.selectedTime,
      prompt: selectedPreview.prompt,
      referenceAssetId: selectedPreview.referenceAssetId,
      referenceAssetLabel: selectedPreview.referenceAssetLabel,
      referenceMedia: selectedPreview.referenceMedia,
      previewUrl: selectedPreview.previewUrl,
      previewFilter: selectedPreview.previewFilter,
      previewResults,
      selectedPreviewId: selectedPreview.id,
    })
  }
  const selectPreview = (previewId: string) => {
    const result = previewResults.find((item) => item.id === previewId)
    if (!result) return
    const resultIndex = timelineItems.reduce((closestIndex, item, index) => (
      Math.abs(item.time - result.selectedTime) < Math.abs(timelineItems[closestIndex].time - result.selectedTime) ? index : closestIndex
    ), 0)
    setSelectedPreviewId(previewId)
    setSelectedIndex(resultIndex)
    setPrompt(result.prompt)
    setReferenceAssetId(result.referenceAssetId)
    setReferenceAssetLabel(result.referenceAssetLabel)
    setReferenceMedia(result.referenceMedia)
    persistPreviewSelection(previewResults, result)
  }
  const selectLocalReference = (file: File) => {
    const url = URL.createObjectURL(file)
    setReferenceAssetId(`local:${file.name}:${file.size}`)
    setReferenceAssetLabel(file.name)
    setReferenceMedia({ url, mimeType: file.type || undefined })
  }
  const selectFrame = (index: number) => {
    setSelectedIndex(index)
  }
  const setComparisonFromPointer = (previewId: string, clientX: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect()
    if (!rect?.width) return
    const position = Math.round(Math.min(Math.max((clientX - rect.left) / rect.width * 100, 0), 100))
    setComparisonPositions((current) => ({ ...current, [previewId]: position }))
  }
  const beginComparisonDrag = (event: React.PointerEvent<HTMLDivElement>, previewId: string) => {
    if (event.button !== 0) return
    event.preventDefault()
    selectPreview(previewId)
    const element = event.currentTarget
    setComparisonFromPointer(previewId, event.clientX, element)
    const move = (pointerEvent: PointerEvent) => setComparisonFromPointer(previewId, pointerEvent.clientX, element)
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      comparisonCleanupRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    comparisonCleanupRef.current = stop
  }
  const close = useCallback(() => actions.cancelPendingVideoOperation?.(id), [actions.cancelPendingVideoOperation, id])
  const restoreFocusRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      comparisonCleanupRef.current?.()
      window.setTimeout(() => {
        if (restoreFocusRef.current?.isConnected) restoreFocusRef.current.focus()
        else document.querySelector<HTMLButtonElement>('[aria-label="视频编辑"]')?.focus()
      }, 0)
    }
  }, [close])
  const previewRatio = data.media?.width && data.media?.height ? data.media.width / data.media.height : 16 / 9
  return createPortal(
    <div className="video-editor-backdrop" data-canvas-overlay="true" data-isolate-canvas-shortcuts="true">
      <section className="video-edit-workspace" role="dialog" aria-modal="true" aria-label="视频编辑工作区">
        <header className="video-edit-workspace-header"><div><Scissors size={17} /><span><strong>视频编辑</strong><small>{data.title} · {formatVideoTime(duration)} · {data.media?.width ?? 1248} × {data.media?.height ?? 1664}</small></span></div><div><span className="video-edit-save-state"><Check size={13} />编辑已自动保存</span><button type="button" autoFocus onClick={close} aria-label="退出视频编辑"><X size={18} /></button></div></header>
        <div className="video-edit-workspace-body">
          <main className="video-edit-source">
            <section className="video-edit-stage"><header><span><strong>上传视频</strong><small>{formatVideoTime(duration)} · {selectedTime === undefined ? '未选择关键帧' : `当前帧 ${formatVideoTime(selectedTime)}`}</small></span></header><div className="video-edit-stage-media"><VideoPlayer label={`${data.title}编辑预览`} media={data.media} seekTime={selectedTime ?? 0} />{selectedTime !== undefined && <span className="video-edit-stage-badge"><Clock3 size={13} />{formatVideoTime(selectedTime)}</span>}</div></section>
            <section className="video-edit-keyframes"><header><span><strong>关键帧</strong><small>{timelineItems[0]?.url ? `${timelineItems.length} 帧` : '等待提取关键帧'}</small></span><span>{selectedTime === undefined ? '--:--' : formatVideoTime(selectedTime)} / {formatVideoTime(duration)}</span></header><div className="video-edit-time-ruler">{Array.from({ length: 5 }, (_, index) => duration * index / 4).map((time) => <span key={time}>{formatVideoTime(time)}</span>)}</div><div className="video-edit-timeline" aria-label="视频关键帧时间轴">{timelineItems.map((item, index) => <button type="button" key={`${item.url ?? 'empty'}-${index}`} className={`${selectedIndex === index ? 'active' : ''} ${item.url ? '' : 'is-frame-placeholder'}`} style={item.url ? { backgroundImage: `url(${item.url})` } : undefined} onClick={() => selectFrame(index)} aria-label={`选择 ${item.time.toFixed(1)} 秒画面`} />)}{selectedTime !== undefined && <span className="timeline-playhead" style={{ left: `${duration > 0 ? selectedTime / duration * 100 : 0}%` }} />}</div></section>
            <section className="video-edit-inputs"><div className="video-edit-input-media">{selectedFrameUrl ? <figure className="video-edit-selected-frame"><img src={selectedFrameUrl} alt="已选关键帧" /><figcaption><strong>已选关键帧</strong><small>{formatVideoTime(selectedTime ?? 0)}</small></figcaption></figure> : <div className="video-edit-frame-hint"><ImageIcon size={16} /><span>点击上方关键帧</span></div>}<label className={`video-edit-local-reference ${referenceAssetId?.startsWith('local:') ? 'active' : ''}`}><input type="file" accept="image/*" aria-label="上传视频编辑参考图" onChange={(event) => { const file = event.target.files?.[0]; if (file) selectLocalReference(file) }} />{referenceAssetId?.startsWith('local:') && referenceMedia?.url ? <img src={referenceMedia.url} alt="" /> : <Upload size={15} />}<span>{referenceAssetId?.startsWith('local:') ? referenceAssetLabel : '本地上传'}</span>{referenceAssetId?.startsWith('local:') && <Check size={13} />}</label></div><label className="video-edit-prompt"><span>修改描述</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：保持镜头运动，将主播服装改为浅绿色" /></label><button type="button" className="preview-generate-action" onClick={generatePreview} disabled={!selectedFrameUrl || !prompt.trim()}><WandSparkles size={15} />生成图片 <span className="generation-cost"><span className="chestnut-dot" />2</span></button></section>
          </main>
          <aside className="video-edit-preview" style={{ '--video-edit-preview-ratio': String(previewRatio) } as CSSProperties}><header><strong>图片预览</strong>{previewResults.length > 0 && <span className="video-edit-preview-ready"><Check size={13} />{previewResults.length} 张</span>}</header><div className="video-edit-preview-results" role="list" aria-label="图片预览结果">{previewResults.length > 0 ? previewResults.map((result, index) => { const active = result.id === selectedPreviewId; const comparisonPosition = comparisonPositions[result.id] ?? 50; return <article key={result.id} role="listitem" className={`video-edit-preview-result ${active ? 'active' : ''}`}><button type="button" className="video-edit-preview-select" aria-label={`选择图片结果 ${index + 1}`} aria-pressed={active} onClick={() => selectPreview(result.id)}>{active ? <Check size={13} /> : index + 1}</button><div className="video-edit-image-compare" style={{ '--comparison-position': `${comparisonPosition}%` } as CSSProperties} onPointerDown={(event) => beginComparisonDrag(event, result.id)}><img src={result.sourceFrameUrl} alt="原始关键帧" /><div><img src={result.previewUrl} alt="生成后的关键帧" style={{ filter: result.previewFilter }} /></div><input className="video-edit-compare-input" type="range" min={0} max={100} value={comparisonPosition} onFocus={() => selectPreview(result.id)} onChange={(event) => setComparisonPositions((current) => ({ ...current, [result.id]: Number(event.target.value) }))} aria-label={`图片结果 ${index + 1} 原图与新图对比位置`} title="拖动对比中轴" /><i aria-hidden="true"><span><ChevronLeft size={14} /><ChevronRight size={14} /></span></i><small className="compare-original">原图</small><small className="compare-generated">新图</small></div></article> }) : <div className="video-edit-preview-empty"><ImageIcon size={21} /><span><strong>等待图片预览</strong><small>选择关键帧后生成</small></span></div>}</div><button type="button" className="apply-video-edit" onClick={applyEdit} disabled={!selectedPreview}>生成视频 <span className="generation-cost"><span className="chestnut-dot" />{videoOperationCost('edit')}</span></button></aside>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function VideoToolbar({ id, data, onExpand, onLipSync }: { id: string; data: CanvasNodeData; onExpand: () => void; onLipSync: () => void }) {
  const actions = useCanvasActions() as VideoActionExtensions
  const verifySeedance = useSeedanceCompliance(id)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const runOperation = (operation: VideoOperationKind) => { setMoreOpen(false); actions.prepareVideoOperation(id, operation) }
  return <div className="video-toolbar media-toolbar zoom-stable-ui nodrag" role="toolbar" aria-label="视频节点工具"><IconAction label="视频超分" onClick={() => runOperation('super-resolution')}><MonitorUp size={15} /></IconAction><IconAction label="视频补帧" onClick={() => runOperation('frame-interpolation')}><Gauge size={15} /></IconAction><IconAction label="对口型" onClick={onLipSync}><ScanFace size={15} /></IconAction><IconAction label="视频编辑" onClick={() => runOperation('edit')}><Scissors size={15} /></IconAction><span className="toolbar-divider" /><div><IconAction buttonRef={moreButtonRef} label="更多视频工具" active={moreOpen} onClick={() => setMoreOpen((open) => !open)}><MoreHorizontal size={16} /></IconAction><AnchoredPopover anchorRef={moreButtonRef} open={moreOpen} onClose={() => setMoreOpen(false)} className="toolbar-menu video-more-menu" align="end"><div role="menu"><button type="button" onClick={(event) => { event.stopPropagation(); runOperation('subtitle-removal') }}><CaptionsOff size={14} />字幕擦除</button><button type="button" className="seedance-compliance-menu-item" onClick={(event) => { event.stopPropagation(); setMoreOpen(false); verifySeedance() }}><ShieldCheck size={14} />Seedance 2.0 合规验证</button></div></AnchoredPopover></div><span className="toolbar-divider" /><PinControl id={id} value={data.pinColor} /><MediaDownloadAction label="下载视频" filename={`${data.title}.${mediaFileExtension(data.media, 'video')}`} href={data.media?.url ?? '/node-canvas-prototype/assets/virtual-ip-host-video.mp4'}><Download size={15} /></MediaDownloadAction><IconAction label="全屏预览" onClick={onExpand}><Expand size={15} /></IconAction></div>
}

export const VideoNode = memo(function VideoNode({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const { retryGeneration, updateNode, notify, selectedItemCount, isConnectionTargetCandidate, interactionMode, isInteractionCandidate, uploadNodeMedia } = useCanvasActions()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [lipSyncOpen, setLipSyncOpen] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const nodeRef = useRef<HTMLElement>(null)
  const overlayVariables = useStableOverlayVariables()
  const pendingOperation = data.status === 'ready' ? data.videoOperation as PendingVideoOperation | undefined : undefined
  const isGenerating = data.status === 'queued' || data.status === 'running'
  const hasContent = Boolean((data.content ?? '').trim()) || data.status === 'success'
  const hasResult = hasContent || isGenerating
  const focused = selected && selectedItemCount === 1
  const candidate = isConnectionTargetCandidate(id)
  const interactionClass = interactionNodeClass(id, interactionMode, isInteractionCandidate(id))
  useEffect(() => {
    if ((!focused || pendingOperation) && lipSyncOpen) setLipSyncOpen(false)
  }, [focused, lipSyncOpen, pendingOperation])
  const showGenerationConfig = focused && !lipSyncOpen && shouldShowVideoGenerationPanel(data)
  const mediaGeometry = fitMediaAspect(data.media?.width, data.media?.height)
  const nodeStyle = {
    ...overlayVariables,
    '--video-node-width': `${mediaGeometry.width}px`,
    '--video-preview-ratio': String(mediaGeometry.ratio),
  } as CSSProperties
  const overlaySelector = !focused
    ? null
    : lipSyncOpen
      ? '.lip-sync-panel'
      : pendingOperation?.operation === 'edit'
        ? null
        : pendingOperation
          ? '.video-operation-config'
          : showGenerationConfig
            ? '.video-config'
            : hasContent
              ? '.video-toolbar'
              : null
  useKeepNodeOverlayInViewport(nodeRef, overlaySelector)
  return <article ref={nodeRef} className={`canvas-node video-node ${selected ? 'is-selected' : ''} ${candidate ? 'is-connection-candidate' : ''} ${hasResult || data.status === 'failed' || pendingOperation ? '' : 'is-empty'} ${data.status === 'failed' ? 'has-error' : ''} ${pendingOperation ? 'is-video-operation' : ''} ${interactionClass}`} style={nodeStyle}>
    <ConnectionHandles nodeId={id} />
    <VideoOperationOutputHandle />
    {focused && hasContent && !pendingOperation && <VideoToolbar id={id} data={data} onExpand={() => setPreviewOpen(true)} onLipSync={() => setLipSyncOpen((open) => !open)} />}
    <NodeHeader id={id} data={data} icon={<Video size={13} />} />
    {focused && !hasResult && data.status !== 'failed' && !pendingOperation && canUploadToEmptyMediaNode(data) && <><button type="button" className="empty-node-upload nodrag" onClick={() => uploadInputRef.current?.click()}><Upload size={14} />上传</button><input ref={uploadInputRef} className="sr-only" type="file" accept="video/*" aria-label="上传视频到当前节点" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadNodeMedia(id, file); event.currentTarget.value = '' }} /></>}
    <div className="node-surface video-preview">
        {!hasResult && data.status !== 'failed' && <div className="video-empty"><span>{pendingOperation ? <WandSparkles size={21} /> : <Play size={21} />}</span>{pendingOperation ? <strong>{videoOperationLabels[pendingOperation.operation].title}</strong> : <strong className="sr-only">视频</strong>}</div>}
        {hasContent && !isGenerating && <VideoPlayer label={`${data.title}视频播放器`} media={data.media} compact />}
        {data.status === 'failed' && <MediaErrorState error={data.error} onRetry={() => retryGeneration(id)} />}
        {isGenerating && <>{hasContent && <VideoPlayer label={`${data.title}生成预览`} media={data.media} compact />}<MediaGenerationProgress progress={data.progress} /></>}
        {hasContent && !isGenerating && canFavoriteMediaNode(data) && <button type="button" className={`video-favorite ${data.favorite ? 'active' : ''} nodrag`} onClick={() => { updateNode(id, { favorite: !data.favorite }); notify(data.favorite ? '已取消收藏' : '已收藏到资产') }} aria-label={data.favorite ? '取消收藏视频' : '收藏视频'} title={data.favorite ? '取消收藏' : '收藏'}><Star size={16} fill={data.favorite ? 'currentColor' : 'none'} /></button>}
      </div>
    {focused && pendingOperation && pendingOperation.operation !== 'edit' && <VideoOperationConfig id={id} data={data} />}
    {focused && pendingOperation?.operation === 'edit' && <VideoEditPanel id={id} data={data} />}
    {focused && lipSyncOpen && !pendingOperation && <LipSyncPanel id={id} data={data} onClose={() => setLipSyncOpen(false)} />}
    {showGenerationConfig && <VideoConfig id={id} data={data} />}
    <PreviewOverlay open={previewOpen} onClose={() => setPreviewOpen(false)} id={id} data={data} />
  </article>
})

const waveform = [12, 20, 28, 18, 34, 26, 14, 31, 22, 36, 18, 28, 16, 24, 13, 32, 20, 26]
const audioModels = generationDefinitions.find((item) => item.nodeType === 'audio')!.modes.flatMap((mode) => mode.models)
const audioPauseOptions = [.25, .5, 1, 1.5] as const
const audioToneOptions = ['笑声', '轻笑', '咳嗽', '清嗓子', '呻吟', '正常换气', '喘气', '吸气', '呼气', '倒吸气', '吸鼻子', '叹气', '喷鼻息', '打嗝', '哼唱', '鼾声', '嗯', '喷嚏']

function formatAudioTime(seconds: number) {
  const value = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const wholeSeconds = Math.floor(value + 1e-6)
  return `${String(Math.floor(wholeSeconds / 60)).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

function AudioAdvancedSettings({ anchorRef, open, onClose, params, onChange }: {
  anchorRef: RefObject<HTMLButtonElement | null>
  open: boolean
  onClose: () => void
  params: Record<string, string | number | boolean>
  onChange: (patch: Record<string, number>) => void
}) {
  const value = (key: string, fallback: number) => typeof params[key] === 'number' ? params[key] : fallback
  return <AnchoredPopover anchorRef={anchorRef} open={open} onClose={onClose} className="audio-advanced-popover" align="end" placement="top">
    <div aria-label="音频高级设置">
      <header><strong>高级设置</strong><button type="button" onClick={() => onChange({ speed: 1, pitch: 0, volume: 0, timbre: 0, warmth: 0, clarity: 0 })}>重置</button></header>
      <section><strong>基础调节</strong><RangeField label="语速" value={value('speed', 1)} min={.5} max={1.5} step={.1} onChange={(speed) => onChange({ speed })} /><RangeField label="音调" value={value('pitch', 0)} min={-12} max={12} onChange={(pitch) => onChange({ pitch })} /><RangeField label="音量" value={value('volume', 0)} min={-12} max={12} onChange={(volume) => onChange({ volume })} /></section>
      <section><strong>音色效果调节</strong><RangeField label="低沉-明亮" value={value('timbre', 0)} min={-10} max={10} onChange={(timbre) => onChange({ timbre })} /><RangeField label="力量-柔和" value={value('warmth', 0)} min={-10} max={10} onChange={(warmth) => onChange({ warmth })} /><RangeField label="磁性-清脆" value={value('clarity', 0)} min={-10} max={10} onChange={(clarity) => onChange({ clarity })} /></section>
    </div>
  </AnchoredPopover>
}

export function AudioTrimEditor({ id, duration, sourceUrl, onCancel }: { id: string; duration: number; sourceUrl?: string; onCancel: () => void }) {
  const { createAudioTrimDerivative } = useCanvasActions()
  const safeDuration = Math.max(duration, .2)
  const minimumLength = Math.min(.1, safeDuration)
  const [start, setStart] = useState(() => safeDuration * .25)
  const [end, setEnd] = useState(() => safeDuration * .75)
  const [previewPosition, setPreviewPosition] = useState(() => safeDuration * .25)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const previewAudioRef = useRef<HTMLAudioElement>(null)
  const dragRef = useRef<{
    kind: 'start' | 'end' | 'selection'
    pointerTime: number
    start: number
    end: number
  } | null>(null)
  const updateStart = (value: number) => setStart(Math.min(Math.max(value, 0), end - minimumLength))
  const updateEnd = (value: number) => setEnd(Math.max(Math.min(value, safeDuration), start + minimumLength))
  const selectionDuration = end - start
  useEffect(() => {
    setPreviewPosition((current) => current < start || current > end ? start : current)
    const audio = previewAudioRef.current
    if (audio && (audio.currentTime < start || audio.currentTime > end)) audio.currentTime = start
  }, [end, start])
  useEffect(() => {
    if (!previewPlaying || sourceUrl) return undefined
    const timer = window.setInterval(() => {
      setPreviewPosition((current) => {
        const next = current + .25
        if (next >= end) {
          setPreviewPlaying(false)
          return start
        }
        return next
      })
    }, 250)
    return () => window.clearInterval(timer)
  }, [end, previewPlaying, sourceUrl, start])
  const timeFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width) return 0
    return Math.min(safeDuration, Math.max(0, (event.clientX - rect.left) / rect.width * safeDuration))
  }, [safeDuration])
  const updateFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const time = timeFromPointer(event)
    if (drag.kind === 'start') {
      setStart(Math.min(Math.max(time, 0), drag.end - minimumLength))
      return
    }
    if (drag.kind === 'end') {
      setEnd(Math.max(Math.min(time, safeDuration), drag.start + minimumLength))
      return
    }
    const length = drag.end - drag.start
    const nextStart = Math.min(Math.max(drag.start + time - drag.pointerTime, 0), safeDuration - length)
    setStart(nextStart)
    setEnd(nextStart + length)
  }, [minimumLength, safeDuration, timeFromPointer])
  const beginPointerDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const time = timeFromPointer(event)
    const handleTolerance = Math.max(safeDuration * .04, .18)
    const kind = Math.abs(time - start) <= handleTolerance
      ? 'start'
      : Math.abs(time - end) <= handleTolerance
        ? 'end'
        : time > start && time < end
          ? 'selection'
          : time < start ? 'start' : 'end'
    dragRef.current = { kind, pointerTime: time, start, end }
    event.currentTarget.setPointerCapture(event.pointerId)
    updateFromPointer(event)
  }, [end, safeDuration, start, timeFromPointer, updateFromPointer])
  const endPointerDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    updateFromPointer(event)
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }, [updateFromPointer])
  const adjustHandle = (handle: 'start' | 'end', event: React.KeyboardEvent<HTMLButtonElement>) => {
    const delta = event.key === 'ArrowLeft' ? -.05 : event.key === 'ArrowRight' ? .05 : 0
    if (!delta) return
    event.preventDefault()
    event.stopPropagation()
    if (handle === 'start') updateStart(start + delta)
    else updateEnd(end + delta)
  }
  const togglePreview = () => {
    const audio = previewAudioRef.current
    if (!audio) return setPreviewPlaying((playing) => !playing)
    if (previewPlaying) {
      audio.pause()
      setPreviewPlaying(false)
      return
    }
    const nextPosition = previewPosition < start || previewPosition >= end ? start : previewPosition
    audio.currentTime = nextPosition
    void audio.play().then(() => setPreviewPlaying(true)).catch(() => setPreviewPlaying(false))
  }
  const handleNativePreviewTimeUpdate = (event: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = event.currentTarget
    if (audio.currentTime >= end) {
      audio.pause()
      audio.currentTime = start
      setPreviewPosition(start)
      setPreviewPlaying(false)
      return
    }
    setPreviewPosition(Math.max(start, audio.currentTime))
  }
  return <div className="audio-trim-editor nodrag nowheel" aria-label="裁剪音频">
    {sourceUrl && <audio ref={previewAudioRef} className="audio-native-source" src={sourceUrl} preload="metadata" aria-label="裁剪试听音频" onLoadedMetadata={(event) => { event.currentTarget.currentTime = start; setPreviewPosition(start) }} onTimeUpdate={handleNativePreviewTimeUpdate} onPause={() => setPreviewPlaying(false)} onEnded={() => { setPreviewPosition(start); setPreviewPlaying(false) }} />}
    <div className="audio-trim-waveform" aria-label="裁剪音频波形" style={{ '--trim-start': `${start / safeDuration * 100}%`, '--trim-end': `${end / safeDuration * 100}%` } as CSSProperties} onPointerDown={beginPointerDrag} onPointerMove={updateFromPointer} onPointerUp={endPointerDrag} onPointerCancel={endPointerDrag}>
      <div className="audio-wave-bars" aria-hidden="true">{[...waveform, ...waveform].map((height, index) => <i key={index} style={{ height }} />)}</div>
      <div className="audio-trim-selection" aria-hidden="true"><span>{selectionDuration.toFixed(2)} s</span></div>
      <span className="audio-trim-playhead" aria-hidden="true" style={{ left: `${previewPosition / safeDuration * 100}%` }} />
      <button type="button" className="audio-trim-handle handle-start" aria-label="裁剪开始位置" aria-valuetext={formatAudioTime(start)} onKeyDown={(event) => adjustHandle('start', event)} />
      <button type="button" className="audio-trim-handle handle-end" aria-label="裁剪结束位置" aria-valuetext={formatAudioTime(end)} onKeyDown={(event) => adjustHandle('end', event)} />
    </div>
    <footer><button type="button" className="audio-trim-cancel" onClick={onCancel}><X size={14} />取消裁剪</button><button type="button" className="audio-trim-preview" aria-label={previewPlaying ? '暂停试听裁剪片段' : '试听裁剪片段'} onClick={togglePreview}>{previewPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</button><button type="button" className="audio-trim-confirm" onClick={() => createAudioTrimDerivative(id, { operation: 'trim', start, end })}>生成</button></footer>
  </div>
}

function AudioPlayer({ data }: { data: CanvasNodeData }) {
  const duration = Math.max(data.media?.duration ?? data.duration ?? 12, .2)
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    if (!playing || data.media?.url) return undefined
    const timer = window.setInterval(() => setPosition((current) => current >= duration ? 0 : Math.min(duration, current + .25)), 250)
    return () => window.clearInterval(timer)
  }, [data.media?.url, duration, playing])
  useEffect(() => setPosition((current) => Math.min(current, duration)), [duration])
  const seek = (nextPosition: number) => {
    setPosition(nextPosition)
    if (audioRef.current) audioRef.current.currentTime = nextPosition
  }
  const togglePlayback = () => {
    const audio = audioRef.current
    if (!audio) return setPlaying((current) => !current)
    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }
    if (position >= duration) audio.currentTime = 0
    void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }
  return <div className="audio-player" style={{ '--audio-progress': `${position / duration * 100}%` } as CSSProperties}>
    {data.media?.url && <audio ref={audioRef} className="audio-native-source" src={data.media.url} preload="metadata" aria-label={`${data.title}音频`} onTimeUpdate={(event) => setPosition(Math.min(duration, event.currentTarget.currentTime))} onEnded={() => { setPosition(0); setPlaying(false) }} onPause={() => setPlaying(false)} />}
    <div className="audio-waveform-stage nodrag nowheel"><div className="audio-wave-bars" aria-hidden="true">{[...waveform, ...waveform].map((height, index) => <i key={index} style={{ height }} />)}</div><span className="audio-playhead" aria-hidden="true" /><input className="nodrag nowheel" type="range" min={0} max={duration} step={.05} value={position} onChange={(event) => seek(Number(event.target.value))} aria-label="音频播放进度" /></div>
    <footer className="audio-player-controls nodrag nowheel"><span>{formatAudioTime(position)} / {formatAudioTime(duration)}</span><button type="button" aria-label={playing ? '暂停音频' : '播放音频'} onClick={togglePlayback}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button><i aria-hidden="true" /></footer>
  </div>
}

export function AudioConfig({ id, data }: { id: string; data: CanvasNodeData }) {
  const { updateNode, runGeneration, beginReferenceSelection } = useCanvasActions()
  const params = data.params ?? {}
  const model = audioModels.find((item) => item.id === data.modelId) ?? audioModels[0]
  const isMureka = model.id === 'mureka-9'
  const isSpeech = model.id === 'minimax-speech-2.8'
  const [voicePickerOpen, setVoicePickerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pauseOpen, setPauseOpen] = useState(false)
  const [toneOpen, setToneOpen] = useState(false)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const pauseButtonRef = useRef<HTMLButtonElement>(null)
  const toneButtonRef = useRef<HTMLButtonElement>(null)
  const busy = data.status === 'queued' || data.status === 'running'
  const lyricMode = typeof params.lyricMode === 'string' ? params.lyricMode : 'smart'
  const musicType = typeof params.musicType === 'string' ? params.musicType : 'music'
  const voiceId = typeof params.voiceId === 'string' ? params.voiceId : 'elegant-senior'
  const voiceLabel = typeof params.voiceLabel === 'string' ? params.voiceLabel : '淡雅学姐'
  const setParams = (patch: Record<string, string | number | boolean>) => updateNode(id, { params: { ...params, ...patch } })
  const setModel = (modelId: string) => {
    const next = audioModels.find((item) => item.id === modelId) ?? audioModels[0]
    updateNode(id, {
      modeId: 'audio-generate',
      modelId: next.id,
      params: {
        ...Object.fromEntries(next.parameters.map((parameter) => [parameter.id, parameter.defaultValue])),
        ...(next.id === 'minimax-speech-2.8' ? { voiceId: 'elegant-senior', voiceLabel: '淡雅学姐' } : {}),
      },
    })
  }
  const appendToken = (token: string) => updateNode(id, { localPrompt: `${data.localPrompt ?? ''}${(data.localPrompt ?? '').trim() ? ' ' : ''}${token}` })
  return <section className={`audio-config node-panel zoom-stable-ui nodrag nowheel model-${model.id}`} aria-label="音频生成配置">
    {!isSpeech && <div className="audio-reference-actions" aria-label="音频参考与音色">
      {(data.references ?? []).map((reference) => <ReferenceChip key={reference.nodeId} targetId={id} reference={reference} />)}
      <button type="button" onClick={() => beginReferenceSelection(id)}><Plus size={14} />音频</button>
      {!isMureka && <button type="button" onClick={() => setVoicePickerOpen(true)}><Plus size={14} />音色库</button>}
    </div>}
    <div className="audio-prompt-composer">
      {isSpeech && <div className="audio-speech-tokens"><button ref={pauseButtonRef} type="button" onClick={() => { setPauseOpen((open) => !open); setToneOpen(false) }}>停顿</button><button ref={toneButtonRef} type="button" onClick={() => { setToneOpen((open) => !open); setPauseOpen(false) }}>语气词</button><AnchoredPopover anchorRef={pauseButtonRef} open={pauseOpen} onClose={() => setPauseOpen(false)} className="audio-token-menu" align="start" placement="top"><div role="menu" aria-label="选择停顿秒数">{audioPauseOptions.map((seconds) => <button type="button" key={seconds} onClick={() => { appendToken(`[停顿 ${seconds}s]`); setPauseOpen(false) }}>{seconds}s</button>)}</div></AnchoredPopover><AnchoredPopover anchorRef={toneButtonRef} open={toneOpen} onClose={() => setToneOpen(false)} className="audio-tone-menu" align="start" placement="top"><div role="menu" aria-label="选择语气词">{audioToneOptions.map((tone) => <button type="button" key={tone} onClick={() => { appendToken(`[${tone}]`); setToneOpen(false) }}>{tone}</button>)}</div></AnchoredPopover></div>}
      <textarea maxLength={isMureka ? 1024 : 3000} aria-label="音频生成提示词" placeholder={isMureka ? '输入风格、情绪、乐器等信息来生成音乐' : isSpeech ? '输入要合成的文本，可插入停顿和语气词' : '输入效果提示词和合成文本，支持上传参考音频'} value={data.localPrompt ?? ''} onChange={(event) => updateNode(id, { localPrompt: event.target.value })} />
      {isMureka && lyricMode === 'fixed' && <textarea maxLength={3000} className="audio-lyrics-input" aria-label="固定歌词" placeholder="在此输入或粘贴歌词…" value={typeof params.lyrics === 'string' ? params.lyrics : ''} onChange={(event) => setParams({ lyrics: event.target.value })} />}
      <span className="audio-prompt-count">{(data.localPrompt ?? '').length} / {isMureka ? 1024 : 3000}</span>
    </div>
    <footer>
      <span className="audio-config-mode">音频生成</span>
      <label className="audio-model-select"><span className="sr-only">音频模型</span><select aria-label="音频模型" value={model.id} onChange={(event) => setModel(event.target.value)}>{audioModels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {isMureka && <><label className="audio-compact-select"><span className="sr-only">音乐类型</span><select aria-label="音乐类型" value={musicType} onChange={(event) => setParams({ musicType: event.target.value })}><option value="music">音乐</option><option value="score">配乐</option></select></label><label className="audio-compact-select"><span className="sr-only">歌词模式</span><select aria-label="歌词模式" value={lyricMode} onChange={(event) => setParams({ lyricMode: event.target.value })}><option value="smart">智能模式</option><option value="fixed">固定歌词</option><option value="instrumental">纯音乐</option></select></label></>}
      {isSpeech && <button type="button" className="audio-voice-trigger" onClick={() => setVoicePickerOpen(true)} aria-label="选择音色">{voiceLabel}<ChevronDown size={12} /></button>}
      {!isMureka && <><button ref={settingsButtonRef} type="button" className="audio-settings-trigger" onClick={() => setSettingsOpen((open) => !open)}><SlidersHorizontal size={14} />{isSpeech ? '高级设置' : '设置'}</button><AudioAdvancedSettings anchorRef={settingsButtonRef} open={settingsOpen} onClose={() => setSettingsOpen(false)} params={params} onChange={setParams} /></>}
      <span className="panel-spacer" />
      <span className="generation-cost"><span className="chestnut-dot" />{data.cost ?? 12}</span>
      <button type="button" className="generate-button" onClick={() => runGeneration(id)} disabled={busy || (!(data.localPrompt ?? '').trim() && !(data.references?.length))} aria-label={busy ? '音频生成中' : '生成音频'}>{busy ? <Pause size={16} /> : <ArrowUp size={17} />}</button>
    </footer>
    {voicePickerOpen && <VoicePicker value={{ id: voiceId, label: voiceLabel }} onChange={(voice) => setParams({ voiceId: voice.id, voiceLabel: voice.label })} onClose={() => setVoicePickerOpen(false)} />}
  </section>
}

export const AudioNode = memo(function AudioNode({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const { notify, selectedItemCount, isConnectionTargetCandidate, interactionMode, isInteractionCandidate, uploadNodeMedia } = useCanvasActions()
  const verifySeedance = useSeedanceCompliance(id)
  const [trimming, setTrimming] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const nodeRef = useRef<HTMLElement>(null)
  const overlayVariables = useStableOverlayVariables()
  const duration = data.media?.duration ?? data.duration ?? 12
  const hasContent = Boolean((data.content ?? '').trim() || data.media?.url)
  const focused = selected && selectedItemCount === 1
  const candidate = isConnectionTargetCandidate(id)
  const interactionClass = interactionNodeClass(id, interactionMode, isInteractionCandidate(id))
  useEffect(() => { if (!focused) setTrimming(false) }, [focused])
  useKeepNodeOverlayInViewport(nodeRef, focused && !trimming ? '.audio-config' : null)
  return <article ref={nodeRef} className={`canvas-node audio-node ${selected ? 'is-selected' : ''} ${candidate ? 'is-connection-candidate' : ''} ${hasContent ? '' : 'is-empty'} ${trimming ? 'is-trimming' : ''} ${interactionClass}`} style={overlayVariables}>
    <ConnectionHandles nodeId={id} />
    {focused && hasContent && !trimming && <div className="media-toolbar compact-media-toolbar zoom-stable-ui nodrag"><IconAction label="裁剪音频" onClick={() => setTrimming(true)}><Scissors size={15} /></IconAction><IconAction label="Seedance 2.0 合规验证" onClick={verifySeedance}><ShieldCheck size={15} /></IconAction><span className="toolbar-divider" /><PinControl id={id} value={data.pinColor} /><IconAction label="下载音频" onClick={() => { startDownload(`${data.title}.txt`, '', data.content ?? ''); notify('已下载音频') }}><Download size={15} /></IconAction></div>}
    <NodeHeader id={id} data={data} icon={<Waves size={13} />} draggable />
    {focused && !hasContent && canUploadToEmptyMediaNode(data) && <><button type="button" className="empty-node-upload nodrag" onClick={() => uploadInputRef.current?.click()}><Upload size={14} />上传</button><input ref={uploadInputRef} className="sr-only" type="file" accept="audio/*,video/*" aria-label="上传音频或视频到当前节点" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadNodeMedia(id, file); event.currentTarget.value = '' }} /></>}
    <div className="node-surface audio-surface">
      {hasContent ? trimming ? <AudioTrimEditor id={id} duration={duration} sourceUrl={data.media?.url} onCancel={() => setTrimming(false)} /> : <AudioPlayer data={data} /> : <div className="empty-media-node empty-audio-node"><Music2 size={28} /><strong className="sr-only">音频</strong></div>}
    </div>
    {focused && !trimming && <AudioConfig id={id} data={data} />}
  </article>
})

export const nodeTypes = { text: TextNode, image: ImageNode, video: VideoNode, audio: AudioNode }
