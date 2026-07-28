export interface ImageEditorPoint {
  x: number
  y: number
}

export interface ImageEditorSourceObject {
  sourceNodeId?: unknown
}

export interface ImageEditorLinkedEdge {
  target: string
  data?: {
    relationType?: unknown
  }
}

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/** Scale an image uniformly so the whole image remains inside the canvas. */
export function containScale(
  imageWidth: number,
  imageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  fraction = 1,
): number {
  const safeImageWidth = positiveFinite(imageWidth, 1)
  const safeImageHeight = positiveFinite(imageHeight, 1)
  const safeCanvasWidth = positiveFinite(canvasWidth, 1)
  const safeCanvasHeight = positiveFinite(canvasHeight, 1)
  const safeFraction = Number.isFinite(fraction) && fraction >= 0 ? fraction : 1

  return Math.min(
    safeCanvasWidth / safeImageWidth,
    safeCanvasHeight / safeImageHeight,
  ) * safeFraction
}

/** Compute TapNow's viewport fit zoom: occupy a fraction of the available area. */
export function fitZoom(
  canvasWidth: number,
  canvasHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  ratio = 0.6,
  min = 0.1,
  max = 5,
): number {
  const safeCanvasWidth = positiveFinite(canvasWidth, 1)
  const safeCanvasHeight = positiveFinite(canvasHeight, 1)
  const safeViewportWidth = positiveFinite(viewportWidth, 1)
  const safeViewportHeight = positiveFinite(viewportHeight, 1)
  const safeRatio = Number.isFinite(ratio) && ratio >= 0 ? ratio : 0.6
  const lowerBound = positiveFinite(Math.min(min, max), 0.1)
  const upperBound = Math.max(lowerBound, positiveFinite(Math.max(min, max), 5))
  const fitted = Math.min(
    safeViewportWidth / safeCanvasWidth,
    safeViewportHeight / safeCanvasHeight,
  ) * safeRatio

  return Math.min(upperBound, Math.max(lowerBound, fitted))
}

/** Ignore short pointer gestures so clicks do not create rectangles or arrows. */
export function isMeaningfulDraw(
  start: ImageEditorPoint,
  end: ImageEditorPoint,
  minDistance = 8,
): boolean {
  const threshold = Number.isFinite(minDistance) ? Math.max(0, minDistance) : 8
  return Math.hypot(end.x - start.x, end.y - start.y) >= threshold
}

/** Convert logical canvas dimensions into integer export pixel dimensions. */
export function scaledExportDimensions(
  width: number,
  height: number,
  scale: number,
): { width: number; height: number } {
  const safeWidth = Number.isFinite(width) ? width : 0
  const safeHeight = Number.isFinite(height) ? height : 0
  const safeScale = Number.isFinite(scale) ? scale : 0

  return {
    width: Math.max(1, Math.round(safeWidth * safeScale)),
    height: Math.max(1, Math.round(safeHeight * safeScale)),
  }
}

/** Collect lineage from objects that still exist on the canvas. */
export function collectCurrentSourceNodeIds(
  objects: readonly ImageEditorSourceObject[],
  outputNodeId?: string | null,
): string[] {
  const excludedId = outputNodeId?.trim()
  const sourceNodeIds = new Set<string>()

  for (const object of objects) {
    if (typeof object.sourceNodeId !== 'string') continue
    const sourceNodeId = object.sourceNodeId.trim()
    if (!sourceNodeId || sourceNodeId === excludedId) continue
    sourceNodeIds.add(sourceNodeId)
  }

  return [...sourceNodeIds]
}

/**
 * Keep a saved editor result visually independent while preserving its
 * internal source lineage. This also migrates links created by older saves.
 */
export function detachImageEditorResultEdges<T extends ImageEditorLinkedEdge>(
  edges: readonly T[],
  outputNodeId: string,
): T[] {
  return edges.filter((edge) => !(
    edge.target === outputNodeId
    && edge.data?.relationType === 'image-operation'
  ))
}

/** Convert Fabric's bottom-to-top object stack into PSD's top-to-bottom order. */
export function orderPsdLayers<T>(
  canvasLayers: readonly T[],
  backgroundLayer: T,
): T[] {
  return [...canvasLayers].reverse().concat(backgroundLayer)
}
