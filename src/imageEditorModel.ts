import type {
  ImageEditorAspectRatio,
  ImageEditorAsset,
  ImageEditorComposition,
  ImageEditorLayer,
} from './types'

export interface ImageEditorDimensions {
  width: number
  height: number
}

export const IMAGE_EDITOR_DIMENSIONS: Readonly<Record<ImageEditorAspectRatio, Readonly<ImageEditorDimensions>>> = {
  custom: { width: 1000, height: 1000 },
  '1:1': { width: 1000, height: 1000 },
  '16:9': { width: 800, height: 450 },
  '9:16': { width: 450, height: 800 },
  '4:3': { width: 800, height: 600 },
  '3:4': { width: 600, height: 800 },
  '3:2': { width: 800, height: 600 },
  '2:3': { width: 600, height: 800 },
  '7:4': { width: 800, height: 600 },
  '4:7': { width: 600, height: 800 },
  '21:9': { width: 700, height: 300 },
}

export const IMAGE_EDITOR_ASPECT_RATIOS = Object.keys(IMAGE_EDITOR_DIMENSIONS) as ImageEditorAspectRatio[]

const IMAGE_EDITOR_ASPECT_RATIO_SET = new Set<string>(IMAGE_EDITOR_ASPECT_RATIOS)
const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g
const TRAILING_FILENAME_CHARACTERS = /[. ]+$/g
const WINDOWS_RESERVED_FILENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

type LegacyImageEditorComposition = Partial<Omit<ImageEditorComposition, 'version'>> & {
  version?: number
  aspectRatio?: unknown
  backgroundColor?: unknown
  width?: unknown
  height?: unknown
  fabricJson?: unknown
  sourceNodeIds?: unknown
  renderedDataUrl?: unknown
  prompt?: unknown
  updatedAt?: unknown
  layers?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function optionalNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function emptyFabricJson(): Record<string, unknown> {
  return { version: '6.9.1', objects: [] }
}

function cloneFabricJson(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return emptyFabricJson()
  const cloned = structuredClone(value)
  if (!Array.isArray(cloned.objects)) cloned.objects = []
  return cloned
}

function normalizeAspectRatio(value: unknown): ImageEditorAspectRatio {
  return typeof value === 'string' && IMAGE_EDITOR_ASPECT_RATIO_SET.has(value)
    ? value as ImageEditorAspectRatio
    : 'custom'
}

function normalizeLegacyLayers(value: unknown): ImageEditorLayer[] | undefined {
  return Array.isArray(value) ? structuredClone(value) as ImageEditorLayer[] : undefined
}

export function imageEditorDimensions(aspectRatio: ImageEditorAspectRatio): ImageEditorDimensions {
  return { ...IMAGE_EDITOR_DIMENSIONS[aspectRatio] }
}

export function imageEditorAspectRatioValue(aspectRatio: ImageEditorAspectRatio): number {
  const { width, height } = IMAGE_EDITOR_DIMENSIONS[aspectRatio]
  return width / height
}

export const ratioValue = imageEditorAspectRatioValue

export function compositionAspectRatio(composition: Pick<ImageEditorComposition, 'aspectRatio' | 'width' | 'height'>): number {
  if (isPositiveFiniteNumber(composition.width) && isPositiveFiniteNumber(composition.height)) {
    return composition.width / composition.height
  }
  return imageEditorAspectRatioValue(composition.aspectRatio)
}

export const compositionAspectRatioValue = compositionAspectRatio

export function mergeImageEditorSourceNodeIds(...groups: ReadonlyArray<ReadonlyArray<string | null | undefined>>): string[] {
  const sourceNodeIds = new Set<string>()
  for (const group of groups) {
    for (const sourceNodeId of group) {
      const normalized = sourceNodeId?.trim()
      if (normalized) sourceNodeIds.add(normalized)
    }
  }
  return [...sourceNodeIds]
}

export function assetSourceNodeIds(assets: ImageEditorAsset | readonly ImageEditorAsset[] | null | undefined): string[] {
  const assetList = Array.isArray(assets) ? assets : assets ? [assets] : []
  return mergeImageEditorSourceNodeIds(assetList.map((asset) => asset.sourceNodeId))
}

export function compositionSourceNodeIds(composition: unknown): string[] {
  if (!isRecord(composition)) return []
  const declaredSourceNodeIds = Array.isArray(composition.sourceNodeIds)
    ? composition.sourceNodeIds.filter((value): value is string => typeof value === 'string')
    : []
  const legacyLayerSourceNodeIds = Array.isArray(composition.layers)
    ? composition.layers.flatMap((layer) => isRecord(layer) && typeof layer.sourceNodeId === 'string' ? [layer.sourceNodeId] : [])
    : []
  return mergeImageEditorSourceNodeIds(declaredSourceNodeIds, legacyLayerSourceNodeIds)
}

export function createImageEditorComposition(source?: ImageEditorAsset): ImageEditorComposition {
  const { width, height } = imageEditorDimensions('custom')
  return {
    version: 2,
    aspectRatio: 'custom',
    backgroundColor: '#ffffff',
    width,
    height,
    fabricJson: emptyFabricJson(),
    sourceNodeIds: assetSourceNodeIds(source),
  }
}

export function normalizeImageEditorComposition(
  composition: unknown,
  source?: ImageEditorAsset,
): ImageEditorComposition {
  if (!isRecord(composition)) return createImageEditorComposition(source)

  const legacy = composition as LegacyImageEditorComposition
  const aspectRatio = normalizeAspectRatio(legacy.aspectRatio)
  const dimensions = imageEditorDimensions(aspectRatio)
  const layers = normalizeLegacyLayers(legacy.layers)
  const normalized: ImageEditorComposition = {
    version: 2,
    aspectRatio,
    backgroundColor: optionalNonEmptyString(legacy.backgroundColor) ?? '#ffffff',
    width: isPositiveFiniteNumber(legacy.width) ? Math.round(legacy.width) : dimensions.width,
    height: isPositiveFiniteNumber(legacy.height) ? Math.round(legacy.height) : dimensions.height,
    fabricJson: cloneFabricJson(legacy.fabricJson),
    sourceNodeIds: mergeImageEditorSourceNodeIds(
      compositionSourceNodeIds(legacy),
      assetSourceNodeIds(source),
    ),
  }

  const renderedDataUrl = optionalNonEmptyString(legacy.renderedDataUrl)
  const prompt = optionalNonEmptyString(legacy.prompt)
  const updatedAt = optionalNonEmptyString(legacy.updatedAt)
  if (renderedDataUrl) normalized.renderedDataUrl = renderedDataUrl
  if (prompt) normalized.prompt = prompt
  if (updatedAt) normalized.updatedAt = updatedAt
  if (layers) normalized.layers = layers

  return normalized
}

export function migrateImageEditorComposition(
  composition: unknown,
  source?: ImageEditorAsset,
): ImageEditorComposition {
  return normalizeImageEditorComposition(composition, source)
}

export function sanitizeImageEditorFilename(filename: string, fallback = 'image-editor'): string {
  const normalizedFallback = fallback.normalize('NFKC').replace(INVALID_FILENAME_CHARACTERS, '-').trim() || 'image-editor'
  let safeFilename = filename
    .normalize('NFKC')
    .replace(INVALID_FILENAME_CHARACTERS, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(TRAILING_FILENAME_CHARACTERS, '')

  if (!safeFilename) safeFilename = normalizedFallback
  if (WINDOWS_RESERVED_FILENAME.test(safeFilename)) safeFilename = `_${safeFilename}`
  return Array.from(safeFilename).slice(0, 120).join('').replace(TRAILING_FILENAME_CHARACTERS, '') || normalizedFallback
}

export const sanitizeImageEditorFileName = sanitizeImageEditorFilename

export function imageEditorExportFilename(title: string, extension: 'png' | 'jpg' | 'psd' = 'png'): string {
  const basename = sanitizeImageEditorFilename(title).replace(/\.(png|jpe?g|psd)$/i, '')
  return `${basename}.${extension}`
}
