import type {
  CanvasDocument,
  CanvasNodeData,
  CanvasRect,
  ImageEditorComposition,
  ImageOperation,
  ImageOperationResult,
  RepaintMask,
} from './types'

export const EXPAND_STAGE_ASPECT = 16 / 10
export const EXPAND_SOURCE_RECT: CanvasRect = { x: 34, y: 34, width: 32, height: 32 }
export const IMAGE_EDITOR_NODE_SIZE = 600
export const IMAGE_EDITOR_OPEN_DELAY_MS = 200
export const IMAGE_EDITOR_GENERATION_DELAY_MS = 100

type ScheduleTimeout = (callback: () => void, delay: number) => number

export function scheduleImageEditorOpen(callback: () => void, schedule: ScheduleTimeout) {
  return schedule(callback, IMAGE_EDITOR_OPEN_DELAY_MS)
}

export function scheduleImageEditorGeneration(callback: () => void, schedule: ScheduleTimeout) {
  return schedule(callback, IMAGE_EDITOR_GENERATION_DELAY_MS)
}

export function createImageEditorNodeComposition(sourceNodeIds: string[] = []): ImageEditorComposition {
  return {
    version: 2,
    aspectRatio: 'custom',
    backgroundColor: '#ffffff',
    width: IMAGE_EDITOR_NODE_SIZE,
    height: IMAGE_EDITOR_NODE_SIZE,
    fabricJson: { version: '6.9.1', objects: [] },
    sourceNodeIds: Array.from(new Set(sourceNodeIds.filter(Boolean))),
  }
}

export function isImageEditorNode(data: CanvasNodeData) {
  return data.nodeType === 'image' && data.imageOperation?.operation === 'image-editor'
}

export function recoverImageEditorGenerationFailure(
  canvas: CanvasDocument,
  nodeIds: ReadonlySet<string>,
  taskIds: ReadonlySet<string>,
): CanvasDocument {
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) => nodeIds.has(node.id)
      ? {
          ...node,
          data: {
            ...node.data,
            status: 'ready',
            progress: 0,
            content: '',
            error: undefined,
          },
        }
      : node),
    tasks: canvas.tasks.filter((task) => !taskIds.has(task.id)),
  }
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum)

export function rectContains(outer: CanvasRect, inner: CanvasRect) {
  return outer.x <= inner.x
    && outer.y <= inner.y
    && outer.x + outer.width >= inner.x + inner.width
    && outer.y + outer.height >= inner.y + inner.height
}

export function frameForExpandRatio(value: string, source = EXPAND_SOURCE_RECT): CanvasRect {
  if (value === '自由比例') return { x: 20, y: 18, width: 60, height: 64 }
  const match = value.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/)
  const physicalRatio = match ? Number(match[1]) / Number(match[2]) : EXPAND_STAGE_ASPECT
  const percentRatio = physicalRatio / EXPAND_STAGE_ASPECT
  let height = Math.max(source.height * 1.35, source.width * 1.35 / percentRatio)
  let width = height * percentRatio
  if (width > 92) {
    width = 92
    height = width / percentRatio
  }
  if (height > 92) {
    height = 92
    width = height * percentRatio
  }
  width = Math.max(width, source.width)
  height = Math.max(height, source.height)
  return { x: (100 - width) / 2, y: (100 - height) / 2, width, height }
}

export function moveExpandRect(frame: CanvasRect, dx: number, dy: number, source = EXPAND_SOURCE_RECT): CanvasRect {
  const minimumX = Math.max(0, source.x + source.width - frame.width)
  const maximumX = Math.min(source.x, 100 - frame.width)
  const minimumY = Math.max(0, source.y + source.height - frame.height)
  const maximumY = Math.min(source.y, 100 - frame.height)
  return {
    ...frame,
    x: clamp(frame.x + dx, minimumX, maximumX),
    y: clamp(frame.y + dy, minimumY, maximumY),
  }
}

export function resizeExpandRect(frame: CanvasRect, handle: string, dx: number, dy: number, source = EXPAND_SOURCE_RECT): CanvasRect {
  let left = frame.x
  let top = frame.y
  let right = frame.x + frame.width
  let bottom = frame.y + frame.height
  if (handle.includes('w')) left = clamp(left + dx, 0, Math.min(source.x, right - 18))
  if (handle.includes('e')) right = clamp(right + dx, Math.max(source.x + source.width, left + 18), 100)
  if (handle.includes('n')) top = clamp(top + dy, 0, Math.min(source.y, bottom - 18))
  if (handle.includes('s')) bottom = clamp(bottom + dy, Math.max(source.y + source.height, top + 18), 100)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function expandRectRatio(frame: CanvasRect) {
  return (frame.width * EXPAND_STAGE_ASPECT) / frame.height
}

export interface GridSliceDescriptor {
  index: number
  column: number
  row: number
  title: string
  backgroundSize: string
  backgroundPosition: string
}

export function buildGridSlices(columns: number, rows: number): GridSliceDescriptor[] {
  const safeColumns = clamp(Math.round(columns), 1, 8)
  const safeRows = clamp(Math.round(rows), 1, 8)
  return Array.from({ length: safeColumns * safeRows }, (_, index) => {
    const column = index % safeColumns
    const row = Math.floor(index / safeColumns)
    const x = safeColumns === 1 ? 50 : column / (safeColumns - 1) * 100
    const y = safeRows === 1 ? 50 : row / (safeRows - 1) * 100
    return {
      index,
      column,
      row,
      title: `${row + 1}-${column + 1}`,
      backgroundSize: `${safeColumns * 100}% ${safeRows * 100}%`,
      backgroundPosition: `${x}% ${y}%`,
    }
  })
}

export function gridSlicePosition(base: { x: number; y: number }, column: number, row: number) {
  return { x: base.x + column * 390, y: base.y + row * 280 }
}

export function buildPendingUpscaleData(source: CanvasNodeData): CanvasNodeData {
  return {
    ...structuredClone(source),
    title: `${source.title} · 图片高清`,
    sourceKind: 'generated',
    status: 'ready',
    content: '',
    progress: 0,
    favorite: false,
    references: [],
    imageOperation: { operation: 'upscale', resolution: '4K' },
  }
}

export function completeUpscaleData(pending: CanvasNodeData, source: CanvasNodeData, resolution: '2K' | '4K' | '6K'): CanvasNodeData {
  return {
    ...structuredClone(pending),
    content: source.content,
    mediaVariant: source.mediaVariant,
    status: 'success',
    progress: 100,
    imageOperation: { ...(pending.imageOperation ?? { operation: 'upscale' }), operation: 'upscale', resolution },
  }
}

export type PendingImageEditorOperation = Extract<ImageOperation, 'rotate' | 'edit-text'>

const pendingEditorTitle: Record<PendingImageEditorOperation, string> = {
  rotate: '旋转',
  'edit-text': '编辑文字',
}

export function editableTextLayersForImage(source: CanvasNodeData) {
  return (source.detectedTextLayers ?? []).map((layer) => layer.trim()).filter(Boolean)
}

export function isQuarterTurn(angle = 0) {
  return Math.abs(Math.round(angle / 90)) % 2 === 1
}

export function shouldShowImageGenerationPrompt(data: CanvasNodeData) {
  if (data.nodeType !== 'image') return false
  if (data.sourceKind === 'created') return true
  if (data.sourceKind !== 'generated') return false
  return !data.imageOperation || data.imageOperation.operation === 'prompt-regenerate'
}

export function buildRepaintResult(
  masks: RepaintMask[],
  brushMode: 'smart' | 'brush' | 'eraser',
  brushSize: number,
  prompt: string,
): ImageOperationResult {
  return {
    operation: 'repaint',
    brushMode,
    brushSize,
    masks: structuredClone(masks),
    prompt: prompt.trim(),
  }
}

export function buildPendingImageEditorData(source: CanvasNodeData, operation: PendingImageEditorOperation): CanvasNodeData {
  const imageOperation: ImageOperationResult = operation === 'rotate'
    ? { operation, angle: 0, flipHorizontal: false, flipVertical: false }
    : { operation, textLayers: editableTextLayersForImage(source) }

  return {
    ...structuredClone(source),
    title: `${source.title} · ${pendingEditorTitle[operation]}`,
    sourceKind: 'generated',
    status: 'ready',
    favorite: false,
    references: [],
    imageOperation,
  }
}

export function completePendingImageEditorData(
  pending: CanvasNodeData,
  patch: Partial<ImageOperationResult> = {},
): CanvasNodeData {
  const imageOperation: ImageOperationResult = {
    ...structuredClone(pending.imageOperation ?? { operation: 'rotate' as const }),
    ...patch,
  }
  return {
    ...structuredClone(pending),
    status: 'success',
    progress: 100,
    detectedTextLayers: imageOperation.operation === 'edit-text' ? imageOperation.textLayers : pending.detectedTextLayers,
    imageOperation,
  }
}
