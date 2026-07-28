import type { MediaMetadata } from './types'

export type VideoShareExpiry = '7' | '30' | 'never'

export interface SharedVideoSnapshot {
  token: string
  canvasId: string
  videoId: string
  title: string
  media: MediaMetadata
  allowDownload: boolean
  createdAt: number
  expiresAt?: number
}

export type SharedVideoLoadResult =
  | { status: 'ready'; snapshot: SharedVideoSnapshot }
  | { status: 'missing' | 'expired' | 'invalid' }

const VIDEO_SHARE_PREFIX = 'mango-video-share:'

export function stableShareToken(value: string) {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0).toString(36).padStart(7, '0')
}

export function createVideoShareSnapshot(input: {
  canvasId: string
  videoId: string
  title: string
  media: MediaMetadata
  expires: VideoShareExpiry
  allowDownload: boolean
  now?: number
}): SharedVideoSnapshot {
  const now = input.now ?? Date.now()
  const token = stableShareToken(`${input.canvasId}:${input.videoId}:${input.expires}:${input.allowDownload}:${now}`)
  const expiresAt = input.expires === 'never' ? undefined : now + Number(input.expires) * 24 * 60 * 60 * 1000
  return {
    token,
    canvasId: input.canvasId,
    videoId: input.videoId,
    title: input.title,
    media: structuredClone(input.media),
    allowDownload: input.allowDownload,
    createdAt: now,
    expiresAt,
  }
}

export function saveVideoShareSnapshot(storage: Storage, snapshot: SharedVideoSnapshot) {
  storage.setItem(`${VIDEO_SHARE_PREFIX}${snapshot.token}`, JSON.stringify(snapshot))
}

export function shareTokenFromHash(hash: string) {
  const match = hash.match(/^#?share\/video\/([a-z0-9]+)$/i)
  return match?.[1]
}

export function loadVideoShareSnapshot(storage: Storage, hash: string, now = Date.now()): SharedVideoLoadResult {
  const token = shareTokenFromHash(hash)
  if (!token) return { status: 'missing' }
  const raw = storage.getItem(`${VIDEO_SHARE_PREFIX}${token}`)
  if (!raw) return { status: 'missing' }
  try {
    const snapshot = JSON.parse(raw) as SharedVideoSnapshot
    if (snapshot.token !== token || !snapshot.title || !snapshot.media?.url) return { status: 'invalid' }
    if (snapshot.expiresAt && snapshot.expiresAt <= now) {
      storage.removeItem(`${VIDEO_SHARE_PREFIX}${token}`)
      return { status: 'expired' }
    }
    return { status: 'ready', snapshot }
  } catch {
    return { status: 'invalid' }
  }
}
