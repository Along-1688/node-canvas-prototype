import type { CanvasNodeData, MediaMetadata } from './types'

type ImageMediaVariant = Extract<CanvasNodeData['mediaVariant'], 'dog' | 'anime' | 'ip' | 'poster'>

const imageMediaCatalog: Record<ImageMediaVariant, MediaMetadata> = {
  anime: { url: '/assets/generated-anime.png', mimeType: 'image/png', width: 1088, height: 608 },
  dog: { url: '/assets/asset-dog.png', mimeType: 'image/png', width: 1280, height: 720 },
  poster: { url: '/assets/text-poster.png', mimeType: 'image/png', width: 1280, height: 720 },
  ip: { url: '/assets/virtual-ip-portrait.jpg', mimeType: 'image/jpeg', width: 852, height: 1280 },
}

export const HOST_VIDEO_MEDIA: MediaMetadata = {
  url: '/assets/virtual-ip-host-video.mp4',
  posterUrl: '/assets/virtual-ip-host-video-poster.jpg',
  mimeType: 'video/mp4',
  width: 1248,
  height: 1664,
  duration: 8.055,
  hasAudio: true,
  timelineFrameUrls: Array.from({ length: 5 }, (_, index) => `/assets/virtual-ip-host-video-timeline-${String(index + 1).padStart(2, '0')}.jpg`),
}

export const LANDSCAPE_VIDEO_MEDIA: MediaMetadata = {
  url: '/assets/demo-landscape-video.mp4',
  posterUrl: '/assets/demo-landscape-video-poster.jpg',
  mimeType: 'video/mp4',
  width: 1280,
  height: 720,
  duration: 8.042,
  hasAudio: true,
  timelineFrameUrls: Array.from({ length: 5 }, (_, index) => `/assets/demo-landscape-video-timeline-${String(index + 1).padStart(2, '0')}.jpg`),
}

export function cloneMediaMetadata(media: MediaMetadata): MediaMetadata {
  return {
    ...media,
    timelineFrameUrls: media.timelineFrameUrls ? [...media.timelineFrameUrls] : undefined,
  }
}

export function imageMediaForVariant(variant: CanvasNodeData['mediaVariant']): MediaMetadata | undefined {
  if (variant !== 'dog' && variant !== 'anime' && variant !== 'ip' && variant !== 'poster') return undefined
  return cloneMediaMetadata(imageMediaCatalog[variant])
}
