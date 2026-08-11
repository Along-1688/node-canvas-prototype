import { cloneMediaMetadata, HOST_VIDEO_MEDIA, imageMediaForVariant, LANDSCAPE_VIDEO_MEDIA } from './mediaMetadata'
import type { CanvasNodeData, MediaGenerationResult, MediaMetadata } from './types'

const imageCandidateUrls = [
  '/node-canvas-prototype/assets/generated-anime.png',
  '/node-canvas-prototype/assets/starter/image-background.jpg',
  '/node-canvas-prototype/assets/starter/first-frame-video.jpg',
  '/node-canvas-prototype/assets/starter/audio-to-video.jpg',
] as const

function cloneResult(result: MediaGenerationResult): MediaGenerationResult {
  return {
    ...result,
    media: cloneMediaMetadata(result.media),
  }
}

export function primaryResultSlotIndex(count: number) {
  return count >= 3 ? 2 : 0
}

export function arrangeGenerationResults(
  results: MediaGenerationResult[],
  primaryResultId: string,
): MediaGenerationResult[] {
  const next = results.map(cloneResult)
  const currentIndex = next.findIndex((result) => result.id === primaryResultId)
  if (currentIndex < 0) return next
  const slotIndex = primaryResultSlotIndex(next.length)
  if (currentIndex === slotIndex) return next
  const displaced = next[slotIndex]
  next[slotIndex] = next[currentIndex]
  next[currentIndex] = displaced
  return next
}

export function generationResultsFor(data: CanvasNodeData) {
  return (data.generationResults ?? []).map(cloneResult)
}

export function primaryGenerationResult(data: CanvasNodeData) {
  const results = data.generationResults ?? []
  return results.find((result) => result.id === data.primaryGenerationResultId) ?? results[0]
}

export function attachGenerationResults(
  data: CanvasNodeData,
  results: MediaGenerationResult[],
  primaryResultId = results[0]?.id,
): CanvasNodeData {
  if (!results.length || !primaryResultId) {
    return { ...data, generationResults: undefined, primaryGenerationResultId: undefined }
  }
  const arranged = arrangeGenerationResults(results, primaryResultId)
  const primary = arranged.find((result) => result.id === primaryResultId) ?? arranged[0]
  return {
    ...data,
    content: primary.content,
    media: cloneMediaMetadata(primary.media),
    mediaVariant: primary.mediaVariant,
    favorite: primary.favorite ?? (primary.id === data.primaryGenerationResultId ? data.favorite : false),
    generationResults: arranged.length > 1 ? arranged : undefined,
    primaryGenerationResultId: arranged.length > 1 ? primary.id : undefined,
  }
}

export function setPrimaryGenerationResult(data: CanvasNodeData, resultId: string): CanvasNodeData {
  const results = data.generationResults ?? []
  if (results.length < 2 || resultId === data.primaryGenerationResultId) return data
  const selected = results.find((result) => result.id === resultId)
  if (!selected) return data
  return attachGenerationResults(data, results, selected.id)
}

export function setGenerationResultFavorite(
  data: CanvasNodeData,
  resultId: string,
  favorite: boolean,
): CanvasNodeData {
  const results = data.generationResults ?? []
  const result = results.find((candidate) => candidate.id === resultId)
  if (!result || Boolean(result.favorite) === favorite) return data
  const generationResults = results.map((candidate) => candidate.id === resultId
    ? { ...cloneResult(candidate), favorite }
    : cloneResult(candidate))
  return {
    ...data,
    generationResults,
    favorite: resultId === data.primaryGenerationResultId ? favorite : data.favorite,
  }
}

export function buildImageGenerationResults(
  count: number,
  batchId: string,
  content = '根据 Prompt 生成的图片结果',
): MediaGenerationResult[] {
  const safeCount = Math.min(4, Math.max(1, Math.round(count)))
  const fallback = imageMediaForVariant('anime')!
  return Array.from({ length: safeCount }, (_, index) => ({
    id: `image-result-${batchId}-${index + 1}`,
    content: `${content} · 方案 ${index + 1}`,
    media: {
      ...cloneMediaMetadata(fallback),
      url: imageCandidateUrls[index],
      mimeType: index === 0 ? 'image/png' : 'image/jpeg',
      width: 1280,
      height: 720,
    },
    favorite: false,
  }))
}

function videoCandidateMedia(index: number, primaryMedia: MediaMetadata) {
  if (index === 0) return cloneMediaMetadata(primaryMedia)
  if (index === 1) return cloneMediaMetadata(LANDSCAPE_VIDEO_MEDIA)
  if (index === 2) return {
    ...cloneMediaMetadata(primaryMedia),
    posterUrl: '/node-canvas-prototype/assets/starter/audio-to-video.jpg',
  }
  return {
    ...cloneMediaMetadata(HOST_VIDEO_MEDIA),
    posterUrl: '/node-canvas-prototype/assets/starter/first-frame-video.jpg',
  }
}

export function buildVideoGenerationResults(
  count: number,
  batchId: string,
  primaryMedia: MediaMetadata = HOST_VIDEO_MEDIA,
  content = '生成的视频结果',
): MediaGenerationResult[] {
  const safeCount = Math.min(4, Math.max(1, Math.round(count)))
  return Array.from({ length: safeCount }, (_, index) => ({
    id: `video-result-${batchId}-${index + 1}`,
    content: `${content} · 方案 ${index + 1}`,
    media: videoCandidateMedia(index, primaryMedia),
    favorite: false,
  }))
}
