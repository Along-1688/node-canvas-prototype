import type { CanvasDocument } from './types'
import { attachCanvasEdgesToBorders } from './domain'

export interface SharedCanvasSnapshot {
  token: string
  canvas: CanvasDocument
  createdAt: number
}

export type SharedCanvasLoadResult =
  | { status: 'ready'; snapshot: SharedCanvasSnapshot }
  | { status: 'missing' | 'invalid' }

const CANVAS_SHARE_PREFIX = 'node-canvas-share:'
const INLINE_SNAPSHOT_PARAM = 'snapshot'

function stableToken(value: string) {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0).toString(36).padStart(7, '0')
}

export function createCanvasShareSnapshot(canvas: CanvasDocument, now = Date.now()): SharedCanvasSnapshot {
  const snapshotCanvas = structuredClone(canvas)
  snapshotCanvas.edges = attachCanvasEdgesToBorders(snapshotCanvas.edges)
  return {
    token: stableToken(`${canvas.id}:${canvas.name}:${now}`),
    canvas: snapshotCanvas,
    createdAt: now,
  }
}

export function saveCanvasShareSnapshot(storage: Storage, snapshot: SharedCanvasSnapshot) {
  storage.setItem(`${CANVAS_SHARE_PREFIX}${snapshot.token}`, JSON.stringify(snapshot))
}

export function canvasShareTokenFromHash(hash: string) {
  return hash.match(/^#?share\/canvas\/([a-z0-9]+)(?:\?.*)?$/i)?.[1]
}

function encodeSnapshot(snapshot: SharedCanvasSnapshot) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot))
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeSnapshot(payload: string) {
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes)) as SharedCanvasSnapshot
}

function isValidSnapshot(snapshot: SharedCanvasSnapshot, token: string) {
  return snapshot.token === token
    && Boolean(snapshot.canvas?.id)
    && Array.isArray(snapshot.canvas.nodes)
    && Array.isArray(snapshot.canvas.edges)
}

function normalizeSnapshot(snapshot: SharedCanvasSnapshot) {
  const edges = attachCanvasEdgesToBorders(snapshot.canvas.edges)
  return edges === snapshot.canvas.edges ? snapshot : { ...snapshot, canvas: { ...snapshot.canvas, edges } }
}

function inlineSnapshotFromHash(hash: string) {
  const queryIndex = hash.indexOf('?')
  if (queryIndex < 0) return null
  return new URLSearchParams(hash.slice(queryIndex + 1)).get(INLINE_SNAPSHOT_PARAM)
}

export function canvasShareUrl(currentHref: string, snapshotOrToken: SharedCanvasSnapshot | string) {
  const url = new URL(currentHref)
  url.searchParams.delete('canvasSnapshot')
  const token = typeof snapshotOrToken === 'string' ? snapshotOrToken : snapshotOrToken.token
  url.hash = `share/canvas/${token}`
  return url.toString()
}

function copyCanvasShareLinkLegacy(link: string) {
  const field = document.createElement('textarea')
  field.value = link
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } finally {
    field.remove()
  }
  return copied
}

export async function copyCanvasShareLink(link: string) {
  // Keep a synchronous fallback inside the click gesture for restricted browsers.
  const legacyCopied = copyCanvasShareLinkLegacy(link)
  try {
    if (!navigator.clipboard?.writeText) {
      if (!legacyCopied) throw new Error('Clipboard API unavailable')
      return
    }
    await navigator.clipboard.writeText(link)
  } catch (error) {
    if (!legacyCopied) throw error
  }
}

export function loadCanvasShareSnapshot(storage: Storage, hash: string): SharedCanvasLoadResult {
  const token = canvasShareTokenFromHash(hash)
  if (!token) return { status: 'missing' }
  const inlinePayload = inlineSnapshotFromHash(hash)
  if (inlinePayload) {
    try {
      const snapshot = decodeSnapshot(inlinePayload)
      return isValidSnapshot(snapshot, token) ? { status: 'ready', snapshot: normalizeSnapshot(snapshot) } : { status: 'invalid' }
    } catch {
      return { status: 'invalid' }
    }
  }
  const raw = storage.getItem(`${CANVAS_SHARE_PREFIX}${token}`)
  if (!raw) return { status: 'missing' }
  try {
    const snapshot = JSON.parse(raw) as SharedCanvasSnapshot
    return isValidSnapshot(snapshot, token) ? { status: 'ready', snapshot: normalizeSnapshot(snapshot) } : { status: 'invalid' }
  } catch {
    return { status: 'invalid' }
  }
}
