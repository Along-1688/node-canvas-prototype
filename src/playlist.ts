import type { CanvasFlowNode, CanvasPlaylist, CanvasPlaylistClip, PlaylistComposition } from './types'
import { nodeDimensions } from './grouping'

export const PLAYLIST_WIDTH = 720
export const PLAYLIST_MIN_WIDTH = 400
export const PLAYLIST_MAX_WIDTH = 1040
export const PLAYLIST_EMPTY_HEIGHT = 104
const PLAYLIST_PREVIEW_GAP = 8
const PLAYLIST_PREVIEW_ASPECT_RATIO = 16 / 9
export const PLAYLIST_FILLED_HEIGHT = PLAYLIST_EMPTY_HEIGHT + PLAYLIST_PREVIEW_GAP + PLAYLIST_WIDTH / PLAYLIST_PREVIEW_ASPECT_RATIO
const PLAYLIST_TOOLS_WIDTH = 44
const PLAYLIST_TIMELINE_PADDING = 10
const PLAYLIST_TIMELINE_GAP = 8
const PLAYLIST_CLIP_GAP = 4
const MIN_DROP_OVERLAP = 16
const PLAYLIST_PLACEMENT_GAP = 24

export function clampPlaylistWidth(width: number) {
  return Math.min(PLAYLIST_MAX_WIDTH, Math.max(PLAYLIST_MIN_WIDTH, Math.round(width)))
}

export function playlistWidth(playlist: CanvasPlaylist) {
  return clampPlaylistWidth(playlist.width ?? PLAYLIST_WIDTH)
}

export function playlistExpandedHeight(playlist: CanvasPlaylist) {
  return PLAYLIST_EMPTY_HEIGHT + PLAYLIST_PREVIEW_GAP + playlistWidth(playlist) / PLAYLIST_PREVIEW_ASPECT_RATIO
}

export function findAvailablePlaylistPosition(base: { x: number; y: number }, playlists: CanvasPlaylist[]) {
  const overlapsTimeline = (position: { x: number; y: number }) => playlists.some((playlist) => {
    const separatedHorizontally = position.x + PLAYLIST_WIDTH + PLAYLIST_PLACEMENT_GAP <= playlist.position.x
      || playlist.position.x + playlistWidth(playlist) + PLAYLIST_PLACEMENT_GAP <= position.x
    const separatedVertically = position.y + PLAYLIST_EMPTY_HEIGHT + PLAYLIST_PLACEMENT_GAP <= playlist.position.y
      || playlist.position.y + PLAYLIST_EMPTY_HEIGHT + PLAYLIST_PLACEMENT_GAP <= position.y
    return !separatedHorizontally && !separatedVertically
  })
  if (!overlapsTimeline(base)) return base

  const verticalStep = PLAYLIST_EMPTY_HEIGHT + PLAYLIST_PLACEMENT_GAP
  for (let offset = 1; offset <= playlists.length + 1; offset += 1) {
    const below = { x: base.x, y: base.y + verticalStep * offset }
    if (!overlapsTimeline(below)) return below
    const above = { x: base.x, y: base.y - verticalStep * offset }
    if (!overlapsTimeline(above)) return above
  }

  return { x: base.x + PLAYLIST_WIDTH + PLAYLIST_PLACEMENT_GAP, y: base.y }
}

let clipIdSequence = 0

function clipId(nodeId: string) {
  clipIdSequence += 1
  return `clip-${nodeId}-${Date.now()}-${clipIdSequence.toString(36)}`
}

export function isPlayablePlaylistVideo(node: CanvasFlowNode | undefined): node is CanvasFlowNode {
  return node?.data.nodeType === 'video' && node.data.status === 'success' && Boolean(node.data.media?.url)
}

export function playlistClipDuration(clip: CanvasPlaylistClip, node: CanvasFlowNode | undefined, fallback = 8) {
  const mediaDuration = node?.data.media?.duration ?? node?.data.duration ?? fallback
  return Math.max(0.1, (clip.outPoint ?? mediaDuration) - clip.inPoint)
}

export function playlistClipWidth(duration: number) {
  return Math.min(176, Math.max(72, duration * 13))
}

export function addPlaylistClip(playlist: CanvasPlaylist, nodeId: string, insertionIndex = playlist.clips.length): CanvasPlaylist {
  const clip: CanvasPlaylistClip = { id: clipId(nodeId), nodeId, inPoint: 0 }
  const clips = [...playlist.clips]
  clips.splice(Math.min(Math.max(Math.trunc(insertionIndex), 0), clips.length), 0, clip)
  return { ...playlist, clips, activeClipId: clip.id, playheadTime: undefined }
}

/** @deprecated Use addPlaylistClip; retained for earlier callers. */
export function togglePlaylistClip(playlist: CanvasPlaylist, nodeId: string): CanvasPlaylist {
  return addPlaylistClip(playlist, nodeId)
}

export function appendPlaylistClips(target: CanvasPlaylist, source: CanvasPlaylist): CanvasPlaylist {
  if (target.id === source.id || source.clips.length === 0) return target
  const appended = source.clips.map((clip) => ({ ...clip, id: clipId(clip.nodeId) }))
  return {
    ...target,
    clips: [...target.clips, ...appended],
    activeClipId: appended[appended.length - 1].id,
    playheadTime: undefined,
  }
}

export function splitPlaylistClip(playlist: CanvasPlaylist, clipIdToSplit: string, duration = 8): CanvasPlaylist {
  const index = playlist.clips.findIndex((clip) => clip.id === clipIdToSplit)
  if (index < 0) return playlist
  const source = playlist.clips[index]
  const start = source.inPoint
  const end = source.outPoint ?? duration
  return splitPlaylistClipAtTime(playlist, clipIdToSplit, start + (end - start) / 2, duration)
}

export function splitPlaylistClipAtTime(playlist: CanvasPlaylist, clipIdToSplit: string, splitTime: number, duration = 8): CanvasPlaylist {
  const index = playlist.clips.findIndex((clip) => clip.id === clipIdToSplit)
  if (index < 0) return playlist
  const source = playlist.clips[index]
  const start = source.inPoint
  const end = source.outPoint ?? duration
  if (splitTime <= start + 0.05 || splitTime >= end - 0.05) return playlist
  const left = { ...source, id: clipId(source.nodeId), outPoint: splitTime }
  const right = { ...source, id: clipId(source.nodeId), inPoint: splitTime, outPoint: end }
  const clips = [...playlist.clips]
  clips.splice(index, 1, left, right)
  return { ...playlist, clips, activeClipId: right.id, playheadTime: undefined }
}

export function removePlaylistClip(playlist: CanvasPlaylist, clipIdToRemove: string): CanvasPlaylist {
  const index = playlist.clips.findIndex((clip) => clip.id === clipIdToRemove)
  if (index < 0) return playlist
  const clips = playlist.clips.filter((clip) => clip.id !== clipIdToRemove)
  const fallback = clips[Math.min(index, Math.max(0, clips.length - 1))]
  return {
    ...playlist,
    clips,
    activeClipId: playlist.activeClipId === clipIdToRemove ? fallback?.id : playlist.activeClipId,
    playheadTime: undefined,
  }
}

export function reorderPlaylistClip(playlist: CanvasPlaylist, clipIdToMove: string, insertionIndex: number): CanvasPlaylist {
  const sourceIndex = playlist.clips.findIndex((clip) => clip.id === clipIdToMove)
  if (sourceIndex < 0) return playlist
  const boundedInsertionIndex = Math.min(Math.max(Math.trunc(insertionIndex), 0), playlist.clips.length)
  const destinationIndex = sourceIndex < boundedInsertionIndex ? boundedInsertionIndex - 1 : boundedInsertionIndex
  if (destinationIndex === sourceIndex) return playlist
  const clips = [...playlist.clips]
  const [clip] = clips.splice(sourceIndex, 1)
  clips.splice(destinationIndex, 0, clip)
  return { ...playlist, clips, playheadTime: undefined }
}

export function buildPlaylistComposition(playlist: CanvasPlaylist, nodes: CanvasFlowNode[]): PlaylistComposition {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const clips = playlist.clips.flatMap((clip) => {
    const node = nodeById.get(clip.nodeId)
    if (!isPlayablePlaylistVideo(node)) return []
    const duration = playlistClipDuration(clip, node)
    return [{
      clipId: clip.id,
      sourceNodeId: clip.nodeId,
      sourceTitle: node.data.title,
      inPoint: clip.inPoint,
      outPoint: clip.inPoint + duration,
      duration,
    }]
  })
  return {
    playlistId: playlist.id,
    playlistName: playlist.name,
    clips,
    totalDuration: clips.reduce((sum, clip) => sum + clip.duration, 0),
  }
}

/**
 * Removes clips whose source nodes no longer exist and keeps playlist selection
 * state internally consistent. Any structural repair clears the locked playhead
 * because its absolute timeline position no longer points at the same content.
 */
export function pruneMissingPlaylistClips(playlists: CanvasPlaylist[], nodes: CanvasFlowNode[]): CanvasPlaylist[] {
  const existingNodeIds = new Set(nodes.map((node) => node.id))
  let playlistsChanged = false
  const nextPlaylists = playlists.map((playlist) => {
    const clips = playlist.clips.filter((clip) => existingNodeIds.has(clip.nodeId))
    const clipsChanged = clips.length !== playlist.clips.length
    const activeStillExists = playlist.activeClipId !== undefined
      && clips.some((clip) => clip.id === playlist.activeClipId)

    let activeClipId = playlist.activeClipId
    if (!clips.length) {
      activeClipId = undefined
    } else if (!activeStillExists) {
      const previousActiveIndex = playlist.activeClipId === undefined
        ? -1
        : playlist.clips.findIndex((clip) => clip.id === playlist.activeClipId)
      const fallbackIndex = previousActiveIndex < 0
        ? 0
        : Math.min(
            playlist.clips.slice(0, previousActiveIndex).filter((clip) => existingNodeIds.has(clip.nodeId)).length,
            clips.length - 1,
          )
      activeClipId = clips[fallbackIndex].id
    }

    const activeChanged = activeClipId !== playlist.activeClipId
    if (!clipsChanged && !activeChanged) return playlist
    playlistsChanged = true
    return {
      ...playlist,
      clips,
      activeClipId,
      playheadTime: undefined,
    }
  })
  return playlistsChanged ? nextPlaylists : playlists
}

export function playlistDuration(playlist: CanvasPlaylist, nodes: CanvasFlowNode[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  return playlist.clips.reduce((total, clip) => total + playlistClipDuration(clip, nodeById.get(clip.nodeId)), 0)
}

export interface PlaylistTimeLocation {
  clip: CanvasPlaylistClip
  clipIndex: number
  clipStart: number
  clipDuration: number
  localTime: number
  playlistTime: number
}

export function locatePlaylistTime(playlist: CanvasPlaylist, nodes: CanvasFlowNode[], requestedTime: number): PlaylistTimeLocation | null {
  if (!playlist.clips.length) return null
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const durations = playlist.clips.map((clip) => playlistClipDuration(clip, nodeById.get(clip.nodeId)))
  const total = durations.reduce((sum, duration) => sum + duration, 0)
  const playlistTime = Math.min(Math.max(requestedTime, 0), total)
  let elapsed = 0
  for (let index = 0; index < playlist.clips.length; index += 1) {
    const clip = playlist.clips[index]
    const currentDuration = durations[index]
    if (playlistTime < elapsed + currentDuration || index === playlist.clips.length - 1) {
      const offset = Math.min(Math.max(playlistTime - elapsed, 0), currentDuration)
      return {
        clip,
        clipIndex: index,
        clipStart: elapsed,
        clipDuration: currentDuration,
        localTime: clip.inPoint + offset,
        playlistTime,
      }
    }
    elapsed += currentDuration
  }
  return null
}

export function playlistInsertionIndexAtPoint(playlist: CanvasPlaylist, nodes: CanvasFlowNode[], pointX: number, expanded = false) {
  if (!playlist.clips.length) return 0
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const durations = playlist.clips.map((clip) => playlistClipDuration(clip, nodeById.get(clip.nodeId)))
  const toolsOffset = expanded ? PLAYLIST_TOOLS_WIDTH + PLAYLIST_TIMELINE_GAP : 0
  let clipLeft = playlist.position.x + toolsOffset + PLAYLIST_TIMELINE_PADDING
  for (let index = 0; index < durations.length; index += 1) {
    const width = playlistClipWidth(durations[index])
    if (pointX < clipLeft + width / 2) return index
    clipLeft += width + PLAYLIST_CLIP_GAP
  }
  return durations.length
}

export function isVideoNodeInPlaylistDropZone(node: CanvasFlowNode, playlist: CanvasPlaylist, expanded = false) {
  if (!isPlayablePlaylistVideo(node)) return false
  const { width, height } = nodeDimensions(node)
  const playlistHeight = expanded && playlist.clips.length ? playlistExpandedHeight(playlist) : PLAYLIST_EMPTY_HEIGHT
  const overlapWidth = Math.min(node.position.x + width, playlist.position.x + playlistWidth(playlist))
    - Math.max(node.position.x, playlist.position.x)
  const overlapHeight = Math.min(node.position.y + height, playlist.position.y + playlistHeight)
    - Math.max(node.position.y, playlist.position.y)
  return overlapWidth >= MIN_DROP_OVERLAP && overlapHeight >= MIN_DROP_OVERLAP
}
