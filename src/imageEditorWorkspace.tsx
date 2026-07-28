import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  ActiveSelection,
  Canvas,
  Circle as FabricCircle,
  Control,
  FabricImage,
  FabricObject,
  Group,
  IText,
  Line,
  Path,
  PencilBrush,
  Point,
  Polygon,
  Polyline,
  Rect,
  StaticCanvas,
  Textbox,
  controlsUtils,
  util,
  type TPointerEventInfo,
} from 'fabric'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpRight,
  ArrowUpToLine,
  Bold,
  CaseUpper,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Copy,
  Crop,
  Download,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Focus,
  FolderOpen,
  Image as ImageIcon,
  Italic,
  LoaderCircle,
  MousePointer2,
  Palette,
  PaintBucket,
  Pencil,
  Redo2,
  RotateCcw,
  Save,
  ScanLine,
  SlidersHorizontal,
  Shapes,
  Square,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Undo2,
  Upload,
  UserRound,
  Video,
  WandSparkles,
  X,
} from 'lucide-react'
import type {
  ImageEditorAspectRatio,
  ImageEditorAsset,
  ImageEditorCommitPayload,
  ImageEditorCommitResult,
  ImageEditorComposition,
  ImageEditorGenerateRequest,
  ImageEditorLayer,
  VideoResolution,
} from './types'
import {
  collectCurrentSourceNodeIds,
  containScale,
  fitZoom,
  orderPsdLayers,
  scaledExportDimensions,
} from './imageEditorBehavior'
import { imageEditorDimensions } from './imageEditorModel'
import type { Layer as PsdLayer, Psd } from 'ag-psd'

export interface ImageEditorWorkspaceProps {
  source?: ImageEditorAsset
  assets: ImageEditorAsset[]
  historyAssets?: ImageEditorAsset[]
  initialComposition?: ImageEditorComposition
  onClose: () => void
  onSave: (payload: ImageEditorCommitPayload) => ImageEditorCommitResult | Promise<ImageEditorCommitResult>
  onGenerate?: (request: ImageEditorGenerateRequest) => void | Promise<void>
}

type EditorTool = 'select' | 'brush' | 'eraser' | 'rectangle' | 'arrow' | 'pen' | 'text' | 'upload'
type RailMode = 'assets' | 'history' | 'shapes' | null
type AssetLibraryTab = 'all' | 'generated' | 'favorite' | 'uncategorized'
type ObjectKind = 'image' | 'generated-image' | 'rectangle' | 'shape' | 'arrow' | 'brush' | 'eraser' | 'pen' | 'text' | 'pose'
type ExportFormat = 'png' | 'jpeg' | 'psd'
type PropertyPanel = 'background' | 'fill' | 'stroke' | 'strokeWidth' | 'strokeStyle' | 'opacity' | 'cornerRadius' | 'font' | 'charSpacing' | 'lineHeight' | 'drawColor' | null

type EditorObject = FabricObject & {
  id?: string
  objectKind?: ObjectKind
  label?: string
  sourceNodeId?: string
  assetSrc?: string
  originalLeft?: number
  originalTop?: number
  originalScaleX?: number
  originalScaleY?: number
  cropRatio?: string
  strokeStyle?: 'solid' | 'dashed' | 'dotted'
  eraserData?: Array<Record<string, unknown>>
  baseClipPathData?: Record<string, unknown>
  penAnchors?: SerializedPenAnchor[]
  penClosed?: boolean
}

interface SerializedPoint {
  x: number
  y: number
}

interface SerializedPenAnchor {
  current: SerializedPoint
  previousControl?: SerializedPoint
  nextControl?: SerializedPoint
}

interface EditorSnapshot {
  width: number
  height: number
  aspectRatio: ImageEditorAspectRatio
  backgroundColor: string
  fabricJson: Record<string, unknown>
}

interface LayerDescriptor {
  id: string
  kind: ObjectKind
  label: string
  imageSrc?: string
  fill?: string
}

interface DrawState {
  tool: 'rectangle' | 'arrow'
  start: { x: number; y: number }
  object: EditorObject
}

interface PosePoint {
  id: string
  x: number
  y: number
}

interface PoseSelectionDragState {
  pointerId: number
  start: { x: number; y: number }
  current: { x: number; y: number }
  initialSelection: string[]
  additive: boolean
}

interface LayerContextMenuState {
  layerId: string
  x: number
  y: number
}

interface LayerPointerDragState {
  layerId: string
  pointerId: number
  startX: number
  startY: number
  activated: boolean
  cancelled: boolean
}

interface PenAnchor {
  current: Point
  previousControl?: Point
  nextControl?: Point
}

interface PenDragState {
  type: 'anchor' | 'previousControl' | 'nextControl' | 'newControl'
  index: number
  offset: Point
}

interface WorkspacePanState {
  pointerId: number
  startClientX: number
  startClientY: number
  startScrollLeft: number
  startScrollTop: number
}

interface CanvasResizeState {
  edge: 'top' | 'right' | 'bottom' | 'left'
  pointerId: number
  startClientX: number
  startClientY: number
  startWidth: number
  startHeight: number
  objectPositions: Array<{ object: EditorObject; left: number; top: number; originalLeft?: number; originalTop?: number }>
}

interface CropImageState {
  image: FabricImage
  cropRect: Rect
  overlayRect: Rect
  objectInteractions: Array<{
    object: FabricObject
    selectable: boolean
    evented: boolean
  }>
  historyWasSuspended: boolean
  before: {
    cropX: number
    cropY: number
    width: number
    height: number
    left: number
    top: number
    originX: FabricObject['originX']
    originY: FabricObject['originY']
    scaleX: number
    scaleY: number
    selectable: boolean
    evented: boolean
  }
}

const CUSTOM_PROPERTIES = [
  'id',
  'objectKind',
  'label',
  'sourceNodeId',
  'assetSrc',
  'originalLeft',
  'originalTop',
  'originalScaleX',
  'originalScaleY',
  'cropRatio',
  'strokeStyle',
  'eraserData',
  'baseClipPathData',
  'penAnchors',
  'penClosed',
]

FabricObject.customProperties = Array.from(new Set([...FabricObject.customProperties, ...CUSTOM_PROPERTIES]))

const DEFAULT_BACKGROUND = '#ffffff'
const DEFAULT_COLOR = '#f0453d'
const MAX_HISTORY = 50
const EXPORT_SCALES = [0.5, 0.75, 1, 1.5, 2, 3]
const VIDEO_DURATIONS = Array.from({ length: 12 }, (_, index) => index + 4)
const VIDEO_RESOLUTIONS: VideoResolution[] = ['720p', '1080p']
const VIDEO_ASPECT_RATIOS: ImageEditorAspectRatio[] = ['16:9', '9:16', '1:1', '4:3', '3:4']
const VIDEO_ASPECT_RATIO_SET = new Set<ImageEditorAspectRatio>(VIDEO_ASPECT_RATIOS)
const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
const FIT_VIEWPORT_RATIO = 0.6
const SOURCE_ARTBOARD_DIMENSIONS = { width: 1900, height: 1000 }
const FABRIC_CLIPBOARD_PREFIX = 'tapnow-fabric-object:'
const PEN_ANCHOR_RADIUS = 7
const PEN_CONTROL_RADIUS = 6
const PEN_HIT_RADIUS = 10
const aspectRatios: ImageEditorAspectRatio[] = ['custom', '16:9', '9:16', '4:3', '3:4', '1:1', '3:2', '2:3', '7:4', '4:7', '21:9']
const COLOR_SWATCHES = ['#ffffff', '#111111', '#f0453d', '#f59e0b', '#22c55e', '#2f80ed', '#8b5cf6', '#ec4899']
const DRAW_COLOR_SWATCHES = ['#1f4a61', '#5f9fc1', '#fab4c7', '#ffecac']
const FONT_OPTIONS = [
  ['Open Sans, PingFang SC, system-ui, sans-serif', 'Open Sans'],
  ['PingFang SC, Microsoft YaHei, sans-serif', '苹方 / 微软雅黑'],
  ['Arial, sans-serif', 'Arial'],
  ['Georgia, serif', 'Georgia'],
  ['Courier New, monospace', 'Courier New'],
] as const

const initialPosePoints: PosePoint[] = [
  { id: 'head', x: 50, y: 17 },
  { id: 'neck', x: 50, y: 30 },
  { id: 'left-shoulder', x: 41, y: 37 },
  { id: 'left-elbow', x: 31, y: 50 },
  { id: 'left-hand', x: 25, y: 65 },
  { id: 'right-shoulder', x: 59, y: 37 },
  { id: 'right-elbow', x: 69, y: 50 },
  { id: 'right-hand', x: 75, y: 65 },
  { id: 'hip', x: 50, y: 56 },
  { id: 'left-knee', x: 44, y: 74 },
  { id: 'left-foot', x: 40, y: 92 },
  { id: 'right-knee', x: 56, y: 74 },
  { id: 'right-foot', x: 60, y: 92 },
]

const poseConnections = [
  ['head', 'neck'],
  ['neck', 'left-shoulder'],
  ['left-shoulder', 'left-elbow'],
  ['left-elbow', 'left-hand'],
  ['neck', 'right-shoulder'],
  ['right-shoulder', 'right-elbow'],
  ['right-elbow', 'right-hand'],
  ['neck', 'hip'],
  ['hip', 'left-knee'],
  ['left-knee', 'left-foot'],
  ['hip', 'right-knee'],
  ['right-knee', 'right-foot'],
] as const

function createId(prefix: string) {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${suffix}`
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function parseColor(value: unknown, fallback = '#111111') {
  const input = typeof value === 'string' ? value.trim() : fallback
  const shortHex = input.match(/^#([0-9a-f]{3})([0-9a-f])?$/i)
  if (shortHex) {
    const rgb = shortHex[1].split('').map((part) => Number.parseInt(`${part}${part}`, 16))
    const alpha = shortHex[2] ? Number.parseInt(`${shortHex[2]}${shortHex[2]}`, 16) / 255 : 1
    return { r: rgb[0], g: rgb[1], b: rgb[2], a: alpha }
  }
  const longHex = input.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i)
  if (longHex) {
    const valueAsNumber = Number.parseInt(longHex[1], 16)
    return {
      r: (valueAsNumber >> 16) & 255,
      g: (valueAsNumber >> 8) & 255,
      b: valueAsNumber & 255,
      a: longHex[2] ? Number.parseInt(longHex[2], 16) / 255 : 1,
    }
  }
  const rgba = input.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i)
  if (rgba) return {
    r: clamp(Math.round(Number(rgba[1])), 0, 255),
    g: clamp(Math.round(Number(rgba[2])), 0, 255),
    b: clamp(Math.round(Number(rgba[3])), 0, 255),
    a: clamp(rgba[4] === undefined ? 1 : Number(rgba[4]), 0, 1),
  }
  return parseColor(fallback, '#111111')
}

function colorToCss(color: { r: number; g: number; b: number; a: number }) {
  const r = clamp(Math.round(color.r), 0, 255)
  const g = clamp(Math.round(color.g), 0, 255)
  const b = clamp(Math.round(color.b), 0, 255)
  const a = clamp(color.a, 0, 1)
  if (a >= 0.999) return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(2))})`
}

function colorToHex(value: unknown, fallback = '#111111') {
  const { r, g, b } = parseColor(value, fallback)
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function colorToHsv(value: { r: number; g: number; b: number }) {
  const red = value.r / 255
  const green = value.g / 255
  const blue = value.b / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const delta = maximum - minimum
  let hue = 0
  if (delta) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6)
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2)
    else hue = 60 * ((red - green) / delta + 4)
  }
  if (hue < 0) hue += 360
  return {
    h: hue,
    s: maximum ? delta / maximum : 0,
    v: maximum,
  }
}

function hsvToColor(hue: number, saturation: number, value: number, alpha: number) {
  const normalizedHue = ((hue % 360) + 360) % 360
  const chroma = value * saturation
  const section = normalizedHue / 60
  const secondary = chroma * (1 - Math.abs(section % 2 - 1))
  const match = value - chroma
  const [red, green, blue] = section < 1
    ? [chroma, secondary, 0]
    : section < 2
      ? [secondary, chroma, 0]
      : section < 3
        ? [0, chroma, secondary]
        : section < 4
          ? [0, secondary, chroma]
          : section < 5
            ? [secondary, 0, chroma]
            : [chroma, 0, secondary]
  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
    a: clamp(alpha, 0, 1),
  }
}

function rgbaText(value: { r: number; g: number; b: number; a: number }) {
  return `rgba(${value.r}, ${value.g}, ${value.b}, ${Number(value.a.toFixed(2))})`
}

function parseRgbaText(value: string) {
  const match = value.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i)
  if (!match) return null
  const parsed = {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  }
  if (Object.values(parsed).some((channel) => !Number.isFinite(channel))) return null
  return {
    r: clamp(Math.round(parsed.r), 0, 255),
    g: clamp(Math.round(parsed.g), 0, 255),
    b: clamp(Math.round(parsed.b), 0, 255),
    a: clamp(parsed.a, 0, 1),
  }
}

function dimensionsForRatio(ratio: ImageEditorAspectRatio, currentWidth: number, currentHeight: number) {
  if (ratio === 'custom') return { width: currentWidth, height: currentHeight }
  return imageEditorDimensions(ratio)
}

function initialDimensions(source?: ImageEditorAsset, composition?: ImageEditorComposition) {
  if (composition?.width && composition?.height) return { width: composition.width, height: composition.height }
  if (source) return { ...SOURCE_ARTBOARD_DIMENSIONS }
  return imageEditorDimensions('custom')
}

function objectLabel(object: EditorObject) {
  if (object.label) return object.label
  if (object instanceof IText || object instanceof Textbox) return object.text || '文字'
  const labels: Record<ObjectKind, string> = {
    image: '图片',
    'generated-image': '生成结果',
    rectangle: '矩形',
    shape: '图形',
    arrow: '箭头',
    brush: '自由画笔',
    eraser: '橡皮擦',
    pen: 'Pen Tool',
    text: '文字',
    pose: '姿势参考',
  }
  return labels[object.objectKind || 'shape']
}

function configureObject(object: EditorObject, metadata: Partial<EditorObject> = {}) {
  Object.assign(object, {
    id: object.id || createId('editor-object'),
    objectKind: object.objectKind || 'shape',
    label: object.label || '图层',
    originalLeft: object.originalLeft ?? object.left,
    originalTop: object.originalTop ?? object.top,
    originalScaleX: object.originalScaleX ?? object.scaleX,
    originalScaleY: object.originalScaleY ?? object.scaleY,
    ...metadata,
  })
  object.set({
    borderColor: '#c4886a',
    cornerColor: '#ffffff',
    cornerStrokeColor: '#c4886a',
    cornerStyle: 'rect',
    cornerSize: 9,
    transparentCorners: false,
    padding: 0,
  })
  object.setCoords()
  return object
}

function setCanvasDimensions(canvas: Canvas, width: number, height: number) {
  canvas.setDimensions({ width, height })
  canvas.wrapperEl.style.width = '100%'
  canvas.wrapperEl.style.height = '100%'
  canvas.lowerCanvasEl.style.width = '100%'
  canvas.lowerCanvasEl.style.height = '100%'
  canvas.upperCanvasEl.style.width = '100%'
  canvas.upperCanvasEl.style.height = '100%'
  canvas.calcOffset()
}

function snapshotSignature(snapshot: EditorSnapshot) {
  return JSON.stringify(snapshot)
}

const FOCUSABLE_SELECTOR = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'

function focusableElements(scope: HTMLElement) {
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.closest('[inert], [aria-hidden="true"]'))
}

function serializeCanvas(canvas: Canvas) {
  const json = canvas.toJSON() as Record<string, unknown> & { objects?: Array<Record<string, unknown>> }
  json.objects = json.objects?.filter((object) => object.excludeFromExport !== true)
  json.objects?.forEach((object) => {
    object.selectable = true
    object.evented = true
  })
  return json
}

function triggerDownload(dataUrl: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'))
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}

function parseFabricClipboard(text: string): Record<string, unknown>[] | null {
  const source = text.startsWith(FABRIC_CLIPBOARD_PREFIX) ? text.slice(FABRIC_CLIPBOARD_PREFIX.length) : text
  try {
    const parsed = JSON.parse(source) as { type?: unknown; data?: unknown }
    if (parsed.type !== 'fabric-object' || !parsed.data) return null
    const objects = Array.isArray(parsed.data) ? parsed.data : [parsed.data]
    return objects.filter((object): object is Record<string, unknown> => Boolean(object) && typeof object === 'object')
  } catch {
    return null
  }
}

function renderCanvasWithBackground(canvas: Canvas, multiplier: number, backgroundColor: string) {
  const rendered = canvas.toCanvasElement(multiplier, {
    filter: (object) => !object.excludeFromExport,
  })
  const flattened = document.createElement('canvas')
  flattened.width = rendered.width
  flattened.height = rendered.height
  const context = flattened.getContext('2d')
  if (!context) throw new Error('浏览器不支持画布导出')
  context.fillStyle = backgroundColor
  context.fillRect(0, 0, flattened.width, flattened.height)
  context.drawImage(rendered, 0, 0)
  return flattened
}

function createSolidCanvas(width: number, height: number, color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器不支持画布导出')
  context.fillStyle = color
  context.fillRect(0, 0, width, height)
  return canvas
}

async function renderObjectLayer(
  object: EditorObject,
  width: number,
  height: number,
  multiplier: number,
) {
  const element = document.createElement('canvas')
  const layerCanvas = new StaticCanvas(element, { width, height, backgroundColor: 'transparent' })
  try {
    const cloned = await object.clone(CUSTOM_PROPERTIES) as EditorObject
    cloned.set({ selectable: false, evented: false, visible: true, opacity: 1 })
    layerCanvas.add(cloned)
    layerCanvas.requestRenderAll()
    return layerCanvas.toCanvasElement(multiplier)
  } finally {
    void layerCanvas.dispose()
  }
}

async function applyEraserPathToObject(object: EditorObject, sourcePath: Path) {
  const localPath = await sourcePath.clone() as Path
  const desiredTransform = util.multiplyTransformMatrices(
    util.invertTransform(object.calcTransformMatrix()),
    localPath.calcTransformMatrix(),
  )
  util.applyTransformToObject(localPath, desiredTransform)
  localPath.set({ selectable: false, evented: false })
  if (!object.eraserData?.length && object.clipPath && !object.baseClipPathData) {
    object.baseClipPathData = object.clipPath.toObject() as unknown as Record<string, unknown>
  }
  const eraserData = [
    ...(object.eraserData || []),
    localPath.toObject() as unknown as Record<string, unknown>,
  ]
  const paths = await util.enlivenObjects<Path>(structuredClone(eraserData))
  const clipPath = new Group(paths, {
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
  })
  clipPath.inverted = true
  if (object.baseClipPathData) {
    const [baseClipPath] = await util.enlivenObjects<FabricObject>([structuredClone(object.baseClipPathData)])
    if (baseClipPath) {
      baseClipPath.set({ selectable: false, evented: false })
      clipPath.clipPath = baseClipPath
    }
  }
  object.eraserData = eraserData
  object.clipPath = clipPath
  object.dirty = true
}

async function materializeImageEraser(canvas: Canvas, image: FabricImage & EditorObject) {
  if (!image.eraserData?.length) return image
  const index = canvas.getObjects().indexOf(image)
  if (index < 0) return image

  const center = image.getCenterPoint()
  const visualWidth = image.getScaledWidth()
  const visualHeight = image.getScaledHeight()
  const rendered = image.toCanvasElement({
    enableRetinaScaling: false,
    withoutShadow: true,
    withoutTransform: true,
  })
  const renderedSrc = rendered.toDataURL('image/png')
  const replacement = await FabricImage.fromURL(renderedSrc) as FabricImage & EditorObject
  replacement.set({
    left: center.x,
    top: center.y,
    originX: 'center',
    originY: 'center',
    angle: image.angle,
    flipX: image.flipX,
    flipY: image.flipY,
    scaleX: visualWidth / Math.max(1, replacement.width),
    scaleY: visualHeight / Math.max(1, replacement.height),
    opacity: image.opacity,
  })
  configureObject(replacement, {
    id: image.id,
    objectKind: image.objectKind,
    label: image.label,
    sourceNodeId: image.sourceNodeId,
    assetSrc: renderedSrc,
    originalLeft: image.originalLeft,
    originalTop: image.originalTop,
    originalScaleX: image.originalScaleX,
    originalScaleY: image.originalScaleY,
    cropRatio: image.cropRatio,
  })
  canvas.remove(image)
  canvas.insertAt(index, replacement)
  canvas.setActiveObject(replacement)
  canvas.requestRenderAll()
  return replacement
}

function penPathData(anchors: PenAnchor[], closed: boolean) {
  const commands: Array<[string, ...number[]]> = []
  anchors.forEach((anchor, index) => {
    if (index === 0) {
      commands.push(['M', anchor.current.x, anchor.current.y])
      return
    }
    const previous = anchors[index - 1]
    if (previous.nextControl && anchor.previousControl) {
      commands.push(['C', previous.nextControl.x, previous.nextControl.y, anchor.previousControl.x, anchor.previousControl.y, anchor.current.x, anchor.current.y])
    } else if (previous.nextControl || anchor.previousControl) {
      const control = previous.nextControl || anchor.previousControl!
      commands.push(['Q', control.x, control.y, anchor.current.x, anchor.current.y])
    } else {
      commands.push(['L', anchor.current.x, anchor.current.y])
    }
  })
  if (closed && anchors.length > 1) {
    const last = anchors[anchors.length - 1]
    const first = anchors[0]
    if (last.nextControl && first.previousControl) {
      commands.push(['C', last.nextControl.x, last.nextControl.y, first.previousControl.x, first.previousControl.y, first.current.x, first.current.y])
    } else if (last.nextControl || first.previousControl) {
      const control = last.nextControl || first.previousControl!
      commands.push(['Q', control.x, control.y, first.current.x, first.current.y])
    } else {
      commands.push(['L', first.current.x, first.current.y])
    }
    commands.push(['Z'])
  }
  return commands.map((command) => command.join(' ')).join(' ')
}

function mirrorPoint(anchor: Point, control: Point) {
  return new Point(anchor.x * 2 - control.x, anchor.y * 2 - control.y)
}

function pointDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function calculatePenControls(anchors: PenAnchor[], closed: boolean) {
  const factor = 0.3
  anchors.forEach((anchor, index) => {
    const previousIndex = index === 0 ? (closed ? anchors.length - 1 : -1) : index - 1
    const nextIndex = index === anchors.length - 1 ? (closed ? 0 : -1) : index + 1
    if (previousIndex < 0) {
      const next = anchors[nextIndex]
      anchor.previousControl = undefined
      anchor.nextControl = next
        ? new Point(
            anchor.current.x + (next.current.x - anchor.current.x) * factor,
            anchor.current.y + (next.current.y - anchor.current.y) * factor,
          )
        : undefined
      return
    }
    if (nextIndex < 0) {
      const previous = anchors[previousIndex]
      anchor.nextControl = undefined
      anchor.previousControl = previous
        ? new Point(
            anchor.current.x - (anchor.current.x - previous.current.x) * factor,
            anchor.current.y - (anchor.current.y - previous.current.y) * factor,
          )
        : undefined
      return
    }
    const previous = anchors[previousIndex]
    const next = anchors[nextIndex]
    if (!previous || !next) return
    const spanX = next.current.x - previous.current.x
    const spanY = next.current.y - previous.current.y
    const spanLength = Math.hypot(spanX, spanY)
    if (!spanLength) return
    const directionX = spanX / spanLength
    const directionY = spanY / spanLength
    const previousDistance = pointDistance(anchor.current, previous.current)
    const nextDistance = pointDistance(next.current, anchor.current)
    anchor.previousControl = new Point(
      anchor.current.x - directionX * previousDistance * factor,
      anchor.current.y - directionY * previousDistance * factor,
    )
    anchor.nextControl = new Point(
      anchor.current.x + directionX * nextDistance * factor,
      anchor.current.y + directionY * nextDistance * factor,
    )
  })
}

function cropControl() {
  return new Control({
    x: 0.5,
    y: 0.5,
    offsetX: -22,
    offsetY: -22,
    actionHandler: controlsUtils.scalingEqually,
    cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler,
    actionName: 'scale',
    render(context, left, top) {
      context.save()
      context.fillStyle = '#e86b31'
      context.beginPath()
      context.arc(left, top, 14, 0, Math.PI * 2)
      context.fill()
      context.strokeStyle = '#ffffff'
      context.lineWidth = 2
      context.lineCap = 'round'
      context.beginPath()
      context.moveTo(left - 5, top + 5)
      context.lineTo(left + 5, top - 5)
      context.moveTo(left + 1, top - 5)
      context.lineTo(left + 5, top - 5)
      context.lineTo(left + 5, top - 1)
      context.moveTo(left - 1, top + 5)
      context.lineTo(left - 5, top + 5)
      context.lineTo(left - 5, top + 1)
      context.stroke()
      context.restore()
    },
  })
}

function transformPenAnchor(anchor: PenAnchor, matrix: ReturnType<EditorObject['calcTransformMatrix']>): PenAnchor {
  return {
    current: util.transformPoint(anchor.current, matrix),
    previousControl: anchor.previousControl ? util.transformPoint(anchor.previousControl, matrix) : undefined,
    nextControl: anchor.nextControl ? util.transformPoint(anchor.nextControl, matrix) : undefined,
  }
}

function serializePenAnchors(anchors: PenAnchor[], object: EditorObject): SerializedPenAnchor[] {
  const inverse = util.invertTransform(object.calcTransformMatrix())
  return anchors.map((anchor) => {
    const transformed = transformPenAnchor(anchor, inverse)
    return {
      current: { x: transformed.current.x, y: transformed.current.y },
      previousControl: transformed.previousControl
        ? { x: transformed.previousControl.x, y: transformed.previousControl.y }
        : undefined,
      nextControl: transformed.nextControl
        ? { x: transformed.nextControl.x, y: transformed.nextControl.y }
        : undefined,
    }
  })
}

function restorePenAnchors(anchors: SerializedPenAnchor[], object: EditorObject): PenAnchor[] {
  const matrix = object.calcTransformMatrix()
  return anchors.map((anchor) => transformPenAnchor({
    current: new Point(anchor.current.x, anchor.current.y),
    previousControl: anchor.previousControl ? new Point(anchor.previousControl.x, anchor.previousControl.y) : undefined,
    nextControl: anchor.nextControl ? new Point(anchor.nextControl.x, anchor.nextControl.y) : undefined,
  }, matrix))
}

function starPoints(outerRadius: number, innerRadius: number) {
  return Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outerRadius : innerRadius
    const angle = -Math.PI / 2 + index * Math.PI / 5
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
  })
}

function setObjectBox(object: FabricObject, width: number, height: number) {
  const unscaledWidth = Math.max(object.width || 1, 1)
  const unscaledHeight = Math.max(object.height || 1, 1)
  object.set({ scaleX: width / unscaledWidth, scaleY: height / unscaledHeight })
}

async function migrateLegacyLayers(layers: ImageEditorLayer[], canvasWidth: number, canvasHeight: number) {
  const migrated: EditorObject[] = []
  for (const layer of layers) {
    if (layer.kind === 'brush') {
      const brush = new Polyline(layer.points.map((point) => ({ x: point.x / 100 * canvasWidth, y: point.y / 100 * canvasHeight })), {
        fill: 'transparent',
        stroke: layer.color,
        strokeWidth: Math.max(2, layer.size / 100 * Math.min(canvasWidth, canvasHeight)),
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        objectCaching: false,
      }) as EditorObject
      migrated.push(configureObject(brush, { id: layer.id, objectKind: 'brush', label: '自由画笔', originalLeft: brush.left, originalTop: brush.top, strokeStyle: 'solid' }))
      continue
    }

    const left = layer.x / 100 * canvasWidth
    const top = layer.y / 100 * canvasHeight
    const targetWidth = Math.max(1, layer.width / 100 * canvasWidth)
    const targetHeight = Math.max(1, layer.height / 100 * canvasHeight)
    let object: EditorObject | null = null
    if (layer.kind === 'image') {
      try {
        const image = await FabricImage.fromURL(layer.src, { crossOrigin: 'anonymous' })
        image.set({ left, top, originX: 'center', originY: 'center', angle: layer.rotation || 0 })
        setObjectBox(image, targetWidth, targetHeight)
        object = image as EditorObject
        configureObject(object, {
          id: layer.id,
          objectKind: 'image',
          label: layer.label,
          sourceNodeId: layer.sourceNodeId,
          assetSrc: layer.src,
          originalLeft: left,
          originalTop: top,
        })
      } catch {
        object = null
      }
    } else if (layer.kind === 'text') {
      const text = new IText(layer.text, {
        left,
        top,
        originX: 'center',
        originY: 'center',
        angle: layer.rotation || 0,
        fill: layer.color,
        fontSize: Math.max(12, layer.fontSize * canvasWidth / 720),
        fontFamily: layer.fontFamily || 'Open Sans, PingFang SC, system-ui, sans-serif',
        fontWeight: layer.weight,
        fontStyle: layer.fontStyle || 'normal',
        underline: layer.underline,
        linethrough: layer.strikeThrough,
        textAlign: layer.textAlign || 'left',
        charSpacing: layer.letterSpacing ? layer.letterSpacing / Math.max(layer.fontSize, 1) * 1000 : 0,
      }) as EditorObject
      object = configureObject(text, { id: layer.id, objectKind: 'text', label: layer.text || '文字', originalLeft: left, originalTop: top })
    } else if (layer.kind === 'arrow') {
      const arrow = new Path('M 0 25 L 100 25 M 73 0 L 100 25 L 73 50', {
        left,
        top,
        originX: 'center',
        originY: 'center',
        angle: layer.rotation || 0,
        fill: 'transparent',
        stroke: layer.color,
        strokeWidth: 7,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      }) as EditorObject
      setObjectBox(arrow, targetWidth, targetHeight)
      object = configureObject(arrow, { id: layer.id, objectKind: 'arrow', label: '箭头', originalLeft: left, originalTop: top, strokeStyle: 'solid' })
    } else {
      if (layer.shape === 'rectangle') {
        object = new Rect({ left, top, width: targetWidth, height: targetHeight, originX: 'center', originY: 'center', angle: layer.rotation || 0, fill: layer.fill, stroke: layer.stroke, strokeWidth: 4 }) as EditorObject
      } else if (layer.shape === 'circle') {
        const circle = new FabricCircle({ left, top, radius: 50, originX: 'center', originY: 'center', angle: layer.rotation || 0, fill: layer.fill, stroke: layer.stroke, strokeWidth: 4 }) as EditorObject
        setObjectBox(circle, targetWidth, targetHeight)
        object = circle
      } else if (layer.shape === 'line') {
        object = new Line([-targetWidth / 2, 0, targetWidth / 2, 0], { left, top, originX: 'center', originY: 'center', angle: layer.rotation || 0, stroke: layer.stroke, strokeWidth: Math.max(4, targetHeight * 0.35), strokeLineCap: 'round' }) as EditorObject
      } else if (layer.shape === 'star') {
        const star = new Polygon(starPoints(100, 45), { left, top, originX: 'center', originY: 'center', angle: layer.rotation || 0, fill: layer.fill, stroke: layer.stroke, strokeWidth: 4 }) as EditorObject
        setObjectBox(star, targetWidth, targetHeight)
        object = star
      } else if (layer.shape === 'triangle') {
        const triangle = new Polygon([{ x: 0, y: -100 }, { x: 100, y: 85 }, { x: -100, y: 85 }], { left, top, originX: 'center', originY: 'center', angle: layer.rotation || 0, fill: layer.fill, stroke: layer.stroke, strokeWidth: 4 }) as EditorObject
        setObjectBox(triangle, targetWidth, targetHeight)
        object = triangle
      } else if (layer.shape === 'speech') {
        const speech = new Path('M 0 0 L 300 0 L 300 190 L 175 190 L 105 260 L 112 190 L 0 190 Z', { left, top, originX: 'center', originY: 'center', angle: layer.rotation || 0, fill: layer.fill, stroke: layer.stroke, strokeWidth: 4, strokeLineJoin: 'round' }) as EditorObject
        setObjectBox(speech, targetWidth, targetHeight)
        object = speech
      } else {
        const sparkles = new Path('M 110 0 L 132 78 L 210 105 L 132 132 L 110 215 L 87 132 L 10 105 L 87 78 Z M 250 120 L 262 158 L 300 170 L 262 182 L 250 220 L 238 182 L 200 170 L 238 158 Z', { left, top, originX: 'center', originY: 'center', angle: layer.rotation || 0, fill: layer.fill, stroke: layer.stroke, strokeWidth: 4, strokeLineJoin: 'round' }) as EditorObject
        setObjectBox(sparkles, targetWidth, targetHeight)
        object = sparkles
      }
      if (object) configureObject(object, { id: layer.id, objectKind: layer.shape === 'rectangle' ? 'rectangle' : 'shape', label: ({ rectangle: '矩形', circle: '圆形', line: '直线', star: '星形', triangle: '三角形', speech: '对话框', sparkles: '闪光' })[layer.shape], originalLeft: left, originalTop: top, strokeStyle: 'solid' })
    }
    if (object) migrated.push(object)
  }
  return migrated
}

function ToolButton({ active = false, disabled = false, label, children, onClick }: {
  active?: boolean
  disabled?: boolean
  label: string
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`image-editor-tool-button ${active ? 'active' : ''}`}
      data-tooltip={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ColorPanelContent({ label, value, onChange, swatches = COLOR_SWATCHES, showSectionLabels = false }: {
  label: string
  value: unknown
  onChange: (value: string) => void
  swatches?: string[]
  showSectionLabels?: boolean
}) {
  const channels = parseColor(value)
  const hsv = colorToHsv(channels)
  const formattedRgba = rgbaText(channels)
  const [rgbaValue, setRgbaValue] = useState(formattedRgba)

  useEffect(() => setRgbaValue(formattedRgba), [formattedRgba])

  const updateArea = (clientX: number, clientY: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    const saturation = clamp((clientX - bounds.left) / bounds.width, 0, 1)
    const brightness = clamp(1 - (clientY - bounds.top) / bounds.height, 0, 1)
    onChange(colorToCss(hsvToColor(hsv.h, saturation, brightness, channels.a)))
  }
  const commitRgba = (next: string) => {
    const parsed = parseRgbaText(next)
    if (!parsed) return false
    onChange(colorToCss(parsed))
    return true
  }
  return (
    <div className="image-editor-color-panel">
      {showSectionLabels && <span className="image-editor-property-section-label">预设颜色</span>}
      <div className="image-editor-color-swatches" aria-label={`${label}预设`}>
        {swatches.map((swatch) => (
          <button
            type="button"
            key={swatch}
            className={colorToHex(value) === swatch ? 'active' : ''}
            aria-label={`${label} ${swatch}`}
            style={{ background: swatch }}
            onClick={() => onChange(colorToCss({ ...parseColor(swatch), a: channels.a }))}
          />
        ))}
      </div>
      {showSectionLabels && <span className="image-editor-property-section-label">自定义颜色</span>}
      <div
        className="image-editor-color-area"
        role="slider"
        tabIndex={0}
        aria-label={`${label} Color`}
        aria-valuetext={`饱和度 ${Math.round(hsv.s * 100)}%，亮度 ${Math.round(hsv.v * 100)}%`}
        style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          updateArea(event.clientX, event.clientY, event.currentTarget)
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          updateArea(event.clientX, event.clientY, event.currentTarget)
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.1 : 0.01
          let saturation = hsv.s
          let brightness = hsv.v
          if (event.key === 'ArrowLeft') saturation -= step
          else if (event.key === 'ArrowRight') saturation += step
          else if (event.key === 'ArrowDown') brightness -= step
          else if (event.key === 'ArrowUp') brightness += step
          else return
          event.preventDefault()
          onChange(colorToCss(hsvToColor(hsv.h, clamp(saturation, 0, 1), clamp(brightness, 0, 1), channels.a)))
        }}
      >
        <i className="image-editor-color-area-cursor" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <input
        className="image-editor-color-slider hue"
        type="range"
        min="0"
        max="360"
        value={Math.round(hsv.h)}
        aria-label={`${label} Hue`}
        onChange={(event) => onChange(colorToCss(hsvToColor(Number(event.target.value), hsv.s, hsv.v, channels.a)))}
      />
      <input
        className="image-editor-color-slider alpha"
        type="range"
        min="0"
        max="100"
        value={Math.round(channels.a * 100)}
        aria-label={`${label} Alpha`}
        style={{ '--image-editor-color-rgb': `${channels.r}, ${channels.g}, ${channels.b}` } as CSSProperties}
        onChange={(event) => onChange(colorToCss({ ...channels, a: Number(event.target.value) / 100 }))}
      />
      <input
        className="image-editor-rgba-value"
        value={rgbaValue}
        aria-label={`${label} RGBA`}
        onChange={(event) => {
          setRgbaValue(event.target.value)
          commitRgba(event.target.value)
        }}
        onBlur={() => {
          if (!commitRgba(rgbaValue)) setRgbaValue(formattedRgba)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          if (!commitRgba(rgbaValue)) setRgbaValue(formattedRgba)
        }}
      />
    </div>
  )
}

function RangePanelContent({ label, min, max, step = 1, value, unit = '', onChange }: {
  label: string
  min: number
  max: number
  step?: number
  value: number
  unit?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="image-editor-range-panel">
      <span>{label}</span>
      <strong>{Number(value.toFixed(step < 1 ? 2 : 0))}{unit}</strong>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function LayerThumbnail({ layer }: { layer: LayerDescriptor }) {
  if (layer.imageSrc) return <img src={layer.imageSrc} alt="" />
  if (layer.kind === 'text') return <span>{layer.label.slice(0, 2) || 'T'}</span>
  if (layer.kind === 'arrow') return <ArrowUpRight className="image-editor-layer-symbol" size={20} strokeWidth={1.4} />
  if (layer.kind === 'brush' || layer.kind === 'pen') return <Pencil className="image-editor-layer-symbol" size={19} strokeWidth={1.25} />
  if (layer.kind === 'pose') return <UserRound className="image-editor-layer-symbol" size={20} strokeWidth={1.4} />
  return <i className="image-editor-shape-graphic rectangle" style={{ background: layer.fill || '#f0453d33', borderColor: layer.fill || '#f0453d' }} />
}

export function ImageEditorWorkspace({
  source,
  assets,
  historyAssets = [],
  initialComposition,
  onClose,
  onSave,
  onGenerate,
}: ImageEditorWorkspaceProps) {
  const initialSize = useMemo(() => initialDimensions(source, initialComposition), [initialComposition, source])
  const rootRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  )
  const workspaceRef = useRef<HTMLElement>(null)
  const canvasElementRef = useRef<HTMLCanvasElement>(null)
  const canvasRef = useRef<Canvas | null>(null)
  const artboardRef = useRef<HTMLDivElement>(null)
  const artboardWrapRef = useRef<HTMLDivElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const ratioMenuRef = useRef<HTMLDivElement>(null)
  const layerListRef = useRef<HTMLDivElement>(null)
  const closeDialogRef = useRef<HTMLDivElement>(null)
  const poseDialogRef = useRef<HTMLDivElement>(null)
  const initialPropsRef = useRef({ source, initialComposition })
  const widthRef = useRef(initialSize.width)
  const heightRef = useRef(initialSize.height)
  const aspectRatioRef = useRef<ImageEditorAspectRatio>(initialComposition?.aspectRatio || 'custom')
  const backgroundRef = useRef(initialComposition?.backgroundColor || DEFAULT_BACKGROUND)
  const promptRef = useRef(initialComposition?.prompt || '')
  const toolRef = useRef<EditorTool>('select')
  const colorRef = useRef(DEFAULT_COLOR)
  const brushWidthRef = useRef(4)
  const historyRef = useRef<EditorSnapshot[]>([])
  const historyIndexRef = useRef(-1)
  const initialSignatureRef = useRef('')
  const historySuspendedRef = useRef(true)
  const historyTimerRef = useRef<number | null>(null)
  const historyQueueRef = useRef<Promise<void>>(Promise.resolve())
  const historyBusyRef = useRef(false)
  const eraserQueueRef = useRef<Promise<void>>(Promise.resolve())
  const saveCompositionRef = useRef<(closeAfterSave?: boolean, closeBeforeSave?: boolean) => Promise<ImageEditorCommitResult | null>>(async () => null)
  const savingRef = useRef(false)
  const generatingRef = useRef(false)
  const exportingRef = useRef(false)
  const cutoutObjectIdRef = useRef<string | null>(null)
  const cutoutOperationRef = useRef<Promise<void>>(Promise.resolve())
  const drawStateRef = useRef<DrawState | null>(null)
  const guideObjectsRef = useRef<Line[]>([])
  const penAnchorsRef = useRef<PenAnchor[]>([])
  const penPreviewRef = useRef<Path | null>(null)
  const penHelpersRef = useRef<FabricObject[]>([])
  const penClosedRef = useRef(false)
  const penDragRef = useRef<PenDragState | null>(null)
  const penEditingObjectRef = useRef<EditorObject | null>(null)
  const canvasResizeRef = useRef<CanvasResizeState | null>(null)
  const draggedLayerIdRef = useRef<string | null>(null)
  const layerPointerDragRef = useRef<LayerPointerDragState | null>(null)
  const layerDragTimerRef = useRef<number | null>(null)
  const keyboardLayerOrderRef = useRef<EditorObject[] | null>(null)
  const layerScrollFrameRef = useRef<number | null>(null)
  const clipboardObjectsRef = useRef<Record<string, unknown>[]>([])
  const zoomRef = useRef(1)
  const spacePressedRef = useRef(false)
  const workspacePanRef = useRef<WorkspacePanState | null>(null)
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null)
  const cropStateRef = useRef<CropImageState | null>(null)
  const cancelCropRef = useRef<() => void>(() => undefined)
  const finishCropRef = useRef<() => void>(() => undefined)
  const initialFitDoneRef = useRef(false)
  const lineageRef = useRef(new Set<string>([
    ...(initialComposition?.sourceNodeIds || []),
    ...(source?.sourceNodeId ? [source.sourceNodeId] : []),
  ]))

  const [width, setWidth] = useState(initialSize.width)
  const [height, setHeight] = useState(initialSize.height)
  const [aspectRatio, setAspectRatioState] = useState<ImageEditorAspectRatio>(initialComposition?.aspectRatio || 'custom')
  const [ratioMenuOpen, setRatioMenuOpen] = useState(false)
  const [backgroundColor, setBackgroundColorState] = useState(initialComposition?.backgroundColor || DEFAULT_BACKGROUND)
  const [prompt, setPromptState] = useState(initialComposition?.prompt || '')
  const [tool, setToolState] = useState<EditorTool>('select')
  const [color, setColorState] = useState(DEFAULT_COLOR)
  const [brushWidth, setBrushWidth] = useState(4)
  const [zoom, setZoom] = useState(1)
  const [panning, setPanning] = useState(false)
  const [railMode, setRailMode] = useState<RailMode>(null)
  const [assetLibraryTab, setAssetLibraryTab] = useState<AssetLibraryTab>('all')
  const [layers, setLayers] = useState<LayerDescriptor[]>([])
  const [selectionRevision, setSelectionRevision] = useState(0)
  const [historyCursor, setHistoryCursor] = useState({ index: -1, length: 0 })
  const [historyBusy, setHistoryBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [saveDialogPurpose, setSaveDialogPurpose] = useState<'close' | 'save'>('close')
  const [poseGeneratorOpen, setPoseGeneratorOpen] = useState(false)
  const [posePoints, setPosePoints] = useState<PosePoint[]>(() => structuredClone(initialPosePoints))
  const [poseColor, setPoseColor] = useState('#f13b2f')
  const [selectedPosePointIds, setSelectedPosePointIds] = useState<string[]>([])
  const [draggedPosePoint, setDraggedPosePoint] = useState<string | null>(null)
  const poseStageRef = useRef<HTMLDivElement>(null)
  const poseDragRef = useRef<{ ids: string[]; points: PosePoint[]; start: { x: number; y: number } } | null>(null)
  const poseSelectionDragRef = useRef<PoseSelectionDragState | null>(null)
  const [poseSelectionRect, setPoseSelectionRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [generationMode, setGenerationMode] = useState<'image' | 'video'>('image')
  const [imageCount, setImageCount] = useState<1 | 2 | 4>(4)
  const [videoCount, setVideoCount] = useState<1 | 2>(1)
  const [videoDuration, setVideoDuration] = useState(5)
  const [videoResolution, setVideoResolution] = useState<VideoResolution>('720p')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exportScale, setExportScale] = useState(2)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null)
  const [cropMode, setCropMode] = useState(false)
  const [cutoutObjectId, setCutoutObjectId] = useState<string | null>(null)
  const [historyAssetLimit, setHistoryAssetLimit] = useState(20)
  const [canScrollLayers, setCanScrollLayers] = useState({ up: false, down: false })
  const [layerContextMenu, setLayerContextMenu] = useState<LayerContextMenuState | null>(null)
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null)
  const [keyboardGrabbedLayerId, setKeyboardGrabbedLayerId] = useState<string | null>(null)
  const [propertyPanel, setPropertyPanel] = useState<PropertyPanel>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const imageAssets = useMemo(() => {
    const deduped = new Map<string, ImageEditorAsset>()
    ;[...(source ? [source] : []), ...assets].forEach((asset) => deduped.set(asset.id, asset))
    return [...deduped.values()]
  }, [assets, source])
  const categorizedHistoryAssets = useMemo(() => {
    const deduped = new Map<string, ImageEditorAsset>()
    historyAssets.forEach((asset) => deduped.set(asset.id, asset))
    return [...deduped.values()]
  }, [historyAssets])
  const filteredHistoryAssets = assetLibraryTab === 'all'
    ? categorizedHistoryAssets
    : categorizedHistoryAssets.filter((asset) => asset.libraryCategory === assetLibraryTab)
  const visibleHistoryAssets = filteredHistoryAssets.slice(0, historyAssetLimit)

  const restoreEntryFocus = useCallback(() => {
    const target = returnFocusRef.current
    if (!target?.isConnected) return
    window.requestAnimationFrame(() => {
      if (target.isConnected) target.focus({ preventScroll: true })
    })
  }, [])

  const closeWorkspace = useCallback(() => {
    onClose()
    restoreEntryFocus()
  }, [onClose, restoreEntryFocus])

  useEffect(() => () => restoreEntryFocus(), [restoreEntryFocus])

  const captureSnapshot = useCallback((): EditorSnapshot | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return {
      width: widthRef.current,
      height: heightRef.current,
      aspectRatio: aspectRatioRef.current,
      backgroundColor: backgroundRef.current,
      fabricJson: serializeCanvas(canvas),
    }
  }, [])

  const refreshLayers = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setLayers(canvas.getObjects().filter((candidate) => {
      const object = candidate as EditorObject
      return !object.excludeFromExport && object.objectKind !== 'eraser'
    }).map((candidate) => {
      const object = candidate as EditorObject
      return {
        id: object.id || configureObject(object).id!,
        kind: object.objectKind || 'shape',
        label: objectLabel(object),
        imageSrc: object.assetSrc,
        fill: typeof object.fill === 'string' ? object.fill : undefined,
      }
    }))
    setSelectionRevision((current) => current + 1)
  }, [])

  const updateHistoryCursor = useCallback(() => {
    setHistoryCursor({ index: historyIndexRef.current, length: historyRef.current.length })
  }, [])

  const recordHistory = useCallback(() => {
    if (historySuspendedRef.current) return
    if (historyTimerRef.current !== null) {
      window.clearTimeout(historyTimerRef.current)
      historyTimerRef.current = null
    }
    const snapshot = captureSnapshot()
    if (!snapshot) return
    const signature = snapshotSignature(snapshot)
    const current = historyRef.current[historyIndexRef.current]
    if (current && snapshotSignature(current) === signature) {
      refreshLayers()
      return
    }
    const next = historyRef.current.slice(0, historyIndexRef.current + 1)
    next.push(snapshot)
    historyRef.current = next.slice(-MAX_HISTORY)
    historyIndexRef.current = historyRef.current.length - 1
    setDirty(signature !== initialSignatureRef.current)
    updateHistoryCursor()
    refreshLayers()
  }, [captureSnapshot, refreshLayers, updateHistoryCursor])

  const scheduleHistory = useCallback((delay = 180) => {
    if (historySuspendedRef.current) return
    const snapshot = captureSnapshot()
    setDirty(Boolean(snapshot && snapshotSignature(snapshot) !== initialSignatureRef.current))
    if (historyTimerRef.current !== null) window.clearTimeout(historyTimerRef.current)
    historyTimerRef.current = window.setTimeout(recordHistory, delay)
  }, [captureSnapshot, recordHistory])

  const flushHistory = useCallback(() => {
    if (historyTimerRef.current === null) return
    window.clearTimeout(historyTimerRef.current)
    historyTimerRef.current = null
    recordHistory()
  }, [recordHistory])

  const enqueueHistoryOperation = useCallback((operation: () => Promise<void>) => {
    const queued = historyQueueRef.current.then(operation, operation)
    historyQueueRef.current = queued.catch(() => undefined)
    return queued
  }, [])

  const enqueueEraserOperation = useCallback((operation: () => Promise<void>) => {
    const queued = eraserQueueRef.current.then(operation, operation)
    eraserQueueRef.current = queued.catch(() => undefined)
    return queued
  }, [])

  const syncCanvasInteractionState = useCallback((canvas: Canvas) => {
    const locked = historyBusyRef.current || Boolean(cutoutObjectIdRef.current)
    const isSelect = toolRef.current === 'select'
    const isFreeDrawing = toolRef.current === 'brush' || toolRef.current === 'eraser'
    canvas.selection = !locked && isSelect
    canvas.isDrawingMode = !locked && isFreeDrawing
    canvas.getObjects().forEach((object) => {
      const editorObject = configureObject(object as EditorObject)
      const selectable = !locked && isSelect && editorObject.objectKind !== 'eraser'
      object.selectable = selectable
      object.evented = selectable
    })
    if (canvas.isDrawingMode) {
      const brush = new PencilBrush(canvas)
      brush.color = toolRef.current === 'eraser' ? '#000000' : colorRef.current
      brush.width = brushWidthRef.current
      canvas.freeDrawingBrush = brush
    }
    if (locked) canvas.discardActiveObject()
    canvas.requestRenderAll()
  }, [])

  const applySnapshot = useCallback(async (snapshot: EditorSnapshot) => {
    const canvas = canvasRef.current
    if (!canvas) return false
    cancelCropRef.current()
    const historyWasSuspended = historySuspendedRef.current
    historySuspendedRef.current = true
    try {
      await canvas.loadFromJSON(snapshot.fabricJson)
      if (canvasRef.current !== canvas) return false
      widthRef.current = snapshot.width
      heightRef.current = snapshot.height
      aspectRatioRef.current = snapshot.aspectRatio
      backgroundRef.current = snapshot.backgroundColor
      setWidth(snapshot.width)
      setHeight(snapshot.height)
      setAspectRatioState(snapshot.aspectRatio)
      setBackgroundColorState(snapshot.backgroundColor)
      setCanvasDimensions(canvas, snapshot.width, snapshot.height)
      canvas.backgroundColor = snapshot.backgroundColor
      syncCanvasInteractionState(canvas)
      refreshLayers()
      return true
    } finally {
      if (canvasRef.current === canvas) historySuspendedRef.current = historyWasSuspended
    }
  }, [refreshLayers, syncCanvasInteractionState])

  const undo = useCallback(async () => {
    if (historyBusyRef.current || cutoutObjectIdRef.current || savingRef.current || generatingRef.current || exportingRef.current) return
    historyBusyRef.current = true
    if (canvasRef.current) syncCanvasInteractionState(canvasRef.current)
    setHistoryBusy(true)
    try {
      await eraserQueueRef.current
      flushHistory()
      await enqueueHistoryOperation(async () => {
        const nextIndex = historyIndexRef.current - 1
        if (nextIndex < 0) return
        const snapshot = historyRef.current[nextIndex]
        if (!await applySnapshot(snapshot)) return
        historyIndexRef.current = nextIndex
        setDirty(snapshotSignature(snapshot) !== initialSignatureRef.current)
        updateHistoryCursor()
      })
    } catch {
      setFeedback('撤销失败，请重试')
    } finally {
      historyBusyRef.current = false
      if (canvasRef.current) syncCanvasInteractionState(canvasRef.current)
      setHistoryBusy(false)
    }
  }, [applySnapshot, enqueueHistoryOperation, flushHistory, syncCanvasInteractionState, updateHistoryCursor])

  const redo = useCallback(async () => {
    if (historyBusyRef.current || cutoutObjectIdRef.current || savingRef.current || generatingRef.current || exportingRef.current) return
    historyBusyRef.current = true
    if (canvasRef.current) syncCanvasInteractionState(canvasRef.current)
    setHistoryBusy(true)
    try {
      await eraserQueueRef.current
      flushHistory()
      await enqueueHistoryOperation(async () => {
        const nextIndex = historyIndexRef.current + 1
        if (nextIndex >= historyRef.current.length) return
        const snapshot = historyRef.current[nextIndex]
        if (!await applySnapshot(snapshot)) return
        historyIndexRef.current = nextIndex
        setDirty(snapshotSignature(snapshot) !== initialSignatureRef.current)
        updateHistoryCursor()
      })
    } catch {
      setFeedback('恢复失败，请重试')
    } finally {
      historyBusyRef.current = false
      if (canvasRef.current) syncCanvasInteractionState(canvasRef.current)
      setHistoryBusy(false)
    }
  }, [applySnapshot, enqueueHistoryOperation, flushHistory, syncCanvasInteractionState, updateHistoryCursor])

  const setEditorTool = useCallback((nextTool: EditorTool) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return
    toolRef.current = nextTool
    setToolState(nextTool)
    const canvas = canvasRef.current
    if (!canvas) return
    const isSelect = nextTool === 'select'
    const isFreeDrawing = nextTool === 'brush' || nextTool === 'eraser'
    canvas.isDrawingMode = isFreeDrawing
    canvas.selection = isSelect
    canvas.getObjects().forEach((object) => {
      const selectable = isSelect && (object as EditorObject).objectKind !== 'eraser'
      object.selectable = selectable
      object.evented = selectable
    })
    if (!isSelect) canvas.discardActiveObject()
    if (isFreeDrawing) {
      const brush = new PencilBrush(canvas)
      brush.color = nextTool === 'eraser' ? '#000000' : colorRef.current
      brush.width = brushWidthRef.current
      canvas.freeDrawingBrush = brush
    }
    canvas.defaultCursor = isSelect ? 'default' : nextTool === 'text' ? 'text' : 'crosshair'
    canvas.requestRenderAll()
    refreshLayers()
  }, [refreshLayers])

  const applyZoom = useCallback((nextZoom: number, anchor?: { clientX: number; clientY: number }) => {
    const workspace = workspaceRef.current
    const wrap = artboardWrapRef.current
    const previousZoom = zoomRef.current
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
    if (Math.abs(clampedZoom - previousZoom) < 0.001) return
    const previousBounds = anchor && wrap ? wrap.getBoundingClientRect() : null
    const contentPoint = anchor && previousBounds
      ? {
          x: (anchor.clientX - previousBounds.left) / previousZoom,
          y: (anchor.clientY - previousBounds.top) / previousZoom,
        }
      : null
    zoomRef.current = clampedZoom
    setZoom(clampedZoom)
    window.requestAnimationFrame(() => {
      canvasRef.current?.calcOffset()
      if (!workspace || !wrap || !anchor || !contentPoint) return
      const nextBounds = wrap.getBoundingClientRect()
      workspace.scrollLeft += nextBounds.left + contentPoint.x * clampedZoom - anchor.clientX
      workspace.scrollTop += nextBounds.top + contentPoint.y * clampedZoom - anchor.clientY
    })
  }, [])

  const fitCanvas = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const workspace = workspaceRef.current
    const nextZoom = fitZoom(
      widthRef.current,
      heightRef.current,
      window.innerWidth,
      window.innerHeight,
      FIT_VIEWPORT_RATIO,
      MIN_ZOOM,
      MAX_ZOOM,
    )
    zoomRef.current = nextZoom
    setZoom(nextZoom)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const currentWorkspace = workspaceRef.current
      if (!currentWorkspace) return
      canvasRef.current?.calcOffset()
      currentWorkspace.scrollTo({
        left: Math.max(0, (currentWorkspace.scrollWidth - currentWorkspace.clientWidth) / 2),
        top: Math.max(0, (currentWorkspace.scrollHeight - currentWorkspace.clientHeight) / 2),
        behavior,
      })
    }))
  }, [])

  const handleWorkspaceWheel = useCallback((event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    if (!event.deltaY) return
    const direction = event.deltaY > 0 ? -0.1 : 0.1
    const nextZoom = Math.round((zoomRef.current + direction) * 10) / 10
    applyZoom(nextZoom, { clientX: event.clientX, clientY: event.clientY })
  }, [applyZoom])

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return
    workspace.addEventListener('wheel', handleWorkspaceWheel, { passive: false })
    return () => workspace.removeEventListener('wheel', handleWorkspaceWheel)
  }, [handleWorkspaceWheel])

  const beginWorkspacePan = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const workspace = workspaceRef.current
    if (event.pointerType === 'touch' && workspace) {
      touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      workspace.setPointerCapture(event.pointerId)
      if (touchPointsRef.current.size === 2) {
        const [first, second] = [...touchPointsRef.current.values()]
        pinchRef.current = { distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)), zoom: zoomRef.current }
        event.preventDefault()
      }
      return
    }
    const canPan = event.button === 1 || (event.button === 0 && spacePressedRef.current)
    if (!workspace || !canPan) return
    event.preventDefault()
    event.stopPropagation()
    workspacePanRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: workspace.scrollLeft,
      startScrollTop: workspace.scrollTop,
    }
    workspace.setPointerCapture(event.pointerId)
    setPanning(true)
  }, [])

  const moveWorkspacePan = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const workspace = workspaceRef.current
    if (event.pointerType === 'touch' && touchPointsRef.current.has(event.pointerId)) {
      touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const pinch = pinchRef.current
      if (pinch && touchPointsRef.current.size >= 2) {
        const [first, second] = [...touchPointsRef.current.values()]
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
        applyZoom(pinch.zoom * distance / pinch.distance, {
          clientX: (first.x + second.x) / 2,
          clientY: (first.y + second.y) / 2,
        })
        event.preventDefault()
      }
      return
    }
    const pan = workspacePanRef.current
    if (!workspace || !pan || pan.pointerId !== event.pointerId) return
    event.preventDefault()
    workspace.scrollLeft = pan.startScrollLeft - (event.clientX - pan.startClientX)
    workspace.scrollTop = pan.startScrollTop - (event.clientY - pan.startClientY)
  }, [applyZoom])

  const endWorkspacePan = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') {
      touchPointsRef.current.delete(event.pointerId)
      if (touchPointsRef.current.size < 2) pinchRef.current = null
      if (workspaceRef.current?.hasPointerCapture(event.pointerId)) workspaceRef.current.releasePointerCapture(event.pointerId)
      return
    }
    const pan = workspacePanRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    workspacePanRef.current = null
    setPanning(false)
    if (workspaceRef.current?.hasPointerCapture(event.pointerId)) workspaceRef.current.releasePointerCapture(event.pointerId)
  }, [])

  const addImage = useCallback(async (asset: Pick<ImageEditorAsset, 'src' | 'title' | 'sourceNodeId'>, options: {
    kind?: ObjectKind
    record?: boolean
    widthFraction?: number
    left?: number
    top?: number
  } = {}) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return null
    const canvas = canvasRef.current
    if (!canvas) return null
    try {
      const image = await FabricImage.fromURL(asset.src, { crossOrigin: 'anonymous' })
      if (canvasRef.current !== canvas || historyBusyRef.current || cutoutObjectIdRef.current) return null
      const scale = containScale(
        image.width,
        image.height,
        widthRef.current,
        heightRef.current,
        options.widthFraction ?? 1,
      )
      image.set({
        left: options.left ?? widthRef.current / 2,
        top: options.top ?? heightRef.current / 2,
        originX: 'center',
        originY: 'center',
        scaleX: scale,
        scaleY: scale,
      })
      configureObject(image as EditorObject, {
        id: createId('editor-image'),
        objectKind: options.kind || 'image',
        label: asset.title,
        sourceNodeId: asset.sourceNodeId,
        assetSrc: asset.src,
        originalLeft: image.left,
        originalTop: image.top,
      })
      if (asset.sourceNodeId) lineageRef.current.add(asset.sourceNodeId)
      canvas.add(image)
      canvas.setActiveObject(image)
      canvas.requestRenderAll()
      setEditorTool('select')
      if (options.record !== false) recordHistory()
      else refreshLayers()
      return image
    } catch {
      setFeedback('图片加载失败，请检查素材是否仍可访问')
      return null
    }
  }, [recordHistory, refreshLayers, setEditorTool])

  const createShape = useCallback((kind: 'rectangle' | 'circle' | 'line' | 'star' | 'triangle') => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const center = { x: widthRef.current / 2, y: heightRef.current / 2 }
    let object: EditorObject
    if (kind === 'rectangle') {
      object = new Rect({ left: center.x, top: center.y, width: widthRef.current * 0.28, height: heightRef.current * 0.22, originX: 'center', originY: 'center', fill: `${colorRef.current}33`, stroke: colorRef.current, strokeWidth: 4 }) as EditorObject
    } else if (kind === 'circle') {
      object = new FabricCircle({ left: center.x, top: center.y, radius: Math.min(widthRef.current, heightRef.current) * 0.14, originX: 'center', originY: 'center', fill: `${colorRef.current}33`, stroke: colorRef.current, strokeWidth: 4 }) as EditorObject
    } else if (kind === 'line') {
      object = new Line([-150, 0, 150, 0], { left: center.x, top: center.y, originX: 'center', originY: 'center', stroke: colorRef.current, strokeWidth: 7, strokeLineCap: 'round' }) as EditorObject
    } else if (kind === 'star') {
      object = new Polygon(starPoints(145, 65), { left: center.x, top: center.y, originX: 'center', originY: 'center', fill: `${colorRef.current}33`, stroke: colorRef.current, strokeWidth: 4 }) as EditorObject
    } else {
      object = new Polygon([{ x: 0, y: -145 }, { x: 145, y: 120 }, { x: -145, y: 120 }], { left: center.x, top: center.y, originX: 'center', originY: 'center', fill: `${colorRef.current}33`, stroke: colorRef.current, strokeWidth: 4 }) as EditorObject
    }
    configureObject(object, {
      id: createId(`editor-${kind}`),
      objectKind: kind === 'rectangle' ? 'rectangle' : 'shape',
      label: ({ rectangle: '矩形', circle: '圆形', line: '直线', star: '星形', triangle: '三角形' })[kind],
      originalLeft: object.left,
      originalTop: object.top,
      strokeStyle: 'solid',
    })
    canvas.add(object)
    canvas.setActiveObject(object)
    canvas.requestRenderAll()
    setEditorTool('select')
    setRailMode(null)
    recordHistory()
  }, [recordHistory, setEditorTool])

  const insertText = useCallback((value: string, options: { edit?: boolean; fontSize?: number; fill?: string } = {}) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return null
    const canvas = canvasRef.current
    const content = value.trim()
    if (!canvas || !content) return null
    const text = new IText(content, {
      left: widthRef.current / 2,
      top: heightRef.current / 2,
      originX: 'center',
      originY: 'center',
      fill: options.fill ?? colorRef.current,
      fontFamily: 'Open Sans, PingFang SC, system-ui, sans-serif',
      fontSize: options.fontSize ?? 24,
      fontWeight: 500,
      textAlign: 'center',
    }) as EditorObject
    configureObject(text, { id: createId('editor-text'), objectKind: 'text', label: content, originalLeft: text.left, originalTop: text.top })
    canvas.add(text)
    canvas.setActiveObject(text)
    canvas.requestRenderAll()
    setEditorTool('select')
    recordHistory()
    if (options.edit) window.setTimeout(() => {
      const editable = text as IText
      editable.enterEditing()
      editable.selectAll()
      canvas.requestRenderAll()
    }, 0)
    return text
  }, [recordHistory, setEditorTool])

  const addText = useCallback(() => {
    insertText('我的文本', { fontSize: 40, fill: DEFAULT_COLOR })
  }, [insertText])

  const clearPenHelpers = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (penPreviewRef.current) canvas.remove(penPreviewRef.current)
    penHelpersRef.current.forEach((helper) => canvas.remove(helper))
    penPreviewRef.current = null
    penHelpersRef.current = []
  }, [])

  const renderPenDraft = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    clearPenHelpers()
    const anchors = penAnchorsRef.current
    if (!anchors.length) {
      canvas.requestRenderAll()
      return
    }
    const preview = new Path(penPathData(anchors, penClosedRef.current), {
      fill: 'transparent',
      stroke: colorRef.current,
      strokeWidth: brushWidthRef.current,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      selectable: false,
      evented: false,
      objectCaching: false,
      excludeFromExport: true,
    })
    ;(preview as EditorObject).id = 'pen-helper-path'
    penPreviewRef.current = preview
    canvas.add(preview)
    const helpers: FabricObject[] = []
    anchors.forEach((anchor) => {
      const anchorHandle = new FabricCircle({
        left: anchor.current.x,
        top: anchor.current.y,
        radius: PEN_ANCHOR_RADIUS,
        originX: 'center',
        originY: 'center',
        fill: '#1e90ff',
        stroke: '#ffffff',
        strokeWidth: 2,
        selectable: false,
        evented: false,
        excludeFromExport: true,
      })
      helpers.push(anchorHandle)
      if (anchor.previousControl) {
        helpers.push(
          new Line([anchor.previousControl.x, anchor.previousControl.y, anchor.current.x, anchor.current.y], { stroke: '#666666', strokeWidth: 1, selectable: false, evented: false, excludeFromExport: true }),
          new FabricCircle({ left: anchor.previousControl.x, top: anchor.previousControl.y, radius: PEN_CONTROL_RADIUS, originX: 'center', originY: 'center', fill: '#ff6b6b', stroke: '#ffffff', strokeWidth: 2, selectable: false, evented: false, excludeFromExport: true }),
        )
      }
      if (anchor.nextControl) {
        helpers.push(
          new Line([anchor.current.x, anchor.current.y, anchor.nextControl.x, anchor.nextControl.y], { stroke: '#666666', strokeWidth: 1, selectable: false, evented: false, excludeFromExport: true }),
          new FabricCircle({ left: anchor.nextControl.x, top: anchor.nextControl.y, radius: PEN_CONTROL_RADIUS, originX: 'center', originY: 'center', fill: '#ff6b6b', stroke: '#ffffff', strokeWidth: 2, selectable: false, evented: false, excludeFromExport: true }),
        )
      }
    })
    penHelpersRef.current = helpers
    helpers.forEach((helper) => canvas.add(helper))
    canvas.requestRenderAll()
  }, [clearPenHelpers])

  const cancelPen = useCallback(() => {
    const editingObject = penEditingObjectRef.current
    clearPenHelpers()
    penAnchorsRef.current = []
    penClosedRef.current = false
    penDragRef.current = null
    penEditingObjectRef.current = null
    if (editingObject) {
      const selectable = toolRef.current === 'select'
      editingObject.set({ visible: true, selectable, evented: selectable })
      editingObject.setCoords()
    }
    canvasRef.current?.requestRenderAll()
    refreshLayers()
  }, [clearPenHelpers, refreshLayers])

  const finishPen = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const anchors = penAnchorsRef.current
    if (anchors.length < 2) {
      cancelPen()
      return
    }
    const closed = penClosedRef.current
    const editingObject = penEditingObjectRef.current
    const editingIndex = editingObject ? canvas.getObjects().indexOf(editingObject) : -1
    const stroke = typeof editingObject?.stroke === 'string' ? editingObject.stroke : colorRef.current
    const strokeWidth = editingObject?.strokeWidth || brushWidthRef.current
    const path = new Path(penPathData(anchors, closed), {
      fill: 'transparent',
      stroke,
      strokeWidth,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      strokeDashArray: editingObject?.strokeDashArray ? [...editingObject.strokeDashArray] : undefined,
      opacity: editingObject?.opacity ?? 1,
      objectCaching: false,
    }) as EditorObject
    clearPenHelpers()
    if (editingObject) canvas.remove(editingObject)
    penAnchorsRef.current = []
    penClosedRef.current = false
    penDragRef.current = null
    penEditingObjectRef.current = null
    configureObject(path, {
      id: editingObject?.id || createId('editor-pen'),
      objectKind: 'pen',
      label: editingObject?.label || 'Pen Tool',
      originalLeft: editingObject?.originalLeft ?? path.left,
      originalTop: editingObject?.originalTop ?? path.top,
      originalScaleX: editingObject?.originalScaleX ?? path.scaleX,
      originalScaleY: editingObject?.originalScaleY ?? path.scaleY,
      strokeStyle: editingObject?.strokeStyle ?? 'solid',
    })
    path.selectable = false
    path.evented = false
    if (editingIndex >= 0) canvas.insertAt(editingIndex, path)
    else canvas.add(path)
    path.penAnchors = serializePenAnchors(anchors, path)
    path.penClosed = closed
    canvas.requestRenderAll()
    recordHistory()
  }, [cancelPen, clearPenHelpers, recordHistory])

  const resolvePenDraft = useCallback(() => {
    if (!penAnchorsRef.current.length && !penEditingObjectRef.current) return
    if (penAnchorsRef.current.length >= 2) finishPen()
    else cancelPen()
  }, [cancelPen, finishPen])

  const activatePenTool = useCallback(() => {
    cancelPen()
    const canvas = canvasRef.current
    const active = canvas?.getActiveObject() as EditorObject | undefined
    setEditorTool('pen')
    if (!canvas || active?.objectKind !== 'pen' || !active.penAnchors?.length) return
    if (typeof active.stroke === 'string') {
      colorRef.current = active.stroke
      setColorState(active.stroke)
    }
    if (active.strokeWidth) {
      brushWidthRef.current = active.strokeWidth
      setBrushWidth(active.strokeWidth)
    }
    penEditingObjectRef.current = active
    penAnchorsRef.current = restorePenAnchors(active.penAnchors, active)
    penClosedRef.current = Boolean(active.penClosed)
    active.set({ visible: false, selectable: false, evented: false })
    canvas.discardActiveObject()
    renderPenDraft()
  }, [cancelPen, renderPenDraft, setEditorTool])

  const cancelCrop = useCallback(() => {
    const state = cropStateRef.current
    const canvas = canvasRef.current
    if (!state || !canvas) return
    cropStateRef.current = null
    state.image.set({
      cropX: state.before.cropX,
      cropY: state.before.cropY,
      width: state.before.width,
      height: state.before.height,
      left: state.before.left,
      top: state.before.top,
      originX: state.before.originX,
      originY: state.before.originY,
      scaleX: state.before.scaleX,
      scaleY: state.before.scaleY,
      selectable: state.before.selectable,
      evented: state.before.evented,
    })
    state.objectInteractions.forEach(({ object, selectable, evented }) => object.set({ selectable, evented }))
    state.image.setCoords()
    canvas.remove(state.cropRect, state.overlayRect)
    canvas.setActiveObject(state.image)
    canvas.requestRenderAll()
    setCropMode(false)
    historySuspendedRef.current = state.historyWasSuspended
    refreshLayers()
  }, [refreshLayers])

  cancelCropRef.current = cancelCrop

  const finishCrop = useCallback(() => {
    const state = cropStateRef.current
    const canvas = canvasRef.current
    if (!state || !canvas) return
    const { image, cropRect, overlayRect } = state
    const element = image.getElement() as HTMLImageElement
    const naturalWidth = element.naturalWidth || element.width || image.width
    const naturalHeight = element.naturalHeight || element.height || image.height
    const inverse = util.invertTransform(image.calcTransformMatrix())
    const sourceCorners = cropRect.getCoords().map((point) => util.transformPoint(point, inverse))
    const minX = Math.min(...sourceCorners.map((point) => point.x)) + naturalWidth / 2
    const maxX = Math.max(...sourceCorners.map((point) => point.x)) + naturalWidth / 2
    const minY = Math.min(...sourceCorners.map((point) => point.y)) + naturalHeight / 2
    const maxY = Math.max(...sourceCorners.map((point) => point.y)) + naturalHeight / 2
    const cropX = clamp(minX, 0, Math.max(0, naturalWidth - 10))
    const cropY = clamp(minY, 0, Math.max(0, naturalHeight - 10))
    const cropWidth = clamp(maxX - minX, 10, naturalWidth - cropX)
    const cropHeight = clamp(maxY - minY, 10, naturalHeight - cropY)
    const cropCenter = cropRect.getCenterPoint()

    cropStateRef.current = null
    canvas.remove(cropRect, overlayRect)
    image.set({
      cropX,
      cropY,
      width: cropWidth,
      height: cropHeight,
      originX: 'center',
      originY: 'center',
      left: cropCenter.x,
      top: cropCenter.y,
      selectable: state.before.selectable,
      evented: state.before.evented,
    })
    state.objectInteractions.forEach(({ object, selectable, evented }) => object.set({ selectable, evented }))
    image.setCoords()
    canvas.setActiveObject(image)
    canvas.requestRenderAll()
    setCropMode(false)
    historySuspendedRef.current = state.historyWasSuspended
    recordHistory()
  }, [recordHistory])

  finishCropRef.current = finishCrop

  const startCrop = useCallback(async (candidate?: FabricObject | null) => {
    if (historyBusyRef.current || savingRef.current || generatingRef.current || exportingRef.current) return
    await historyQueueRef.current
    await cutoutOperationRef.current
    await eraserQueueRef.current
    const canvas = canvasRef.current
    const activeObject = candidate ?? canvas?.getActiveObject()
    if (!canvas || !(activeObject instanceof FabricImage) || cropStateRef.current || !canvas.getObjects().includes(activeObject)) return
    let image = activeObject as FabricImage & EditorObject

    flushHistory()
    setRailMode(null)
    setLayerContextMenu(null)
    setPropertyPanel(null)
    setExportMenuOpen(false)
    const historyWasSuspended = historySuspendedRef.current
    historySuspendedRef.current = true
    try {
      image = await materializeImageEraser(canvas, image)
    } catch {
      historySuspendedRef.current = historyWasSuspended
      setFeedback('擦除结果处理失败，请重试')
      return
    }
    const element = image.getElement() as HTMLImageElement
    const naturalWidth = element.naturalWidth || element.width || image.width
    const naturalHeight = element.naturalHeight || element.height || image.height
    if (!naturalWidth || !naturalHeight) {
      historySuspendedRef.current = historyWasSuspended
      return
    }
    const objectInteractions = canvas.getObjects().map((object) => ({
      object,
      selectable: object.selectable,
      evented: object.evented,
    }))
    objectInteractions.forEach(({ object }) => object.set({ selectable: false, evented: false }))

    const currentCenter = image.getCenterPoint()
    const currentWidth = image.width || naturalWidth
    const currentHeight = image.height || naturalHeight
    const cropX = image.cropX || 0
    const cropY = image.cropY || 0
    const before: CropImageState['before'] = {
      cropX,
      cropY,
      width: currentWidth,
      height: currentHeight,
      left: image.left,
      top: image.top,
      originX: image.originX,
      originY: image.originY,
      scaleX: image.scaleX,
      scaleY: image.scaleY,
      selectable: image.selectable,
      evented: image.evented,
    }

    const localShiftX = (naturalWidth / 2 - (cropX + currentWidth / 2)) * image.scaleX * (image.flipX ? -1 : 1)
    const localShiftY = (naturalHeight / 2 - (cropY + currentHeight / 2)) * image.scaleY * (image.flipY ? -1 : 1)
    const angle = (image.angle || 0) * Math.PI / 180
    const fullCenter = new Point(
      currentCenter.x + localShiftX * Math.cos(angle) - localShiftY * Math.sin(angle),
      currentCenter.y + localShiftX * Math.sin(angle) + localShiftY * Math.cos(angle),
    )
    image.set({
      cropX: 0,
      cropY: 0,
      width: naturalWidth,
      height: naturalHeight,
      originX: 'center',
      originY: 'center',
      left: fullCenter.x,
      top: fullCenter.y,
      selectable: false,
      evented: false,
    })
    image.setCoords()

    const imageBounds = image.getBoundingRect()
    const allowed = {
      left: Math.max(0, imageBounds.left),
      top: Math.max(0, imageBounds.top),
      right: Math.min(widthRef.current, imageBounds.left + imageBounds.width),
      bottom: Math.min(heightRef.current, imageBounds.top + imageBounds.height),
    }
    const allowedWidth = Math.max(10, allowed.right - allowed.left)
    const allowedHeight = Math.max(10, allowed.bottom - allowed.top)
    const initialWidth = Math.max(10, Math.min(Math.abs(currentWidth * image.scaleX), allowedWidth))
    const initialHeight = Math.max(10, Math.min(Math.abs(currentHeight * image.scaleY), allowedHeight))
    const cropRect = new Rect({
      id: 'crop-rect',
      left: clamp(currentCenter.x, allowed.left + initialWidth / 2, allowed.right - initialWidth / 2),
      top: clamp(currentCenter.y, allowed.top + initialHeight / 2, allowed.bottom - initialHeight / 2),
      originX: 'center',
      originY: 'center',
      angle: image.angle,
      width: initialWidth,
      height: initialHeight,
      fill: 'rgba(255, 255, 255, 0.3)',
      globalCompositeOperation: 'overlay',
      lockRotation: true,
      lockScalingFlip: true,
      excludeFromExport: true,
      cornerSize: 44,
      transparentCorners: false,
      borderColor: '#ffffff',
      cornerColor: '#e86b31',
      minScaleLimit: Math.max(10 / initialWidth, 10 / initialHeight),
    })
    cropRect.controls = { br: cropControl() }
    const overlayRect = new Rect({
      id: 'overlay-rect',
      left: fullCenter.x,
      top: fullCenter.y,
      originX: 'center',
      originY: 'center',
      angle: image.angle,
      width: Math.abs(naturalWidth * image.scaleX),
      height: Math.abs(naturalHeight * image.scaleY),
      fill: 'rgba(0, 0, 0, 0.5)',
      selectable: false,
      evented: false,
      excludeFromExport: true,
      lockRotation: true,
    })
    const constrainCrop = () => {
      cropRect.setCoords()
      let bounds = cropRect.getBoundingRect()
      if (bounds.width > allowedWidth || bounds.height > allowedHeight) {
        const factor = Math.min(allowedWidth / bounds.width, allowedHeight / bounds.height)
        cropRect.scaleX *= factor
        cropRect.scaleY *= factor
        cropRect.setCoords()
        bounds = cropRect.getBoundingRect()
      }
      let deltaX = 0
      let deltaY = 0
      if (bounds.left < allowed.left) deltaX = allowed.left - bounds.left
      else if (bounds.left + bounds.width > allowed.right) deltaX = allowed.right - bounds.left - bounds.width
      if (bounds.top < allowed.top) deltaY = allowed.top - bounds.top
      else if (bounds.top + bounds.height > allowed.bottom) deltaY = allowed.bottom - bounds.top - bounds.height
      if (deltaX || deltaY) cropRect.set({ left: cropRect.left + deltaX, top: cropRect.top + deltaY })
      cropRect.setCoords()
    }
    cropRect.on('moving', constrainCrop)
    cropRect.on('scaling', constrainCrop)
    cropStateRef.current = { image, cropRect, overlayRect, objectInteractions, historyWasSuspended, before }
    canvas.add(overlayRect, cropRect)
    canvas.discardActiveObject()
    canvas.setActiveObject(cropRect)
    canvas.requestRenderAll()
    setCropMode(true)
    refreshLayers()
  }, [flushHistory, refreshLayers])

  useEffect(() => {
    if (tool !== 'pen' && (penAnchorsRef.current.length || penEditingObjectRef.current)) cancelPen()
  }, [cancelPen, tool])

  useEffect(() => {
    const canvasElement = canvasElementRef.current
    if (!canvasElement) return
    const initial = initialPropsRef.current
    const initialCompositionValue = initial.initialComposition
    const initialBackground = initialCompositionValue?.backgroundColor || DEFAULT_BACKGROUND
    const canvas = new Canvas(canvasElement, {
      width: widthRef.current,
      height: heightRef.current,
      backgroundColor: initialBackground,
      preserveObjectStacking: true,
      selection: true,
      controlsAboveOverlay: true,
      fireRightClick: false,
    })
    canvasRef.current = canvas
    setCanvasDimensions(canvas, widthRef.current, heightRef.current)

    const syncSelection = () => refreshLayers()
    const clearAlignmentGuides = () => {
      if (!guideObjectsRef.current.length) return
      guideObjectsRef.current.forEach((guide) => canvas.remove(guide))
      guideObjectsRef.current = []
      canvas.requestRenderAll()
    }
    const addAlignmentGuide = (orientation: 'vertical' | 'horizontal', position: number) => {
      const guide = new Line(
        orientation === 'vertical' ? [position, 0, position, heightRef.current] : [0, position, widthRef.current, position],
        {
          stroke: '#4b9fff',
          strokeWidth: 1.5,
          strokeDashArray: [8, 6],
          selectable: false,
          evented: false,
          excludeFromExport: true,
          objectCaching: false,
        },
      )
      guideObjectsRef.current.push(guide)
      canvas.add(guide)
    }
    const handleObjectMoving = ({ target }: { target?: FabricObject }) => {
      if (!target || target.excludeFromExport) return
      clearAlignmentGuides()
      target.setCoords()
      const bounds = target.getBoundingRect()
      const horizontalPoints = [bounds.left, bounds.left + bounds.width / 2, bounds.left + bounds.width]
      const verticalPoints = [bounds.top, bounds.top + bounds.height / 2, bounds.top + bounds.height]
      const horizontalTargets = [0, widthRef.current / 2, widthRef.current]
      const verticalTargets = [0, heightRef.current / 2, heightRef.current]
      const nearestSnap = (points: number[], targets: number[]) => {
        let best: { delta: number; target: number } | null = null
        for (const point of points) {
          for (const snapTarget of targets) {
            const delta = snapTarget - point
            if (Math.abs(delta) <= 10 && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, target: snapTarget }
          }
        }
        return best
      }
      const bestX = nearestSnap(horizontalPoints, horizontalTargets)
      const bestY = nearestSnap(verticalPoints, verticalTargets)
      if (bestX) {
        target.left += bestX.delta
        addAlignmentGuide('vertical', bestX.target)
      }
      if (bestY) {
        target.top += bestY.delta
        addAlignmentGuide('horizontal', bestY.target)
      }
      target.setCoords()
      canvas.requestRenderAll()
    }
    const recordModified = () => {
      if (historyBusyRef.current || cutoutObjectIdRef.current) return
      clearAlignmentGuides()
      recordHistory()
    }
    const recordText = () => {
      if (historyBusyRef.current || cutoutObjectIdRef.current) return
      scheduleHistory(260)
    }
    const handleDoubleClick = ({ target }: { target?: FabricObject }) => {
      if (historyBusyRef.current || cutoutObjectIdRef.current) return
      if (target instanceof FabricImage && !target.clipPath) void startCrop(target)
    }
    const handlePath = ({ path }: { path: FabricObject }) => {
      if (historyBusyRef.current || cutoutObjectIdRef.current || cropStateRef.current) {
        canvas.remove(path)
        canvas.requestRenderAll()
        return
      }
      const erasing = toolRef.current === 'eraser'
      if (erasing) {
        const eraserPath = path as Path
        eraserPath.setCoords()
        const targets = canvas.getObjects().filter((candidate) => {
          if (candidate === path || candidate.excludeFromExport) return false
          return candidate.intersectsWithObject(eraserPath)
            || candidate.isContainedWithinObject(eraserPath)
            || eraserPath.isContainedWithinObject(candidate)
        }) as EditorObject[]
        canvas.remove(path)
        void enqueueEraserOperation(async () => {
          try {
            for (const target of targets) await applyEraserPathToObject(target, eraserPath)
            if (canvasRef.current !== canvas) return
            canvas.requestRenderAll()
            if (targets.length) recordHistory()
          } catch {
            setFeedback('擦除失败，请撤销后重试')
          }
        })
        return
      }
      configureObject(path as EditorObject, {
        id: createId('editor-brush'),
        objectKind: 'brush',
        label: '自由画笔',
        originalLeft: path.left,
        originalTop: path.top,
        strokeStyle: 'solid',
      })
      path.selectable = false
      path.evented = false
      recordHistory()
    }
    canvas.on('selection:created', syncSelection)
    canvas.on('selection:updated', syncSelection)
    canvas.on('selection:cleared', syncSelection)
    canvas.on('object:added', syncSelection)
    canvas.on('object:removed', syncSelection)
    canvas.on('object:modified', recordModified)
    canvas.on('object:moving', handleObjectMoving)
    canvas.on('mouse:up', clearAlignmentGuides)
    canvas.on('text:changed', recordText)
    canvas.on('path:created', handlePath)
    canvas.on('mouse:dblclick', handleDoubleClick)

    let cancelled = false
    const initialize = async () => {
      historySuspendedRef.current = true
      const json = initialCompositionValue?.fabricJson
      const objects = json && Array.isArray((json as { objects?: unknown[] }).objects)
        ? (json as { objects: unknown[] }).objects
        : []
      if (objects.length && json) {
        await canvas.loadFromJSON(json)
        if (cancelled || canvasRef.current !== canvas) return
        canvas.getObjects().forEach((object) => configureObject(object as EditorObject))
      } else if (initialCompositionValue?.layers?.length) {
        const migrated = await migrateLegacyLayers(initialCompositionValue.layers, widthRef.current, heightRef.current)
        if (cancelled || canvasRef.current !== canvas) return
        migrated.forEach((object) => {
          if (object.sourceNodeId) lineageRef.current.add(object.sourceNodeId)
          canvas.add(object)
        })
      } else if (initial.source) {
        await addImage(initial.source, { record: false })
      }
      if (cancelled) return
      canvas.backgroundColor = initialBackground
      canvas.getObjects().forEach((object) => {
        const selectable = (object as EditorObject).objectKind !== 'eraser'
        object.selectable = selectable
        object.evented = selectable
      })
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      historySuspendedRef.current = false
      const first = captureSnapshot()
      if (first) {
        historyRef.current = [first]
        historyIndexRef.current = 0
        initialSignatureRef.current = snapshotSignature(first)
        updateHistoryCursor()
      }
      setDirty(false)
      refreshLayers()
      rootRef.current?.focus({ preventScroll: true })
      if (!initialFitDoneRef.current) {
        initialFitDoneRef.current = true
        window.requestAnimationFrame(() => fitCanvas('auto'))
      }
    }
    void initialize()

    return () => {
      cancelled = true
      if (historyTimerRef.current !== null) window.clearTimeout(historyTimerRef.current)
      clearAlignmentGuides()
      cropStateRef.current = null
      void canvas.dispose()
      canvasRef.current = null
    }
  }, [addImage, captureSnapshot, enqueueEraserOperation, fitCanvas, recordHistory, refreshLayers, scheduleHistory, startCrop, updateHistoryCursor])

  useEffect(() => {
    brushWidthRef.current = brushWidth
    const canvas = canvasRef.current
    if (!canvas || (tool !== 'brush' && tool !== 'eraser')) return
    const brush = new PencilBrush(canvas)
    brush.color = tool === 'eraser' ? '#000000' : color
    brush.width = brushWidth
    canvas.freeDrawingBrush = brush
  }, [backgroundColor, brushWidth, color, tool])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const pointer = (event: TPointerEventInfo) => canvas.getScenePoint(event.e)
    const findPenHandle = (point: Point): Omit<PenDragState, 'offset'> | null => {
      const anchors = penAnchorsRef.current
      for (let index = 0; index < anchors.length; index += 1) {
        const anchor = anchors[index]
        if (anchor.nextControl && pointDistance(point, anchor.nextControl) <= PEN_HIT_RADIUS) return { type: 'nextControl', index }
        if (anchor.previousControl && pointDistance(point, anchor.previousControl) <= PEN_HIT_RADIUS) return { type: 'previousControl', index }
      }
      for (let index = 0; index < anchors.length; index += 1) {
        if (pointDistance(point, anchors[index].current) <= PEN_HIT_RADIUS) return { type: 'anchor', index }
      }
      return null
    }
    const handleDown = (event: TPointerEventInfo) => {
      if (historyBusyRef.current || cutoutObjectIdRef.current) return
      const currentTool = toolRef.current
      const point = pointer(event)
      if (currentTool === 'pen') {
        const hit = findPenHandle(point)
        if (hit?.type === 'anchor' && hit.index === 0 && penAnchorsRef.current.length >= 2 && !penClosedRef.current) {
          penClosedRef.current = true
          calculatePenControls(penAnchorsRef.current, true)
          renderPenDraft()
          setFeedback('路径已闭合，按 Enter 完成')
          return
        }
        if (hit) {
          const anchor = penAnchorsRef.current[hit.index]
          const target = hit.type === 'anchor'
            ? anchor.current
            : hit.type === 'previousControl'
              ? anchor.previousControl
              : anchor.nextControl
          if (target) {
            penDragRef.current = {
              ...hit,
              offset: new Point(point.x - target.x, point.y - target.y),
            }
            canvas.defaultCursor = 'move'
          }
          return
        }
        if (penClosedRef.current) return
        penAnchorsRef.current = [...penAnchorsRef.current, { current: new Point(point.x, point.y) }]
        calculatePenControls(penAnchorsRef.current, false)
        renderPenDraft()
        return
      }
      if (currentTool !== 'rectangle' && currentTool !== 'arrow') return
      canvas.discardActiveObject()
      if (currentTool === 'rectangle') {
        const rectangle = configureObject(new Rect({ left: point.x, top: point.y, width: 1, height: 1, fill: `${colorRef.current}33`, stroke: colorRef.current, strokeWidth: Math.max(2, brushWidth / 2), selectable: false, evented: false }) as EditorObject, {
          id: createId('editor-rectangle'), objectKind: 'rectangle', label: '矩形', originalLeft: point.x, originalTop: point.y, strokeStyle: 'solid',
        })
        canvas.add(rectangle)
        drawStateRef.current = { tool: currentTool, start: point, object: rectangle }
      } else {
        const line = configureObject(new Line([point.x, point.y, point.x, point.y], { stroke: colorRef.current, strokeWidth: brushWidth, strokeLineCap: 'round', selectable: false, evented: false }) as EditorObject, {
          id: createId('editor-arrow-draft'), objectKind: 'arrow', label: '箭头', originalLeft: point.x, originalTop: point.y, strokeStyle: 'solid',
        })
        canvas.add(line)
        drawStateRef.current = { tool: currentTool, start: point, object: line }
      }
      canvas.requestRenderAll()
    }
    const handleMove = (event: TPointerEventInfo) => {
      if (historyBusyRef.current || cutoutObjectIdRef.current) return
      if (toolRef.current === 'pen') {
        const point = pointer(event)
        const drag = penDragRef.current
        if (drag) {
          const anchor = penAnchorsRef.current[drag.index]
          if (!anchor) return
          const next = new Point(point.x - drag.offset.x, point.y - drag.offset.y)
          if (drag.type === 'anchor') {
            const delta = new Point(next.x - anchor.current.x, next.y - anchor.current.y)
            anchor.current = next
            if (anchor.previousControl) anchor.previousControl = new Point(anchor.previousControl.x + delta.x, anchor.previousControl.y + delta.y)
            if (anchor.nextControl) anchor.nextControl = new Point(anchor.nextControl.x + delta.x, anchor.nextControl.y + delta.y)
          } else if (drag.type === 'previousControl') {
            anchor.previousControl = next
            if (anchor.nextControl) anchor.nextControl = mirrorPoint(anchor.current, next)
          } else {
            anchor.nextControl = next
            if (anchor.previousControl) anchor.previousControl = mirrorPoint(anchor.current, next)
          }
          renderPenDraft()
          return
        }
        canvas.defaultCursor = findPenHandle(point) ? 'pointer' : 'crosshair'
        return
      }
      const draw = drawStateRef.current
      if (!draw) return
      const point = pointer(event)
      if (draw.tool === 'rectangle') {
        draw.object.set({
          left: Math.min(draw.start.x, point.x),
          top: Math.min(draw.start.y, point.y),
          width: Math.max(1, Math.abs(point.x - draw.start.x)),
          height: Math.max(1, Math.abs(point.y - draw.start.y)),
        })
      } else {
        ;(draw.object as Line).set({ x2: point.x, y2: point.y })
      }
      draw.object.setCoords()
      canvas.requestRenderAll()
    }
    const handleUp = (event: TPointerEventInfo) => {
      if (historyBusyRef.current || cutoutObjectIdRef.current) return
      if (toolRef.current === 'pen') {
        penDragRef.current = null
        canvas.defaultCursor = 'crosshair'
        return
      }
      const draw = drawStateRef.current
      if (!draw) return
      drawStateRef.current = null
      const point = pointer(event)
      let finalObject: EditorObject | null = draw.object
      if (draw.tool === 'rectangle') {
        const deltaX = Math.abs(point.x - draw.start.x)
        const deltaY = Math.abs(point.y - draw.start.y)
        if (deltaX <= 5 && deltaY <= 5) {
          canvas.remove(draw.object)
          finalObject = null
        }
      } else {
        canvas.remove(draw.object)
        const deltaX = point.x - draw.start.x
        const deltaY = point.y - draw.start.y
        const length = Math.hypot(deltaX, deltaY)
        if (length <= 10) {
          finalObject = null
          canvas.requestRenderAll()
          return
        }
        const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI
        const arrow = new Path('M 0 25 L 100 25 M 73 0 L 100 25 L 73 50', {
          left: draw.start.x,
          top: draw.start.y,
          originX: 'left',
          originY: 'center',
          fill: 'transparent',
          stroke: colorRef.current,
          strokeWidth: brushWidth,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          scaleX: length / 100,
          angle,
        }) as EditorObject
        finalObject = configureObject(arrow, { id: createId('editor-arrow'), objectKind: 'arrow', label: '箭头', originalLeft: arrow.left, originalTop: arrow.top, strokeStyle: 'solid' })
        canvas.add(finalObject)
      }
      if (!finalObject) {
        canvas.requestRenderAll()
        return
      }
      finalObject.selectable = false
      finalObject.evented = false
      finalObject.setCoords()
      canvas.requestRenderAll()
      recordHistory()
    }
    canvas.on('mouse:down', handleDown)
    canvas.on('mouse:move', handleMove)
    canvas.on('mouse:up', handleUp)
    return () => {
      canvas.off('mouse:down', handleDown)
      canvas.off('mouse:move', handleMove)
      canvas.off('mouse:up', handleUp)
    }
  }, [brushWidth, recordHistory, renderPenDraft])

  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(null), 2600)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const activeObject = canvasRef.current?.getActiveObject() as EditorObject | undefined
  void selectionRevision
  const activeObjects = activeObject instanceof ActiveSelection ? activeObject.getObjects() as EditorObject[] : activeObject ? [activeObject] : []
  const singleActiveObject = activeObjects.length === 1 ? activeObjects[0] : undefined
  const isImage = singleActiveObject instanceof FabricImage
  const isText = singleActiveObject instanceof IText || singleActiveObject instanceof Textbox
  const isRectangle = singleActiveObject instanceof Rect && (singleActiveObject as EditorObject).objectKind === 'rectangle'
  const supportsPaint = Boolean(singleActiveObject && !isImage)

  const mutateActive = useCallback((mutation: (object: EditorObject) => void, options: { all?: boolean; debounce?: boolean } = {}) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return
    const canvas = canvasRef.current
    const active = canvas?.getActiveObject() as EditorObject | undefined
    if (!canvas || !active) return
    const objects = options.all && active instanceof ActiveSelection ? active.getObjects() as EditorObject[] : [active]
    objects.forEach((object) => {
      mutation(object)
      object.setCoords()
    })
    canvas.requestRenderAll()
    refreshLayers()
    if (options.debounce) scheduleHistory()
    else recordHistory()
  }, [recordHistory, refreshLayers, scheduleHistory])

  const deleteSelected = useCallback(() => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return
    const canvas = canvasRef.current
    const active = canvas?.getActiveObject()
    if (!canvas || !active) return
    const targets = active instanceof ActiveSelection ? active.getObjects() : [active]
    canvas.discardActiveObject()
    targets.forEach((object) => canvas.remove(object))
    canvas.requestRenderAll()
    recordHistory()
  }, [recordHistory])

  const pasteSerializedObjects = useCallback(async (serialized: Record<string, unknown>[]) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return false
    const canvas = canvasRef.current
    if (!canvas || !serialized.length) return false
    try {
      const pasted = await util.enlivenObjects<EditorObject>(structuredClone(serialized))
      if (canvasRef.current !== canvas || historyBusyRef.current || cutoutObjectIdRef.current || !pasted.length) return false
      pasted.forEach((object) => {
        configureObject(object, {
          id: createId('editor-paste'),
          originalLeft: (object.left || 0) + 10,
          originalTop: (object.top || 0) + 10,
        })
        object.set({
          left: (object.left || 0) + 10,
          top: (object.top || 0) + 10,
          selectable: true,
          evented: true,
        })
        if (object.sourceNodeId) lineageRef.current.add(object.sourceNodeId)
        canvas.add(object)
      })
      setEditorTool('select')
      if (pasted.length === 1) canvas.setActiveObject(pasted[0])
      else canvas.setActiveObject(new ActiveSelection(pasted, { canvas }))
      canvas.requestRenderAll()
      recordHistory()
      setFeedback('对象已粘贴')
      return true
    } catch {
      setFeedback('对象粘贴失败')
      return false
    }
  }, [recordHistory, setEditorTool])

  const copySelection = useCallback(async (layerId?: string) => {
    const canvas = canvasRef.current
    if (!canvas) return false
    const layerObject = layerId
      ? canvas.getObjects().find((object) => (object as EditorObject).id === layerId)
      : undefined
    const active = layerObject ?? canvas.getActiveObject()
    if (!active) return false
    const selected = active instanceof ActiveSelection ? active.getObjects() : [active]
    const serialized = selected
      .filter((object) => (object as EditorObject).objectKind !== 'eraser')
      .map((object) => object.toObject(CUSTOM_PROPERTIES) as Record<string, unknown>)
    if (!serialized.length) return false
    clipboardObjectsRef.current = structuredClone(serialized)
    const text = JSON.stringify({ type: 'fabric-object', data: serialized })
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // The in-memory clipboard keeps copy/paste available when system permission is denied.
    }
    setFeedback('对象已复制')
    return true
  }, [])

  const pasteClipboardText = useCallback(async (text: string) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return false
    const serialized = parseFabricClipboard(text)
    if (serialized?.length) return pasteSerializedObjects(serialized)
    if (!text.trim()) return false
    insertText(text)
    setFeedback('文字已粘贴')
    return true
  }, [insertText, pasteSerializedObjects])

  const pasteFromSystemClipboard = useCallback(async () => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return false
    try {
      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const imageType = item.types.find((type) => type.startsWith('image/'))
          if (imageType) {
            const blob = await item.getType(imageType)
            const src = await blobToDataUrl(blob)
            await addImage({ src, title: '粘贴的图片' }, { record: true })
            setFeedback('图片已粘贴')
            return true
          }
          if (item.types.includes('text/plain')) {
            const text = await (await item.getType('text/plain')).text()
            if (await pasteClipboardText(text)) return true
          }
        }
      } else if (navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText()
        if (await pasteClipboardText(text)) return true
      }
    } catch {
      // Fall through to the last copied Fabric objects.
    }
    if (clipboardObjectsRef.current.length) return pasteSerializedObjects(clipboardObjectsRef.current)
    setFeedback('剪贴板中没有可粘贴的图片、文字或对象')
    return false
  }, [addImage, pasteClipboardText, pasteSerializedObjects])

  const moveSelectionToEdge = useCallback((direction: 'front' | 'back') => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return
    const canvas = canvasRef.current
    const active = canvas?.getActiveObject()
    if (!canvas || !active) return
    const objects = active instanceof ActiveSelection ? active.getObjects() : [active]
    if (direction === 'front') objects.forEach((object) => canvas.bringObjectToFront(object))
    else [...objects].reverse().forEach((object) => canvas.sendObjectToBack(object))
    canvas.requestRenderAll()
    recordHistory()
  }, [recordHistory])

  const selectLayer = useCallback((layerId: string) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return null
    const canvas = canvasRef.current
    const object = canvas?.getObjects().find((candidate) => (candidate as EditorObject).id === layerId)
    if (!canvas || !object) return null
    setEditorTool('select')
    canvas.setActiveObject(object)
    canvas.requestRenderAll()
    refreshLayers()
    return object as EditorObject
  }, [refreshLayers, setEditorTool])

  const duplicateLayer = useCallback(async (layerId: string) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return
    const object = selectLayer(layerId)
    if (!object) return
    const serialized = object.toObject(CUSTOM_PROPERTIES) as Record<string, unknown>
    await pasteSerializedObjects([serialized])
    setLayerContextMenu(null)
  }, [pasteSerializedObjects, selectLayer])

  const moveLayer = useCallback((layerId: string, direction: 'up' | 'down') => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const visibleObjects = canvas.getObjects().filter((candidate) => {
      const object = candidate as EditorObject
      return !object.excludeFromExport && object.objectKind !== 'eraser'
    })
    const index = visibleObjects.findIndex((object) => (object as EditorObject).id === layerId)
    const nextIndex = direction === 'up' ? index + 1 : index - 1
    if (index < 0 || nextIndex < 0 || nextIndex >= visibleObjects.length) return
    const object = visibleObjects[index]
    const target = visibleObjects[nextIndex]
    const targetCanvasIndex = canvas.getObjects().indexOf(target)
    canvas.moveObjectTo(object, targetCanvasIndex)
    canvas.setActiveObject(object)
    canvas.requestRenderAll()
    recordHistory()
    setLayerContextMenu(null)
  }, [recordHistory])

  const deleteLayer = useCallback((layerId: string) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return
    const canvas = canvasRef.current
    const object = canvas?.getObjects().find((candidate) => (candidate as EditorObject).id === layerId)
    if (!canvas || !object) return
    canvas.discardActiveObject()
    canvas.remove(object)
    canvas.requestRenderAll()
    recordHistory()
    setLayerContextMenu(null)
  }, [recordHistory])

  const resetSelectedPosition = useCallback(() => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return
    const canvas = canvasRef.current
    const object = canvas?.getActiveObject() as EditorObject | undefined
    if (!canvas || !object || object instanceof ActiveSelection) return
    object.set({
      left: object.originalLeft ?? object.left,
      top: object.originalTop ?? object.top,
      scaleX: object.originalScaleX ?? object.scaleX,
      scaleY: object.originalScaleY ?? object.scaleY,
    })
    object.setCoords()
    canvas.requestRenderAll()
    recordHistory()
  }, [recordHistory])

  const updateColor = useCallback((next: string) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return
    colorRef.current = next
    setColorState(next)
    if (!canvasRef.current?.getActiveObject()) return
    mutateActive((object) => {
      if (object instanceof IText || object instanceof Textbox) object.set({ fill: next })
      else if (object.objectKind === 'brush' || object.objectKind === 'pen' || object.objectKind === 'arrow') object.set({ stroke: next })
      else object.set({ fill: next })
    }, { debounce: true })
  }, [mutateActive])

  const updateStroke = useCallback((next: string) => {
    mutateActive((object) => object.set({ stroke: next }), { debounce: true })
  }, [mutateActive])

  const updateStrokeStyle = useCallback((style: 'solid' | 'dashed' | 'dotted') => {
    const dash = style === 'dashed' ? [18, 12] : style === 'dotted' ? [3, 10] : null
    mutateActive((object) => {
      object.strokeStyle = style
      object.set({ strokeDashArray: dash, strokeLineCap: style === 'dotted' ? 'round' : 'butt' })
    })
  }, [mutateActive])

  const togglePropertyPanel = useCallback((panel: Exclude<PropertyPanel, null>) => {
    setPropertyPanel((current) => current === panel ? null : panel)
  }, [])

  const cycleTextAlignment = useCallback(() => {
    mutateActive((object) => {
      const text = object as IText
      const next = text.textAlign === 'left' ? 'center' : text.textAlign === 'center' ? 'right' : 'left'
      text.set({ textAlign: next })
    })
  }, [mutateActive])

  const resizeArtboard = useCallback((nextRatio: ImageEditorAspectRatio) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const next = dimensionsForRatio(nextRatio, widthRef.current, heightRef.current)
    widthRef.current = next.width
    heightRef.current = next.height
    aspectRatioRef.current = nextRatio
    setWidth(next.width)
    setHeight(next.height)
    setAspectRatioState(nextRatio)
    setCanvasDimensions(canvas, next.width, next.height)
    canvas.backgroundColor = backgroundRef.current
    canvas.requestRenderAll()
    recordHistory()
    window.requestAnimationFrame(() => fitCanvas())
  }, [fitCanvas, recordHistory])

  const beginCanvasResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>, edge: CanvasResizeState['edge']) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    event.preventDefault()
    event.stopPropagation()
    canvasResizeRef.current = {
      edge,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: widthRef.current,
      startHeight: heightRef.current,
      objectPositions: canvas.getObjects()
        .filter((object) => !object.excludeFromExport)
        .map((object) => ({
          object: object as EditorObject,
          left: object.left,
          top: object.top,
          originalLeft: (object as EditorObject).originalLeft,
          originalTop: (object as EditorObject).originalTop,
        })),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const moveCanvasResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return
    const resize = canvasResizeRef.current
    const canvas = canvasRef.current
    if (!resize || !canvas || resize.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const deltaX = (event.clientX - resize.startClientX) / Math.max(zoomRef.current, MIN_ZOOM)
    const deltaY = (event.clientY - resize.startClientY) / Math.max(zoomRef.current, MIN_ZOOM)
    const nextWidth = Math.round(resize.edge === 'left'
      ? Math.max(100, resize.startWidth - deltaX)
      : resize.edge === 'right'
        ? Math.max(100, resize.startWidth + deltaX)
        : resize.startWidth)
    const nextHeight = Math.round(resize.edge === 'top'
      ? Math.max(100, resize.startHeight - deltaY)
      : resize.edge === 'bottom'
        ? Math.max(100, resize.startHeight + deltaY)
        : resize.startHeight)
    const shiftX = resize.edge === 'left' ? resize.startWidth - nextWidth : 0
    const shiftY = resize.edge === 'top' ? resize.startHeight - nextHeight : 0
    resize.objectPositions.forEach(({ object, left, top, originalLeft, originalTop }) => {
      object.set({ left: left - shiftX, top: top - shiftY })
      if (typeof originalLeft === 'number') object.originalLeft = originalLeft - shiftX
      if (typeof originalTop === 'number') object.originalTop = originalTop - shiftY
      object.setCoords()
    })
    widthRef.current = nextWidth
    heightRef.current = nextHeight
    aspectRatioRef.current = 'custom'
    setWidth(nextWidth)
    setHeight(nextHeight)
    setAspectRatioState('custom')
    setCanvasDimensions(canvas, nextWidth, nextHeight)
    canvas.backgroundColor = backgroundRef.current
    canvas.requestRenderAll()
  }, [])

  const endCanvasResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) {
      canvasResizeRef.current = null
      return
    }
    const resize = canvasResizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    canvasResizeRef.current = null
    recordHistory()
  }, [recordHistory])

  const changeBackground = useCallback((next: string) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    backgroundRef.current = next
    setBackgroundColorState(next)
    canvas.backgroundColor = next
    canvas.requestRenderAll()
    scheduleHistory()
  }, [scheduleHistory])

  const handleUpload = useCallback(async (file?: File, index = 0) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) return false
    if (!file) return false
    if (!file.type.startsWith('image/')) {
      setFeedback('请选择图片文件')
      return false
    }
    try {
      const src = await blobToDataUrl(file)
      await addImage({ src, title: file.name }, {
        record: true,
        left: widthRef.current / 2 + index * 18,
        top: heightRef.current / 2 + index * 18,
      })
      return true
    } catch {
      setFeedback('图片读取失败')
      return false
    }
  }, [addImage])

  const handleWorkspaceDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleWorkspaceDrop = useCallback(async (event: DragEvent<HTMLElement>) => {
    if (historyBusyRef.current || cutoutObjectIdRef.current) {
      event.preventDefault()
      return
    }
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'))
    if (!files.length) return
    event.preventDefault()
    event.stopPropagation()
    let imported = 0
    for (const [index, file] of files.entries()) {
      if (await handleUpload(file, index)) imported += 1
    }
    if (imported > 1) setFeedback(`已导入 ${imported} 张图片`)
  }, [handleUpload])

  const cutoutImage = useCallback(() => {
    const canvas = canvasRef.current
    const activeObject = canvas?.getActiveObject()
    if (!canvas || !(activeObject instanceof FabricImage)) return Promise.resolve()
    let image = activeObject as FabricImage & EditorObject
    if (cutoutObjectIdRef.current) return cutoutOperationRef.current
    if (cropStateRef.current || historyBusyRef.current || savingRef.current || generatingRef.current || exportingRef.current) return Promise.resolve()
    const editorImage = image as EditorObject
    const imageId = editorImage.id || configureObject(editorImage).id!
    let element = image.getElement() as HTMLImageElement
    let sourceWidth = Math.max(1, Math.round(image.width || element.naturalWidth || element.width))
    let sourceHeight = Math.max(1, Math.round(image.height || element.naturalHeight || element.height))
    const bitmap = document.createElement('canvas')
    bitmap.width = sourceWidth
    bitmap.height = sourceHeight
    const context = bitmap.getContext('2d', { willReadFrequently: true })
    if (!context) return Promise.resolve()

    cutoutObjectIdRef.current = imageId
    setCutoutObjectId(imageId)
    syncCanvasInteractionState(canvas)
    flushHistory()
    setRailMode(null)
    setLayerContextMenu(null)
    setPropertyPanel(null)
    setExportMenuOpen(false)
    const historyWasSuspended = historySuspendedRef.current
    historySuspendedRef.current = true
    const previousOpacity = image.opacity ?? 1
    let changed = false
    const operation = (async () => {
      try {
        image = await materializeImageEraser(canvas, image)
        element = image.getElement() as HTMLImageElement
        sourceWidth = Math.max(1, Math.round(image.width || element.naturalWidth || element.width))
        sourceHeight = Math.max(1, Math.round(image.height || element.naturalHeight || element.height))
        bitmap.width = sourceWidth
        bitmap.height = sourceHeight
        context.drawImage(
          element,
          image.cropX || 0,
          image.cropY || 0,
          sourceWidth,
          sourceHeight,
          0,
          0,
          sourceWidth,
          sourceHeight,
        )
        const pixels = context.getImageData(0, 0, sourceWidth, sourceHeight)
        let red = 0
        let green = 0
        let blue = 0
        let samples = 0
        const sample = (x: number, y: number) => {
          const index = (y * sourceWidth + x) * 4
          if (!pixels.data[index + 3]) return
          red += pixels.data[index]
          green += pixels.data[index + 1]
          blue += pixels.data[index + 2]
          samples += 1
        }
        const stride = Math.max(1, Math.floor(Math.min(sourceWidth, sourceHeight) / 160))
        for (let x = 0; x < sourceWidth; x += stride) {
          sample(x, 0)
          sample(x, sourceHeight - 1)
        }
        for (let y = stride; y < sourceHeight - 1; y += stride) {
          sample(0, y)
          sample(sourceWidth - 1, y)
        }
        if (!samples) throw new Error('无法识别背景')
        red /= samples
        green /= samples
        blue /= samples
        for (let index = 0; index < pixels.data.length; index += 4) {
          const distance = Math.hypot(
            pixels.data[index] - red,
            pixels.data[index + 1] - green,
            pixels.data[index + 2] - blue,
          )
          const edgeAlpha = clamp((distance - 28) / 44, 0, 1)
          pixels.data[index + 3] = Math.round(pixels.data[index + 3] * edgeAlpha)
        }
        context.putImageData(pixels, 0, 0)
        await new Promise<void>((resolve) => window.setTimeout(resolve, 450))
        const renderedSrc = bitmap.toDataURL('image/png')
        const replacement = await FabricImage.fromURL(renderedSrc) as EditorObject
        if (canvasRef.current !== canvas) return
        const index = canvas.getObjects().indexOf(image)
        if (index < 0) {
          setFeedback('原图已移除，抠图已取消')
          return
        }
        const center = image.getCenterPoint()
        const visualWidth = image.getScaledWidth()
        const visualHeight = image.getScaledHeight()
        replacement.set({
          left: center.x,
          top: center.y,
          originX: 'center',
          originY: 'center',
          angle: image.angle,
          flipX: image.flipX,
          flipY: image.flipY,
          scaleX: visualWidth / Math.max(1, replacement.width),
          scaleY: visualHeight / Math.max(1, replacement.height),
          opacity: previousOpacity,
        })
        configureObject(replacement, {
          id: imageId,
          objectKind: editorImage.objectKind,
          label: editorImage.label,
          sourceNodeId: editorImage.sourceNodeId,
          assetSrc: renderedSrc,
          originalLeft: editorImage.originalLeft,
          originalTop: editorImage.originalTop,
          originalScaleX: editorImage.originalScaleX,
          originalScaleY: editorImage.originalScaleY,
        })
        canvas.remove(image)
        canvas.insertAt(index, replacement)
        canvas.setActiveObject(replacement)
        canvas.requestRenderAll()
        changed = true
        setFeedback('抠图已完成')
      } catch {
        setFeedback('抠图失败，请更换图片后重试')
      } finally {
        if (canvasRef.current === canvas) {
          historySuspendedRef.current = historyWasSuspended
          if (changed) recordHistory()
        }
        if (cutoutObjectIdRef.current === imageId) {
          cutoutObjectIdRef.current = null
          setCutoutObjectId(null)
        }
        if (canvasRef.current === canvas) {
          if (!changed && canvas.getObjects().includes(image)) canvas.setActiveObject(image)
          syncCanvasInteractionState(canvas)
          refreshLayers()
        }
      }
    })()
    cutoutOperationRef.current = operation.catch(() => undefined)
    return operation
  }, [flushHistory, recordHistory, refreshLayers, syncCanvasInteractionState])

  const switchGenerationMode = useCallback(() => {
    if (generationMode === 'image') {
      setGenerationMode('video')
      if (!VIDEO_ASPECT_RATIO_SET.has(aspectRatioRef.current)) resizeArtboard('16:9')
      return
    }
    setGenerationMode('image')
  }, [generationMode, resizeArtboard])

  const cycleVideoDuration = useCallback(() => {
    setVideoDuration((current) => {
      const index = VIDEO_DURATIONS.indexOf(current)
      return VIDEO_DURATIONS[(index + 1) % VIDEO_DURATIONS.length]
    })
  }, [])

  const cycleVideoResolution = useCallback(() => {
    setVideoResolution((current) => {
      const index = VIDEO_RESOLUTIONS.indexOf(current)
      return VIDEO_RESOLUTIONS[(index + 1) % VIDEO_RESOLUTIONS.length]
    })
  }, [])

  const generateFromPrompt = useCallback(async () => {
    if (generatingRef.current || !promptRef.current.trim()) return
    if (!onGenerate) {
      setFeedback('当前画布未接入图片生成')
      return
    }
    generatingRef.current = true
    setGenerating(true)
    try {
      await historyQueueRef.current
      await cutoutOperationRef.current
      resolvePenDraft()
      if (cropStateRef.current) finishCropRef.current()
      await eraserQueueRef.current
      const canvas = canvasRef.current
      if (!canvas) throw new Error('图片编辑画布不可用')
      let coverDataUrl: string
      try {
        coverDataUrl = renderCanvasWithBackground(canvas, 1, backgroundRef.current).toDataURL('image/png')
      } catch {
        setFeedback('当前素材受跨域限制，无法作为生成参考')
        return
      }
      const commit = await saveCompositionRef.current(false)
      if (!commit) return
      const commonRequest = {
        prompt: promptRef.current.trim(),
        coverDataUrl,
        width: widthRef.current,
        height: heightRef.current,
        aspectRatio: aspectRatioRef.current,
        sourceNodeIds: [commit.outputNodeId],
        outputNodeId: commit.outputNodeId,
      }
      const request: ImageEditorGenerateRequest = generationMode === 'video'
        ? {
            ...commonRequest,
            mediaType: 'video',
            count: videoCount,
            duration: videoDuration,
            resolution: videoResolution,
            modelId: 'seedance-2',
          }
        : {
            ...commonRequest,
            mediaType: 'image',
            count: imageCount,
            modelId: 'gemini-banana-2',
          }
      await onGenerate(request)
      setFeedback(generationMode === 'video' ? '视频生成任务已创建' : '图片生成任务已创建')
    } catch {
      setFeedback('生成任务创建失败，请重试')
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }, [generationMode, imageCount, onGenerate, resolvePenDraft, videoCount, videoDuration, videoResolution])

  const exportCanvas = useCallback(async (format: ExportFormat) => {
    if (exportingRef.current) return
    exportingRef.current = true
    setExportMenuOpen(false)
    setExportingFormat(format)
    try {
      await historyQueueRef.current
      await cutoutOperationRef.current
      resolvePenDraft()
      if (cropStateRef.current) finishCropRef.current()
      await eraserQueueRef.current
      const canvas = canvasRef.current
      if (!canvas) throw new Error('图片编辑画布不可用')
      if (format === 'psd') {
        const { writePsd } = await import('ag-psd')
        const exportWidth = widthRef.current
        const exportHeight = heightRef.current
        const objects = canvas.getObjects().filter((object) => !object.excludeFromExport) as EditorObject[]
        const renderedLayers = await Promise.all(objects.map(async (object): Promise<PsdLayer> => ({
          name: objectLabel(object),
          canvas: await renderObjectLayer(object, widthRef.current, heightRef.current, 1),
          opacity: clamp(object.opacity ?? 1, 0, 1),
          hidden: object.visible === false,
          blendMode: 'normal',
        })))
        const backgroundLayer: PsdLayer = {
          name: 'Background',
          canvas: createSolidCanvas(exportWidth, exportHeight, backgroundRef.current),
          opacity: 1,
          hidden: false,
          blendMode: 'normal',
        }
        const psd: Psd = {
          width: exportWidth,
          height: exportHeight,
          canvas: renderCanvasWithBackground(canvas, 1, backgroundRef.current),
          children: orderPsdLayers(renderedLayers, backgroundLayer),
        }
        const buffer = writePsd(psd, { generateThumbnail: true })
        triggerBlobDownload(new Blob([buffer], { type: 'application/octet-stream' }), `canvas-${Date.now()}.psd`)
        setFeedback('PSD 分层文件已导出')
        return
      }
      const flattened = renderCanvasWithBackground(canvas, exportScale, backgroundRef.current)
      const extension = format === 'jpeg' ? 'jpg' : 'png'
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png'
      triggerDownload(flattened.toDataURL(mimeType, 1), `canvas.${extension}`)
      setFeedback(`${extension.toUpperCase()} 已导出`)
    } catch {
      setFeedback('导出失败，当前画布中可能包含受跨域限制的图片')
    } finally {
      exportingRef.current = false
      setExportingFormat(null)
    }
  }, [exportScale, resolvePenDraft])

  const saveComposition = useCallback(async (closeAfterSave = false, closeBeforeSave = false) => {
    if (savingRef.current) return null
    savingRef.current = true
    setSaving(true)
    setExportMenuOpen(false)
    try {
      await historyQueueRef.current
      await cutoutOperationRef.current
      resolvePenDraft()
      if (cropStateRef.current) finishCropRef.current()
      await eraserQueueRef.current
      const canvas = canvasRef.current
      if (!canvas) throw new Error('图片编辑画布不可用')
      recordHistory()
      const renderedDataUrl = renderCanvasWithBackground(canvas, exportScale, backgroundRef.current).toDataURL('image/png')
      const fabricJson = serializeCanvas(canvas)
      const sourceNodeIds = collectCurrentSourceNodeIds(
        canvas.getObjects() as EditorObject[],
        initialPropsRef.current.initialComposition ? initialPropsRef.current.source?.sourceNodeId : undefined,
      )
      const submittedSnapshot: EditorSnapshot = {
        width: widthRef.current,
        height: heightRef.current,
        aspectRatio: aspectRatioRef.current,
        backgroundColor: backgroundRef.current,
        fabricJson,
      }
      const submittedSignature = snapshotSignature(submittedSnapshot)
      const exportDimensions = scaledExportDimensions(widthRef.current, heightRef.current, exportScale)
      const composition: ImageEditorComposition = {
        version: 2,
        aspectRatio: aspectRatioRef.current,
        backgroundColor: backgroundRef.current,
        width: widthRef.current,
        height: heightRef.current,
        fabricJson,
        sourceNodeIds,
        renderedDataUrl,
        updatedAt: new Date().toISOString(),
      }
      const payload: ImageEditorCommitPayload = {
        composition,
        media: {
          url: renderedDataUrl,
          mimeType: 'image/png',
          width: exportDimensions.width,
          height: exportDimensions.height,
        },
        sourceNodeIds,
        exportScale,
      }
      if (closeBeforeSave) closeWorkspace()
      const result = await onSave(payload)
      if (!result?.outputNodeId) throw new Error('保存结果缺少输出节点')
      initialSignatureRef.current = submittedSignature
      const currentSnapshot = captureSnapshot()
      const hasPostSubmitChanges = !currentSnapshot || snapshotSignature(currentSnapshot) !== submittedSignature
      if (!closeBeforeSave) {
        setDirty(hasPostSubmitChanges)
        setCloseDialogOpen(false)
        setFeedback(hasPostSubmitChanges ? '已保存提交版本，当前仍有未保存的更改' : '编辑结果已保存')
        if (closeAfterSave && !hasPostSubmitChanges) closeWorkspace()
      }
      return result
    } catch {
      setFeedback('保存失败，请保留当前页面并重试')
      return null
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [captureSnapshot, closeWorkspace, exportScale, onSave, recordHistory, resolvePenDraft])

  saveCompositionRef.current = saveComposition

  const openSaveDialog = useCallback((purpose: 'close' | 'save') => {
    setSaveDialogPurpose(purpose)
    setCloseDialogOpen(true)
  }, [])

  const requestClose = useCallback(async () => {
    if (savingRef.current || generatingRef.current || exportingRef.current) {
      setFeedback('当前操作完成后再关闭编辑器')
      return
    }
    await historyQueueRef.current
    await cutoutOperationRef.current
    await eraserQueueRef.current
    if (cropStateRef.current) cancelCrop()
    if (penAnchorsRef.current.length || penEditingObjectRef.current) cancelPen()
    const snapshot = captureSnapshot()
    const hasUnsavedChanges = snapshot
      ? snapshotSignature(snapshot) !== initialSignatureRef.current
      : dirty
    if (hasUnsavedChanges) {
      openSaveDialog('close')
    } else closeWorkspace()
  }, [cancelCrop, cancelPen, captureSnapshot, closeWorkspace, dirty, openSaveDialog])

  const updateLayerScrollState = useCallback(() => {
    const list = layerListRef.current
    if (!list) return
    setCanScrollLayers({
      up: list.scrollTop > 1,
      down: list.scrollTop + list.clientHeight < list.scrollHeight - 1,
    })
  }, [])

  const stopLayerScroll = useCallback(() => {
    if (layerScrollFrameRef.current !== null) window.cancelAnimationFrame(layerScrollFrameRef.current)
    layerScrollFrameRef.current = null
  }, [])

  const startLayerScroll = useCallback((direction: 'up' | 'down') => {
    stopLayerScroll()
    const tick = () => {
      const list = layerListRef.current
      if (!list) return stopLayerScroll()
      list.scrollTop += direction === 'up' ? -2 : 2
      updateLayerScrollState()
      const atEdge = direction === 'up'
        ? list.scrollTop <= 0
        : list.scrollTop + list.clientHeight >= list.scrollHeight - 1
      if (atEdge) return stopLayerScroll()
      layerScrollFrameRef.current = window.requestAnimationFrame(tick)
    }
    layerScrollFrameRef.current = window.requestAnimationFrame(tick)
  }, [stopLayerScroll, updateLayerScrollState])

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateLayerScrollState)
    return () => window.cancelAnimationFrame(frame)
  }, [layers, updateLayerScrollState])

  useEffect(() => stopLayerScroll, [stopLayerScroll])

  const reorderLayer = useCallback((targetId: string) => {
    const canvas = canvasRef.current
    const draggedId = draggedLayerIdRef.current
    if (!canvas || !draggedId || draggedId === targetId) return
    const objects = canvas.getObjects() as EditorObject[]
    const dragged = objects.find((object) => object.id === draggedId)
    const targetIndex = objects.findIndex((object) => object.id === targetId)
    if (!dragged || targetIndex < 0) return
    canvas.moveObjectTo(dragged, targetIndex)
    canvas.requestRenderAll()
    refreshLayers()
  }, [refreshLayers])

  const clearLayerDragTimer = useCallback(() => {
    if (layerDragTimerRef.current !== null) window.clearTimeout(layerDragTimerRef.current)
    layerDragTimerRef.current = null
  }, [])

  const beginLayerDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>, layerId: string) => {
    if (event.button !== 0) return
    clearLayerDragTimer()
    layerPointerDragRef.current = {
      layerId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      activated: false,
      cancelled: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    layerDragTimerRef.current = window.setTimeout(() => {
      const drag = layerPointerDragRef.current
      if (!drag || drag.cancelled || drag.layerId !== layerId) return
      drag.activated = true
      draggedLayerIdRef.current = layerId
      setDraggingLayerId(layerId)
    }, 100)
  }, [clearLayerDragTimer])

  const moveLayerDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = layerPointerDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
    if (!drag.activated) {
      if (distance > 5) {
        drag.cancelled = true
        clearLayerDragTimer()
      }
      return
    }
    event.preventDefault()
    const layerElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-layer-id]')
    if (layerElement?.dataset.layerId) reorderLayer(layerElement.dataset.layerId)
  }, [clearLayerDragTimer, reorderLayer])

  const finishLayerDrag = useCallback((event?: ReactPointerEvent<HTMLDivElement>) => {
    const drag = layerPointerDragRef.current
    if (event && drag?.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    clearLayerDragTimer()
    if (drag?.activated && draggedLayerIdRef.current) recordHistory()
    layerPointerDragRef.current = null
    draggedLayerIdRef.current = null
    setDraggingLayerId(null)
  }, [clearLayerDragTimer, recordHistory])

  const moveKeyboardLayer = useCallback((layerId: string, direction: 'up' | 'down') => {
    const canvas = canvasRef.current
    if (!canvas) return
    const visibleObjects = (canvas.getObjects() as EditorObject[]).filter((object) => !object.excludeFromExport && object.objectKind !== 'eraser')
    const index = visibleObjects.findIndex((object) => object.id === layerId)
    const nextIndex = direction === 'up' ? index + 1 : index - 1
    if (index < 0 || nextIndex < 0 || nextIndex >= visibleObjects.length) return
    const object = visibleObjects[index]
    const target = visibleObjects[nextIndex]
    canvas.moveObjectTo(object, canvas.getObjects().indexOf(target))
    canvas.requestRenderAll()
    refreshLayers()
  }, [refreshLayers])

  const handleLayerKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>, layerId: string) => {
    if (event.key === ' ' || event.code === 'Space') {
      event.preventDefault()
      if (keyboardGrabbedLayerId === layerId) {
        keyboardLayerOrderRef.current = null
        setKeyboardGrabbedLayerId(null)
        recordHistory()
        setFeedback('图层顺序已更新')
      } else {
        const canvas = canvasRef.current
        if (!canvas) return
        selectLayer(layerId)
        keyboardLayerOrderRef.current = [...canvas.getObjects()] as EditorObject[]
        setKeyboardGrabbedLayerId(layerId)
        setFeedback('已拿起图层，可用方向键调整顺序')
      }
      return
    }
    if (event.key === 'Escape' && keyboardGrabbedLayerId) {
      event.preventDefault()
      const canvas = canvasRef.current
      const originalOrder = keyboardLayerOrderRef.current
      if (canvas && originalOrder) {
        originalOrder.forEach((object, index) => {
          if (canvas.getObjects().includes(object)) canvas.moveObjectTo(object, index)
        })
        canvas.requestRenderAll()
        refreshLayers()
      }
      keyboardLayerOrderRef.current = null
      setKeyboardGrabbedLayerId(null)
      setFeedback('已取消图层排序')
      return
    }
    if (keyboardGrabbedLayerId !== layerId || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    moveKeyboardLayer(layerId, event.key === 'ArrowUp' ? 'up' : 'down')
  }, [keyboardGrabbedLayerId, moveKeyboardLayer, recordHistory, refreshLayers, selectLayer])

  const beginPoseDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>, pointId: string) => {
    const bounds = poseStageRef.current?.getBoundingClientRect()
    if (!bounds) return
    event.preventDefault()
    event.stopPropagation()
    const selected = event.ctrlKey || event.metaKey
      ? selectedPosePointIds.includes(pointId)
        ? selectedPosePointIds.filter((id) => id !== pointId)
        : [...selectedPosePointIds, pointId]
      : [pointId]
    setSelectedPosePointIds(selected)
    poseDragRef.current = {
      ids: selected.length ? selected : [pointId],
      points: structuredClone(posePoints),
      start: { x: (event.clientX - bounds.left) / bounds.width * 100, y: (event.clientY - bounds.top) / bounds.height * 100 },
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraggedPosePoint(pointId)
  }, [posePoints, selectedPosePointIds])

  const movePose = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = poseDragRef.current
    const bounds = poseStageRef.current?.getBoundingClientRect()
    if (!drag || !bounds) return
    const point = { x: (event.clientX - bounds.left) / bounds.width * 100, y: (event.clientY - bounds.top) / bounds.height * 100 }
    const delta = { x: point.x - drag.start.x, y: point.y - drag.start.y }
    setPosePoints(drag.points.map((item) => drag.ids.includes(item.id)
      ? { ...item, x: clamp(item.x + delta.x, 5, 95), y: clamp(item.y + delta.y, 6, 94) }
      : item))
  }, [])

  const endPoseDrag = useCallback(() => {
    poseDragRef.current = null
    setDraggedPosePoint(null)
  }, [])

  const beginPoseSelection = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.image-editor-pose-joint')) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    event.preventDefault()
    const point = {
      x: clamp((event.clientX - bounds.left) / bounds.width * 100, 0, 100),
      y: clamp((event.clientY - bounds.top) / bounds.height * 100, 0, 100),
    }
    const additive = event.ctrlKey || event.metaKey
    const initialSelection = additive ? selectedPosePointIds : []
    poseSelectionDragRef.current = {
      pointerId: event.pointerId,
      start: point,
      current: point,
      initialSelection,
      additive,
    }
    setSelectedPosePointIds(initialSelection)
    setPoseSelectionRect({ left: point.x, top: point.y, width: 0, height: 0 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [selectedPosePointIds])

  const movePoseSelection = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = poseSelectionDragRef.current
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!drag || drag.pointerId !== event.pointerId || !bounds.width || !bounds.height) return
    event.preventDefault()
    drag.current = {
      x: clamp((event.clientX - bounds.left) / bounds.width * 100, 0, 100),
      y: clamp((event.clientY - bounds.top) / bounds.height * 100, 0, 100),
    }
    const left = Math.min(drag.start.x, drag.current.x)
    const top = Math.min(drag.start.y, drag.current.y)
    const right = Math.max(drag.start.x, drag.current.x)
    const bottom = Math.max(drag.start.y, drag.current.y)
    const enclosed = posePoints
      .filter((point) => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom)
      .map((point) => point.id)
    setPoseSelectionRect({ left, top, width: right - left, height: bottom - top })
    setSelectedPosePointIds(drag.additive ? Array.from(new Set([...drag.initialSelection, ...enclosed])) : enclosed)
  }, [posePoints])

  const endPoseSelection = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = poseSelectionDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    poseSelectionDragRef.current = null
    setPoseSelectionRect(null)
  }, [])

  const posePoint = useCallback((id: string) => posePoints.find((point) => point.id === id), [posePoints])

  const generatePoseReference = useCallback(async () => {
    const offscreen = document.createElement('canvas')
    offscreen.width = 720
    offscreen.height = 720
    const context = offscreen.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, offscreen.width, offscreen.height)
    context.strokeStyle = poseColor
    context.fillStyle = poseColor
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = 13
    poseConnections.forEach(([from, to]) => {
      const start = posePoint(from)
      const end = posePoint(to)
      if (!start || !end) return
      context.beginPath()
      context.moveTo(start.x / 100 * 720, start.y / 100 * 720)
      context.lineTo(end.x / 100 * 720, end.y / 100 * 720)
      context.stroke()
    })
    posePoints.forEach((point) => {
      context.beginPath()
      context.arc(point.x / 100 * 720, point.y / 100 * 720, point.id === 'head' ? 34 : 16, 0, Math.PI * 2)
      context.fill()
    })
    setPoseGeneratorOpen(false)
    await addImage({ src: offscreen.toDataURL('image/png'), title: '姿势参考' }, { kind: 'pose', record: true, widthFraction: 0.48 })
  }, [addImage, poseColor, posePoint, posePoints])

  const trapModalKeys = useCallback((event: ReactKeyboardEvent<HTMLDivElement>, close: () => void) => {
    if (event.defaultPrevented) return
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!savingRef.current) close()
    }
  }, [])

  const handleRatioMenuKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && ratioMenuOpen) {
      event.preventDefault()
      setRatioMenuOpen(false)
      ratioMenuRef.current?.querySelector<HTMLElement>(':scope > button')?.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    if (!ratioMenuOpen) {
      setRatioMenuOpen(true)
      window.requestAnimationFrame(() => {
        const items = ratioMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
        if (!items?.length) return
        const keyboardRatios = generationMode === 'video' ? VIDEO_ASPECT_RATIOS : aspectRatios
        const selectedIndex = keyboardRatios.indexOf(aspectRatio)
        items[Math.max(0, selectedIndex)]?.focus()
      })
      return
    }
    const items = Array.from(ratioMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') || [])
    if (!items.length) return
    const activeIndex = Math.max(0, items.indexOf(document.activeElement as HTMLElement))
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? (activeIndex + 1) % items.length
          : (activeIndex - 1 + items.length) % items.length
    items[nextIndex]?.focus()
  }, [aspectRatio, generationMode, ratioMenuOpen])

  useEffect(() => {
    const handleTabCapture = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Tab') return
      const scope = closeDialogOpen
        ? closeDialogRef.current
        : poseGeneratorOpen
          ? poseDialogRef.current
          : rootRef.current
      if (!scope) return
      const focusable = focusableElements(scope)
      if (!focusable.length) {
        event.preventDefault()
        scope.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (!scope.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && (active === first || active === scope)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleTabCapture, true)
    return () => window.removeEventListener('keydown', handleTabCapture, true)
  }, [closeDialogOpen, poseGeneratorOpen])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scope = closeDialogOpen
        ? closeDialogRef.current
        : poseGeneratorOpen
          ? poseDialogRef.current
          : rootRef.current
      const first = scope ? focusableElements(scope)[0] : undefined
      if (first) first.focus()
      else scope?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [closeDialogOpen, cropMode, cutoutObjectId, exportingFormat, generating, historyBusy, poseGeneratorOpen, saving])

  useEffect(() => {
    const releaseSpacePan = () => {
      spacePressedRef.current = false
      const pan = workspacePanRef.current
      workspacePanRef.current = null
      setPanning(false)
      if (pan && workspaceRef.current?.hasPointerCapture(pan.pointerId)) workspaceRef.current.releasePointerCapture(pan.pointerId)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') releaseSpacePan()
    }
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', releaseSpacePan)
    return () => {
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', releaseSpacePan)
    }
  }, [])

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (!rootRef.current || closeDialogOpen || poseGeneratorOpen) return
      const target = event.target as HTMLElement | null
      const active = canvasRef.current?.getActiveObject()
      const key = event.key.toLowerCase()
      const editing = Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'))
        || Boolean(active instanceof IText && active.isEditing)
      if ((event.metaKey || event.ctrlKey) && key === 's') {
        event.preventDefault()
        if (
          historyBusyRef.current
          || savingRef.current
          || generatingRef.current
          || exportingRef.current
          || cutoutObjectIdRef.current
          || cropStateRef.current
          || penAnchorsRef.current.length
          || penEditingObjectRef.current
        ) return
        openSaveDialog('save')
        return
      }
      if (editing) return
      if (historyBusyRef.current || savingRef.current || generatingRef.current || exportingRef.current) {
        if (event.key !== 'Tab') event.preventDefault()
        return
      }
      if (cutoutObjectIdRef.current) {
        if (event.key !== 'Tab') event.preventDefault()
        return
      }
      if (cropStateRef.current) {
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelCrop()
        } else if (event.key === 'Enter') {
          event.preventDefault()
          finishCrop()
        } else if (event.key !== 'Tab') {
          event.preventDefault()
        }
        return
      }
      if (penAnchorsRef.current.length || penEditingObjectRef.current) {
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelPen()
          setEditorTool('select')
        } else if (event.key === 'Enter') {
          event.preventDefault()
          finishPen()
        } else if (event.key !== 'Tab') {
          event.preventDefault()
        }
        return
      }
      if (event.code === 'Space') {
        event.preventDefault()
        spacePressedRef.current = true
        return
      }
      if (event.metaKey || event.ctrlKey) {
        if (key === 'z') {
          event.preventDefault()
          if (!event.shiftKey) void undo()
        } else if (key === 'y') {
          event.preventDefault()
          void redo()
        } else if (key === 'c') {
          event.preventDefault()
          void copySelection()
        } else if (key === 'v') {
          event.preventDefault()
          void pasteFromSystemClipboard()
        }
        return
      }
      if (event.altKey || event.shiftKey) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelected()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        if (ratioMenuOpen) setRatioMenuOpen(false)
        else if (propertyPanel) setPropertyPanel(null)
        else if (layerContextMenu) setLayerContextMenu(null)
        else if (exportMenuOpen) setExportMenuOpen(false)
        else if (toolRef.current === 'pen') {
          cancelPen()
          setEditorTool('select')
        } else {
          canvasRef.current?.discardActiveObject()
          canvasRef.current?.requestRenderAll()
          refreshLayers()
        }
      } else if (event.key === 'Enter' && toolRef.current === 'pen') {
        event.preventDefault()
        finishPen()
      }
    }
    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [cancelCrop, cancelPen, closeDialogOpen, copySelection, deleteSelected, exportMenuOpen, finishCrop, finishPen, layerContextMenu, openSaveDialog, pasteFromSystemClipboard, poseGeneratorOpen, propertyPanel, ratioMenuOpen, redo, refreshLayers, setEditorTool, undo])

  const artboardStyle = {
    width,
    height,
    transform: `scale(${zoom})`,
    transformOrigin: 'top left',
  } satisfies CSSProperties
  const artboardWrapStyle = {
    width: Math.max(1, width * zoom),
    height: Math.max(1, height * zoom),
  } satisfies CSSProperties
  const exportDimensions = scaledExportDimensions(width, height, exportScale)
  const canUndo = historyCursor.index > 0
  const canRedo = historyCursor.index >= 0 && historyCursor.index < historyCursor.length - 1
  const transactionBusy = historyBusy || Boolean(cutoutObjectId) || generating || Boolean(exportingFormat)
  const interfaceLocked = cropMode || transactionBusy
  const showRailPanel = Boolean(railMode)
  const contextLayerIndex = layerContextMenu ? layers.findIndex((layer) => layer.id === layerContextMenu.layerId) : -1
  const currentCount = generationMode === 'video' ? videoCount : imageCount
  const availableAspectRatios = generationMode === 'video' ? VIDEO_ASPECT_RATIOS : aspectRatios
  const currentPaint = singleActiveObject?.objectKind === 'brush' || singleActiveObject?.objectKind === 'pen' || singleActiveObject?.objectKind === 'arrow'
    ? singleActiveObject.stroke
    : singleActiveObject?.fill
  const propertyPanelContent = (() => {
    let title = ''
    let content: ReactNode = null
    if (propertyPanel === 'background') {
      title = '画布背景色'
      content = <ColorPanelContent label="画布背景色" value={backgroundColor} onChange={changeBackground} />
    } else if (propertyPanel === 'drawColor') {
      title = '绘制颜色'
      content = (
        <div className="image-editor-draw-settings">
          <RangePanelContent label="画笔宽度" min={1} max={100} value={brushWidth} onChange={setBrushWidth} />
          <ColorPanelContent label="绘制颜色" value={color} onChange={updateColor} swatches={DRAW_COLOR_SWATCHES} showSectionLabels />
        </div>
      )
    } else if (!singleActiveObject) {
      return null
    } else if (propertyPanel === 'fill') {
      title = isText ? '文字颜色' : '填充颜色'
      content = <ColorPanelContent label={title} value={currentPaint || color} onChange={updateColor} />
    } else if (propertyPanel === 'stroke') {
      title = '边框颜色'
      content = <ColorPanelContent label="边框颜色" value={singleActiveObject.stroke || '#111111'} onChange={updateStroke} />
    } else if (propertyPanel === 'strokeWidth') {
      title = '边框宽度'
      content = <RangePanelContent label="边框宽度" min={0} max={30} value={singleActiveObject.strokeWidth || 0} unit="px" onChange={(value) => mutateActive((object) => object.set({ strokeWidth: value }), { debounce: true })} />
    } else if (propertyPanel === 'strokeStyle') {
      title = '边框样式'
      content = (
        <div className="image-editor-segmented-options" role="group" aria-label="边框样式">
          {([['solid', '实线'], ['dashed', '虚线'], ['dotted', '点线']] as const).map(([value, label]) => (
            <button type="button" key={value} className={(singleActiveObject.strokeStyle || 'solid') === value ? 'active' : ''} onClick={() => updateStrokeStyle(value)}>{label}</button>
          ))}
        </div>
      )
    } else if (propertyPanel === 'opacity') {
      title = '透明度'
      content = <RangePanelContent label="透明度" min={0} max={100} value={Math.round((singleActiveObject.opacity ?? 1) * 100)} unit="%" onChange={(value) => mutateActive((object) => object.set({ opacity: value / 100 }), { debounce: true })} />
    } else if (propertyPanel === 'cornerRadius') {
      title = '矩形圆角'
      content = <RangePanelContent label="矩形圆角" min={0} max={160} value={(singleActiveObject as Rect).rx || 0} unit="px" onChange={(value) => mutateActive((object) => object.set({ rx: value, ry: value }), { debounce: true })} />
    } else if (propertyPanel === 'font') {
      title = '字体'
      content = (
        <select className="image-editor-property-select" aria-label="字体" value={(singleActiveObject as IText).fontFamily || FONT_OPTIONS[0][0]} onChange={(event) => mutateActive((object) => object.set({ fontFamily: event.target.value }))}>
          {FONT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      )
    } else if (propertyPanel === 'charSpacing') {
      title = '字间距'
      content = <RangePanelContent label="字间距" min={-100} max={1000} value={(singleActiveObject as IText).charSpacing || 0} onChange={(value) => mutateActive((object) => object.set({ charSpacing: value }), { debounce: true })} />
    } else if (propertyPanel === 'lineHeight') {
      title = '行高'
      content = <RangePanelContent label="行高" min={0.6} max={3} step={0.1} value={(singleActiveObject as IText).lineHeight || 1.16} onChange={(value) => mutateActive((object) => object.set({ lineHeight: value }), { debounce: true })} />
    }
    if (!content) return null
    return (
      <div className={`image-editor-property-popover ${propertyPanel === 'background' ? 'is-background' : ''}`} role="dialog" aria-label={title} onPointerDown={(event) => event.stopPropagation()}>
        {propertyPanel !== 'drawColor' && <header><strong>{title}</strong><button type="button" aria-label={`关闭${title}`} onClick={() => setPropertyPanel(null)}><X size={14} /></button></header>}
        {content}
      </div>
    )
  })()

  return (
    <section
      ref={rootRef}
      className={`tapnow-image-editor ${cropMode ? 'is-cropping' : ''} ${transactionBusy ? 'is-busy' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="图片编辑器"
      data-canvas-overlay="true"
      tabIndex={-1}
      aria-busy={transactionBusy || saving || undefined}
      onPointerDownCapture={(event) => {
        if (historyBusyRef.current || cutoutObjectIdRef.current) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        const target = event.target as HTMLElement
        if (layerContextMenu && !target.closest('.image-editor-layer-context-menu')) setLayerContextMenu(null)
        if (propertyPanel && !target.closest('.image-editor-context-toolbar, .image-editor-property-popover, .image-editor-color-control')) setPropertyPanel(null)
        if (ratioMenuOpen && !ratioMenuRef.current?.contains(target)) setRatioMenuOpen(false)
      }}
    >
      <header className="image-editor-header">
        <div className="image-editor-header-start" inert={interfaceLocked} aria-hidden={interfaceLocked || undefined}>
          <div ref={ratioMenuRef} className="image-editor-ratio-select" onKeyDown={handleRatioMenuKeyDown}>
            <button
              type="button"
              aria-label="画布比例"
              aria-haspopup="menu"
              aria-expanded={ratioMenuOpen}
              onClick={() => setRatioMenuOpen((current) => !current)}
            >
              <span>{aspectRatio}</span>
              <ChevronDown size={14} />
            </button>
            {ratioMenuOpen && (
              <div className="image-editor-ratio-menu" role="menu" aria-label="选择画布比例">
                {availableAspectRatios.map((ratio) => (
                  <button
                    type="button"
                    key={ratio}
                    role="menuitemradio"
                    aria-checked={aspectRatio === ratio}
                    className={aspectRatio === ratio ? 'active' : ''}
                    onClick={() => {
                      resizeArtboard(ratio)
                      setRatioMenuOpen(false)
                    }}
                  >
                    <span>{ratio}</span>
                    {aspectRatio === ratio && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="image-editor-color-control"
            data-tooltip="画布背景色"
            aria-label="画布背景色"
            aria-expanded={propertyPanel === 'background'}
            onClick={() => togglePropertyPanel('background')}
          >
            <i style={{ background: backgroundColor }} />
          </button>
        </div>

        {cropMode ? (
          <div className="image-editor-context-toolbar image-editor-crop-toolbar" role="toolbar" aria-label="裁剪属性" inert={transactionBusy} aria-hidden={transactionBusy || undefined}>
            <button type="button" className="primary" aria-label="完成裁剪" onClick={finishCrop}><Check size={16} /><span>完成裁剪</span></button>
            <button type="button" aria-label="取消裁剪" data-tooltip="取消裁剪" onClick={cancelCrop}><X size={16} /></button>
          </div>
        ) : singleActiveObject ? (
          <div className={`image-editor-context-toolbar ${isText ? 'image-editor-text-toolbar' : ''}`} role="toolbar" aria-label="对象属性" inert={transactionBusy} aria-hidden={transactionBusy || undefined}>
            <button type="button" data-tooltip="重置位置" aria-label="重置位置" onClick={resetSelectedPosition}><RotateCcw size={16} /></button>
            <button type="button" data-tooltip="置于顶层" aria-label="置于顶层" onClick={() => moveSelectionToEdge('front')}><ArrowUpToLine size={16} /></button>
            <button type="button" data-tooltip="置于底层" aria-label="置于底层" onClick={() => moveSelectionToEdge('back')}><ArrowDownToLine size={16} /></button>
            <button type="button" data-tooltip="删除" aria-label="删除所选对象" onClick={deleteSelected}><Trash2 size={16} /></button>
            <span className="image-editor-context-divider" />

            {supportsPaint && (
              <>
                <button type="button" aria-label={isText ? '文字颜色' : '填充颜色'} data-tooltip={isText ? '文字颜色' : '填充颜色'} aria-expanded={propertyPanel === 'fill'} onClick={() => togglePropertyPanel('fill')}><PaintBucket size={16} /><i className="image-editor-button-swatch" style={{ background: typeof currentPaint === 'string' ? currentPaint : color }} /></button>
                <button type="button" aria-label="边框颜色" data-tooltip="边框颜色" aria-expanded={propertyPanel === 'stroke'} onClick={() => togglePropertyPanel('stroke')}><span className="image-editor-stroke-icon" style={{ borderColor: typeof singleActiveObject.stroke === 'string' ? singleActiveObject.stroke : '#d8d8d8' }} /></button>
                <button type="button" aria-label="边框宽度" data-tooltip="边框宽度" aria-expanded={propertyPanel === 'strokeWidth'} onClick={() => togglePropertyPanel('strokeWidth')}><SlidersHorizontal size={16} /></button>
                <button type="button" aria-label="边框样式" data-tooltip="边框样式" aria-expanded={propertyPanel === 'strokeStyle'} onClick={() => togglePropertyPanel('strokeStyle')}><ScanLine size={16} /></button>
              </>
            )}

            {isImage && (
              <>
                <button type="button" className={singleActiveObject.flipX ? 'active' : ''} data-tooltip="水平翻转" aria-label="水平翻转" onClick={() => mutateActive((object) => object.set({ flipX: !object.flipX }))}><FlipHorizontal2 size={16} /></button>
                <button type="button" className={singleActiveObject.flipY ? 'active' : ''} data-tooltip="垂直翻转" aria-label="垂直翻转" onClick={() => mutateActive((object) => object.set({ flipY: !object.flipY }))}><FlipVertical2 size={16} /></button>
                <button type="button" data-tooltip="裁剪" aria-label="裁剪图片" onClick={() => void startCrop(singleActiveObject)}><Crop size={16} /></button>
                <button type="button" disabled={cutoutObjectId === (singleActiveObject as EditorObject).id} data-tooltip="抠图" aria-label="抠图" onClick={() => void cutoutImage()}>{cutoutObjectId === (singleActiveObject as EditorObject).id ? <LoaderCircle className="image-editor-spin" size={16} /> : <WandSparkles size={16} />}</button>
              </>
            )}

            <button type="button" aria-label="透明度" data-tooltip="透明度" aria-expanded={propertyPanel === 'opacity'} onClick={() => togglePropertyPanel('opacity')}><span className="image-editor-opacity-icon" /></button>

            {isRectangle && (
              <button type="button" aria-label="矩形圆角" data-tooltip="矩形圆角" aria-expanded={propertyPanel === 'cornerRadius'} onClick={() => togglePropertyPanel('cornerRadius')}><Square size={15} /></button>
            )}

            {isText && (
              <>
                <button type="button" data-tooltip="字体" aria-label="字体" aria-expanded={propertyPanel === 'font'} onClick={() => togglePropertyPanel('font')}><Type size={16} /></button>
                <button type="button" className={Number((singleActiveObject as IText).fontWeight) >= 700 || (singleActiveObject as IText).fontWeight === 'bold' ? 'active' : ''} aria-label="粗体" onClick={() => mutateActive((object) => object.set({ fontWeight: Number((object as IText).fontWeight) >= 700 || (object as IText).fontWeight === 'bold' ? 500 : 700 }))}><Bold size={16} /></button>
                <button type="button" className={(singleActiveObject as IText).fontStyle === 'italic' ? 'active' : ''} aria-label="斜体" onClick={() => mutateActive((object) => object.set({ fontStyle: (object as IText).fontStyle === 'italic' ? 'normal' : 'italic' }))}><Italic size={16} /></button>
                <button type="button" className={(singleActiveObject as IText).underline ? 'active' : ''} aria-label="下划线" onClick={() => mutateActive((object) => object.set({ underline: !(object as IText).underline }))}><Underline size={16} /></button>
                <button type="button" className={(singleActiveObject as IText).linethrough ? 'active' : ''} aria-label="删除线" onClick={() => mutateActive((object) => object.set({ linethrough: !(object as IText).linethrough }))}><Strikethrough size={16} /></button>
                <button type="button" data-tooltip="切换对齐" aria-label="切换文字对齐" onClick={cycleTextAlignment}>{(singleActiveObject as IText).textAlign === 'center' ? <AlignCenter size={16} /> : (singleActiveObject as IText).textAlign === 'right' ? <AlignRight size={16} /> : <AlignLeft size={16} />}</button>
                <button type="button" data-tooltip="字间距" aria-label="字间距" aria-expanded={propertyPanel === 'charSpacing'} onClick={() => togglePropertyPanel('charSpacing')}><CaseUpper size={15} /></button>
                <button type="button" data-tooltip="行高" aria-label="行高" aria-expanded={propertyPanel === 'lineHeight'} onClick={() => togglePropertyPanel('lineHeight')}><span className="image-editor-line-height-icon">LH</span></button>
              </>
            )}
          </div>
        ) : null}

        {!cropMode && activeObjects.length === 0 && (tool === 'brush' || tool === 'eraser' || tool === 'rectangle' || tool === 'arrow' || tool === 'pen') && (
          <div className="image-editor-context-toolbar" role="toolbar" aria-label="绘制属性" inert={transactionBusy} aria-hidden={transactionBusy || undefined}>
            {(tool === 'brush' || tool === 'eraser') && (
              <>
                <button type="button" className={tool === 'brush' ? 'active' : ''} data-tooltip="画笔" aria-label="画笔" onClick={() => setEditorTool('brush')}><Palette size={16} /></button>
                <button type="button" className={tool === 'eraser' ? 'active' : ''} data-tooltip="橡皮擦" aria-label="橡皮擦" onClick={() => setEditorTool('eraser')}><Eraser size={16} /></button>
                <span className="image-editor-context-divider" />
              </>
            )}
            <button type="button" data-tooltip="绘制颜色与宽度" aria-label="绘制颜色" aria-expanded={propertyPanel === 'drawColor'} onClick={() => togglePropertyPanel('drawColor')}><PaintBucket size={16} /><i className="image-editor-button-swatch" style={{ background: color }} /></button>
          </div>
        )}

        {propertyPanelContent}

        <div className="image-editor-header-actions" inert={interfaceLocked} aria-hidden={interfaceLocked || undefined}>
          <button type="button" data-tooltip="导出图片" aria-label="导出图片" aria-expanded={exportMenuOpen} onClick={() => setExportMenuOpen((current) => !current)}><Download size={18} /></button>
          <button type="button" data-tooltip="保存编辑结果" aria-label="保存编辑结果" disabled={saving} onClick={() => openSaveDialog('save')}><Save size={17} /></button>
          <button type="button" data-tooltip="关闭图片编辑器" aria-label="关闭图片编辑器" onClick={requestClose}><X size={18} /></button>
        </div>
      </header>

      {exportMenuOpen && !transactionBusy && (
        <div className="image-editor-export-menu" role="menu" aria-label="导出图片">
          <button type="button" role="menuitem" disabled={Boolean(exportingFormat)} onClick={() => exportCanvas('png')}>PNG</button>
          <button type="button" role="menuitem" disabled={Boolean(exportingFormat)} onClick={() => exportCanvas('jpeg')}>JPG</button>
          <button type="button" role="menuitem" disabled={Boolean(exportingFormat)} onClick={() => exportCanvas('psd')}>{exportingFormat === 'psd' ? <><LoaderCircle className="image-editor-spin" size={15} />正在导出 PSD</> : 'PSD'}</button>
        </div>
      )}

      {tool === 'pen' && (
        <div className="image-editor-draw-instruction" role="status" inert={transactionBusy} aria-hidden={transactionBusy || undefined}>
          <span>点击画布即可绘制形状。按 Enter 完成，按 ESC 取消。</span>
          <button type="button" aria-label="退出 Pen Tool" onClick={() => { cancelPen(); setEditorTool('select') }}><X size={16} /></button>
        </div>
      )}

      <aside className="image-editor-left-rail" aria-label="图片编辑器侧栏" inert={interfaceLocked} aria-hidden={interfaceLocked || undefined}>
        <button type="button" className={railMode === 'assets' ? 'active' : ''} data-tooltip="画布素材" aria-label="画布素材" onClick={() => setRailMode((current) => current === 'assets' ? null : 'assets')}><ImageIcon size={19} /></button>
        <button type="button" className={railMode === 'history' ? 'active' : ''} data-tooltip="资产" aria-label="资产" onClick={() => setRailMode((current) => current === 'history' ? null : 'history')}><FolderOpen size={19} /></button>
        <button type="button" className={railMode === 'shapes' ? 'active' : ''} data-tooltip="图形库" aria-label="图形库" onClick={() => setRailMode((current) => current === 'shapes' ? null : 'shapes')}><Shapes size={19} /></button>
        <button type="button" className={poseGeneratorOpen ? 'active' : ''} data-tooltip="姿势生成器" aria-label="姿势生成器" onClick={() => { setRailMode(null); setPoseGeneratorOpen(true) }}><UserRound size={19} /></button>
      </aside>

      {showRailPanel && railMode && (
        <aside className={`image-editor-side-panel rail-${railMode}`} aria-label={railMode === 'assets' ? '画布素材' : railMode === 'history' ? '资产' : '图形库'} inert={interfaceLocked} aria-hidden={interfaceLocked || undefined}>
          {railMode === 'assets' && (
            <>
              <div className="image-editor-asset-grid">
                {imageAssets.map((asset) => (
                  <button type="button" key={asset.id} aria-label={`添加素材 ${asset.title}`} data-tooltip={asset.title} onClick={() => void addImage(asset)}>
                    <img src={asset.src} alt="" />
                  </button>
                ))}
                {!imageAssets.length && <p className="image-editor-empty-assets">暂无可用图片</p>}
              </div>
            </>
          )}
          {railMode === 'history' && (
            <div className="image-editor-history-assets">
              <div className="image-editor-asset-tabs image-editor-library-tabs" role="tablist" aria-label="图片资产分类">
                {([
                  ['all', '全部'],
                  ['generated', '全部生成'],
                  ['favorite', '收藏夹'],
                  ['uncategorized', '未分类'],
                ] as const).map(([tab, label]) => (
                  <button
                    type="button"
                    key={tab}
                    role="tab"
                    aria-selected={assetLibraryTab === tab}
                    onClick={() => { setAssetLibraryTab(tab); setHistoryAssetLimit(20) }}
                  >{label}</button>
                ))}
              </div>
              <div className="image-editor-asset-grid">
                {visibleHistoryAssets.map((asset) => (
                  <button type="button" key={asset.id} aria-label={`添加资产 ${asset.title}`} data-tooltip={asset.title} onClick={() => void addImage(asset)}>
                    <img src={asset.src} alt="" loading="lazy" />
                  </button>
                ))}
                {!visibleHistoryAssets.length && <p className="image-editor-empty-assets">暂无可用资产</p>}
              </div>
              {historyAssetLimit < filteredHistoryAssets.length && (
                <button type="button" className="image-editor-history-more" onClick={() => setHistoryAssetLimit((current) => current + 20)}>加载更多</button>
              )}
            </div>
          )}
          {railMode === 'shapes' && (
            <div className="image-editor-shape-list">
              <section aria-label="基本图形">
                <h3>基本图形</h3>
                <button type="button" aria-label="矩形" data-tooltip="矩形" onClick={() => createShape('rectangle')}><Square size={21} /></button>
                <button type="button" aria-label="圆形" data-tooltip="圆形" onClick={() => createShape('circle')}><span className="image-editor-shape-option-icon" style={{ border: '2px solid currentColor', borderRadius: '50%' }} /></button>
                <button type="button" aria-label="直线" data-tooltip="直线" onClick={() => createShape('line')}><span className="image-editor-shape-option-icon" style={{ height: 2, background: 'currentColor', transform: 'rotate(-24deg)' }} /></button>
              </section>
              <section aria-label="SVG 图形">
                <h3>SVG 图形</h3>
                <button type="button" aria-label="星形" data-tooltip="星形" onClick={() => createShape('star')}>★</button>
                <button type="button" aria-label="三角形" data-tooltip="三角形" onClick={() => createShape('triangle')}>▲</button>
                <button type="button" aria-label="圆形" data-tooltip="圆形" onClick={() => createShape('circle')}>●</button>
              </section>
            </div>
          )}
        </aside>
      )}

      <main
        ref={workspaceRef}
        className={`image-editor-workspace ${source ? 'has-source' : 'is-standalone'} ${panning ? 'is-panning' : ''}`}
        data-scrollable-workspace="true"
        inert={transactionBusy}
        aria-busy={transactionBusy || undefined}
        onPointerDownCapture={beginWorkspacePan}
        onPointerMove={moveWorkspacePan}
        onPointerUp={endWorkspacePan}
        onPointerCancel={endWorkspacePan}
        onDragOver={(event) => {
          if (interfaceLocked) {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'none'
            return
          }
          handleWorkspaceDragOver(event)
        }}
        onDrop={(event) => {
          if (interfaceLocked) {
            event.preventDefault()
            return
          }
          void handleWorkspaceDrop(event)
        }}
      >
        <div ref={artboardWrapRef} className={`image-editor-artboard-wrap ${source ? 'has-source' : 'is-standalone'}`} style={artboardWrapStyle}>
          <div ref={artboardRef} className={`image-editor-artboard tool-${tool}`} style={artboardStyle}>
            <canvas ref={canvasElementRef} aria-label="图片编辑画布" />
          </div>
          {aspectRatio === 'custom' && !interfaceLocked && (['top', 'right', 'bottom', 'left'] as const).map((edge) => (
            <button
              type="button"
              key={edge}
              className={`image-editor-canvas-resize-handle edge-${edge}`}
              aria-label={`调整画布${edge === 'top' ? '上边' : edge === 'right' ? '右边' : edge === 'bottom' ? '下边' : '左边'}`}
              onPointerDown={(event) => beginCanvasResize(event, edge)}
              onPointerMove={moveCanvasResize}
              onPointerUp={endCanvasResize}
              onPointerCancel={endCanvasResize}
            />
          ))}
        </div>
      </main>

      <aside className="image-editor-layer-rail" role="group" aria-label="图层顺序" inert={interfaceLocked} aria-hidden={interfaceLocked || undefined}>
        <button type="button" aria-label="向上滚动图层" disabled={!canScrollLayers.up} onMouseEnter={() => startLayerScroll('up')} onMouseLeave={stopLayerScroll} onFocus={() => startLayerScroll('up')} onBlur={stopLayerScroll} onClick={() => layerListRef.current?.scrollBy({ top: -48, behavior: 'smooth' })}><ChevronUp size={18} /></button>
        <div ref={layerListRef} className="image-editor-layer-list" role="list" aria-label="图层列表" onScroll={updateLayerScrollState}>
          {[...layers].reverse().map((layer) => (
            <div
              role="listitem"
              key={layer.id}
              data-layer-id={layer.id}
              className={draggingLayerId === layer.id ? 'dragging' : ''}
              onPointerDown={(event) => beginLayerDrag(event, layer.id)}
              onPointerMove={moveLayerDrag}
              onPointerUp={finishLayerDrag}
              onPointerCancel={finishLayerDrag}
              onContextMenu={(event) => {
                event.preventDefault()
                finishLayerDrag()
                selectLayer(layer.id)
                setLayerContextMenu({
                  layerId: layer.id,
                  x: Math.min(event.clientX, window.innerWidth - 196),
                  y: Math.min(event.clientY, window.innerHeight - 178),
                })
              }}
            >
              <button
                type="button"
                className={activeObjects.some((object) => object.id === layer.id) ? 'active' : ''}
                aria-label={`${layer.label} 图层`}
                aria-pressed={activeObjects.some((object) => object.id === layer.id)}
                aria-grabbed={keyboardGrabbedLayerId === layer.id}
                onKeyDown={(event) => handleLayerKeyDown(event, layer.id)}
                onClick={() => selectLayer(layer.id)}
              >
                <span className="image-editor-layer-thumbnail"><LayerThumbnail layer={layer} /></span>
              </button>
            </div>
          ))}
        </div>
        <button type="button" aria-label="向下滚动图层" disabled={!canScrollLayers.down} onMouseEnter={() => startLayerScroll('down')} onMouseLeave={stopLayerScroll} onFocus={() => startLayerScroll('down')} onBlur={stopLayerScroll} onClick={() => layerListRef.current?.scrollBy({ top: 48, behavior: 'smooth' })}><ChevronDown size={18} /></button>
      </aside>

      {layerContextMenu && (
        <div
          className="image-editor-layer-context-menu"
          role="menu"
          aria-label="图层操作"
          style={{ left: layerContextMenu.x, top: layerContextMenu.y }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" role="menuitem" onClick={() => void duplicateLayer(layerContextMenu.layerId)}>复制图层</button>
          <span role="separator" />
          <button type="button" role="menuitem" disabled={contextLayerIndex === layers.length - 1} onClick={() => moveLayer(layerContextMenu.layerId, 'up')}>上移一层</button>
          <button type="button" role="menuitem" disabled={contextLayerIndex <= 0} onClick={() => moveLayer(layerContextMenu.layerId, 'down')}>下移一层</button>
          <span role="separator" />
          <button type="button" role="menuitem" className="danger" onClick={() => deleteLayer(layerContextMenu.layerId)}>删除图层</button>
        </div>
      )}

      <footer className="image-editor-footer" inert={interfaceLocked} aria-hidden={interfaceLocked || undefined}>
        <div className="image-editor-main-toolbar" role="toolbar" aria-label="图片编辑工具">
          <ToolButton active={tool === 'select'} label="选择" onClick={() => setEditorTool('select')}><MousePointer2 size={19} /></ToolButton>
          <ToolButton active={tool === 'brush' || tool === 'eraser'} label="绘制" onClick={() => setEditorTool(tool === 'eraser' ? 'eraser' : 'brush')}><Palette size={18} /></ToolButton>
          <ToolButton active={tool === 'rectangle'} label="矩形" onClick={() => setEditorTool('rectangle')}><Square size={18} /></ToolButton>
          <ToolButton active={tool === 'arrow'} label="箭头" onClick={() => setEditorTool('arrow')}><ArrowUpRight size={19} /></ToolButton>
          <ToolButton active={tool === 'pen'} label="Pen Tool" onClick={activatePenTool}><Pencil size={18} /></ToolButton>
          <ToolButton active={tool === 'text'} label="文字" onClick={addText}><Type size={20} /></ToolButton>
          <ToolButton active={tool === 'upload'} label="上传图片" onClick={() => uploadInputRef.current?.click()}><Upload size={19} /></ToolButton>
          <span />
          {tool !== 'pen' && <ToolButton disabled={!canUndo} label="撤销" onClick={() => void undo()}><Undo2 size={18} /></ToolButton>}
          {tool !== 'pen' && <ToolButton disabled={!canRedo} label="恢复" onClick={() => void redo()}><Redo2 size={18} /></ToolButton>}
          <ToolButton label="适应画布" onClick={() => fitCanvas()}><Focus size={18} /></ToolButton>
        </div>
        <div className="image-editor-generation-footer">
          <button
            type="button"
            className="image-editor-mode-toggle"
            aria-label={generationMode === 'image' ? '图片生成模式' : '视频生成模式'}
            data-tooltip={generationMode === 'image' ? '图片生成' : '视频生成'}
            disabled={generating}
            onClick={switchGenerationMode}
          >
            {generationMode === 'image' ? <ImageIcon size={20} /> : <Video size={20} />}
          </button>
          <div className={`image-editor-prompt-row ${generationMode === 'video' ? 'is-video' : ''}`}>
            <textarea
              value={prompt}
              aria-label={generationMode === 'image' ? '图片生成提示词' : '视频生成提示词'}
              placeholder={generationMode === 'image' ? '请输入图像生成的提示词' : '请输入视频生成的提示词'}
              onChange={(event) => {
                if (historyBusyRef.current || cutoutObjectIdRef.current) return
                promptRef.current = event.target.value
                setPromptState(event.target.value)
              }}
            />
            {generationMode === 'video' && (
              <div className="image-editor-video-params" aria-label="视频生成参数">
                <button type="button" className="image-editor-video-model" aria-label="seedance-2.0 Seedance 2.0"><span className="image-editor-model-mark" aria-hidden="true">S</span><span>Seedance 2.0</span></button>
                <button type="button" aria-label="切换视频时长" onClick={cycleVideoDuration}><Clock3 size={15} /><span>{videoDuration}s</span></button>
                <button type="button" aria-label="切换视频分辨率" onClick={cycleVideoResolution}><ScanLine size={15} /><span>{videoResolution}</span></button>
              </div>
            )}
            <div className="image-editor-count" aria-label="生成数量">
              <button
                type="button"
                aria-label="减少生成数量"
                disabled={currentCount <= 1}
                onClick={() => {
                  if (generationMode === 'video') setVideoCount(1)
                  else setImageCount((current) => current === 4 ? 2 : 1)
                }}
              ><ChevronLeft size={13} /></button>
              <button
                type="button"
                className="image-editor-count-value"
                aria-label="循环生成数量"
                aria-live="polite"
                onClick={() => {
                  if (generationMode === 'video') setVideoCount((current) => current === 2 ? 1 : 2)
                  else setImageCount((current) => current === 4 ? 1 : current === 2 ? 4 : 2)
                }}
              >{currentCount}</button>
              <button
                type="button"
                aria-label="增加生成数量"
                disabled={generationMode === 'video' ? videoCount >= 2 : imageCount >= 4}
                onClick={() => {
                  if (generationMode === 'video') setVideoCount(2)
                  else setImageCount((current) => current === 1 ? 2 : 4)
                }}
              ><ChevronRight size={13} /></button>
            </div>
            <button type="button" className="image-editor-generate" disabled={!prompt.trim() || generating} onClick={() => void generateFromPrompt()}>{generating ? '生成中' : '生成'}</button>
          </div>
        </div>
      </footer>

      <input ref={uploadInputRef} type="file" accept="image/*" className="sr-only" aria-label="上传图片" tabIndex={-1} disabled={interfaceLocked} onChange={(event) => { void handleUpload(event.target.files?.[0]); event.currentTarget.value = '' }} />

      {poseGeneratorOpen && (
        <section className="image-editor-pose-overlay" role="presentation">
          <div ref={poseDialogRef} className="image-editor-pose-modal" role="dialog" aria-modal="true" aria-label="姿势生成器" onKeyDown={(event) => trapModalKeys(event, () => setPoseGeneratorOpen(false))}>
            <header><strong>姿势生成器</strong><button type="button" aria-label="关闭姿势生成器" onClick={() => setPoseGeneratorOpen(false)}><X size={16} /></button></header>
            <div
              className="image-editor-pose-stage"
              ref={poseStageRef}
              onPointerDown={beginPoseSelection}
              onPointerMove={movePoseSelection}
              onPointerUp={endPoseSelection}
              onPointerCancel={endPoseSelection}
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {poseConnections.map(([from, to]) => {
                  const start = posePoint(from)
                  const end = posePoint(to)
                  return start && end ? <line key={`${from}-${to}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={poseColor} strokeWidth="1.65" strokeLinecap="round" /> : null
                })}
              </svg>
              {posePoints.map((point) => (
                <button
                  type="button"
                  key={point.id}
                  className={`image-editor-pose-joint pose-joint-${point.id} ${selectedPosePointIds.includes(point.id) ? 'selected' : ''} ${draggedPosePoint === point.id ? 'dragging' : ''}`}
                  aria-label={`调整 ${point.id} 关节`}
                  style={{ left: `${point.x}%`, top: `${point.y}%`, background: poseColor }}
                  onPointerDown={(event) => beginPoseDrag(event, point.id)}
                  onPointerMove={movePose}
                  onPointerUp={endPoseDrag}
                  onPointerCancel={endPoseDrag}
                />
              ))}
              {poseSelectionRect && (
                <span
                  className="image-editor-pose-selection"
                  aria-hidden="true"
                  style={{
                    left: `${poseSelectionRect.left}%`,
                    top: `${poseSelectionRect.top}%`,
                    width: `${poseSelectionRect.width}%`,
                    height: `${poseSelectionRect.height}%`,
                  }}
                />
              )}
            </div>
            <div className="image-editor-pose-controls">
              <p>拖拽关节来调整姿势<br />按住 Ctrl/Cmd 点击关节可多选<br />拖动选中的关节可整体移动</p>
              <div>
                <div className="image-editor-pose-swatches" aria-label="姿势颜色">
                  {['#f13b2f', '#2315ee', '#2e8b36', '#f5f114'].map((swatch) => <button type="button" key={swatch} className={poseColor === swatch ? 'active' : ''} aria-label={`姿势颜色 ${swatch}`} style={{ background: swatch }} onClick={() => setPoseColor(swatch)} />)}
                </div>
                <button type="button" className="image-editor-pose-reset" onClick={() => { setPosePoints(structuredClone(initialPosePoints)); setSelectedPosePointIds([]) }}>重置姿势</button>
                <button type="button" className="image-editor-pose-generate" onClick={() => void generatePoseReference()}>生成姿势</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {closeDialogOpen && (
        <section className="image-editor-pose-overlay" role="presentation">
          <div ref={closeDialogRef} className="image-editor-save-dialog" role="dialog" aria-modal="true" aria-labelledby="image-editor-save-title" onKeyDown={(event) => trapModalKeys(event, () => setCloseDialogOpen(false))}>
            <h2 id="image-editor-save-title">{saveDialogPurpose === 'close' ? '有未保存的更改，需要保存后再退出吗？' : '保存画布数据'}</h2>
            <label>
              <span>保存倍率</span>
              <select aria-label="保存倍率" value={exportScale} onChange={(event) => setExportScale(Number(event.target.value))}>
                {EXPORT_SCALES.map((scale) => <option key={scale} value={scale}>{scale}x</option>)}
              </select>
            </label>
            <p>导出尺寸 <strong>{exportDimensions.width} × {exportDimensions.height}</strong></p>
            <div className="image-editor-save-actions">
              {saveDialogPurpose === 'close' ? (
                <>
                  <button type="button" className="secondary danger" disabled={saving} onClick={closeWorkspace}>直接退出</button>
                  <button type="button" className="primary" disabled={saving} onClick={() => void saveComposition(true)}>{saving ? '保存中…' : '保存并关闭'}</button>
                </>
              ) : (
                <>
                  <button type="button" className="secondary" disabled={saving} onClick={() => setCloseDialogOpen(false)}>取消</button>
                  <button type="button" className="primary" disabled={saving} onClick={() => void saveComposition(false)}>{saving ? '保存中…' : '保存'}</button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {feedback && <div role="status" aria-live="polite" style={{ position: 'fixed', zIndex: 40, left: '50%', bottom: 142, maxWidth: 'min(520px, calc(100vw - 32px))', padding: '9px 13px', borderRadius: 7, background: '#f1f2f2', color: '#1b1c1c', fontSize: 12, boxShadow: '0 6px 14px rgba(0,0,0,.3)', transform: 'translateX(-50%)' }}>{feedback}</div>}
    </section>
  )
}

export default ImageEditorWorkspace
