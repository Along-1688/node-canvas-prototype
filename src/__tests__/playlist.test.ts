import { describe, expect, it } from 'vitest'
import {
  addPlaylistClip,
  appendPlaylistClips,
  buildPlaylistComposition,
  findAvailablePlaylistPosition,
  isVideoNodeInPlaylistDropZone,
  locatePlaylistTime,
  PLAYLIST_FILLED_HEIGHT,
  playlistDuration,
  playlistExpandedHeight,
  playlistInsertionIndexAtPoint,
  pruneMissingPlaylistClips,
  removePlaylistClip,
  reorderPlaylistClip,
  splitPlaylistClip,
  splitPlaylistClipAtTime,
  togglePlaylistClip,
} from '../playlist'
import type { CanvasFlowNode, CanvasPlaylist } from '../types'

const playlist = (): CanvasPlaylist => ({ id: 'p1', name: '播放列表 1', position: { x: 100, y: 100 }, clips: [] })
const videoNode = (position = { x: 120, y: 120 }): CanvasFlowNode => ({
  id: 'video-1',
  type: 'video',
  position,
  style: { width: 360, height: 240 },
  data: { nodeType: 'video', title: '横屏视频', status: 'success', sourceKind: 'upload', media: { url: '/video.mp4', duration: 8 } },
})

describe('playlist helpers', () => {
  it('adds a new clip every time the same video is selected', () => {
    const once = addPlaylistClip(playlist(), 'video-1')
    const twice = addPlaylistClip(once, 'video-1')
    expect(twice.clips.map((clip) => clip.nodeId)).toEqual(['video-1', 'video-1'])
    expect(twice.clips[1].id).not.toBe(twice.clips[0].id)
    expect(twice.activeClipId).toBe(twice.clips[1].id)
  })

  it('keeps the legacy toggle caller additive for repeated videos', () => {
    const first = addPlaylistClip(playlist(), 'video-1')
    const second = togglePlaylistClip(first, 'video-2')
    expect(second.clips.map((clip) => clip.nodeId)).toEqual(['video-1', 'video-2'])
    const repeated = togglePlaylistClip(second, 'video-2')
    expect(repeated.clips.map((clip) => clip.nodeId)).toEqual(['video-1', 'video-2', 'video-2'])
    expect(repeated.activeClipId).toBe(repeated.clips[2].id)
  })

  it('appends copied playlist clips in order with new identities', () => {
    const target: CanvasPlaylist = {
      ...playlist(),
      clips: [{ id: 'target-a', nodeId: 'video-1', inPoint: 0 }],
      activeClipId: 'target-a',
      playheadTime: 2,
    }
    const source: CanvasPlaylist = {
      ...playlist(),
      id: 'p2',
      clips: [
        { id: 'source-a', nodeId: 'video-2', inPoint: 1, outPoint: 3.5 },
        { id: 'source-b', nodeId: 'video-1', inPoint: 0.5 },
      ],
      activeClipId: 'source-a',
    }

    const result = appendPlaylistClips(target, source)

    expect(result.clips.map((clip) => [clip.nodeId, clip.inPoint, clip.outPoint])).toEqual([
      ['video-1', 0, undefined],
      ['video-2', 1, 3.5],
      ['video-1', 0.5, undefined],
    ])
    expect(result.clips.slice(1).map((clip) => clip.id)).not.toContain('source-a')
    expect(result.clips.slice(1).map((clip) => clip.id)).not.toContain('source-b')
    expect(new Set(result.clips.map((clip) => clip.id)).size).toBe(3)
    expect(result.activeClipId).toBe(result.clips[2].id)
    expect(result.playheadTime).toBeUndefined()
    expect(target.clips).toEqual([{ id: 'target-a', nodeId: 'video-1', inPoint: 0 }])
    expect(source.clips.map((clip) => clip.id)).toEqual(['source-a', 'source-b'])
  })

  it('does not append a playlist to itself or append an empty source', () => {
    const target = addPlaylistClip(playlist(), 'video-1')
    expect(appendPlaylistClips(target, target)).toBe(target)
    expect(appendPlaylistClips(target, { ...playlist(), id: 'p2' })).toBe(target)
  })

  it('places newly created playlists where existing timelines remain clickable', () => {
    const base = { x: 100, y: 100 }
    const first = playlist()
    expect(findAvailablePlaylistPosition(base, [])).toEqual(base)
    expect(findAvailablePlaylistPosition(base, [first])).toEqual({ x: 100, y: 228 })
    expect(findAvailablePlaylistPosition(base, [first, { ...first, id: 'p2', position: { x: 100, y: 228 } }])).toEqual({ x: 100, y: -28 })
  })

  it('splits the active clip at its midpoint for legacy callers', () => {
    const current = addPlaylistClip(playlist(), 'video-1')
    const result = splitPlaylistClip(current, current.clips[0].id, 8)
    expect(result.clips).toHaveLength(2)
    expect(result.clips[0].outPoint).toBe(4)
    expect(result.clips[1].inPoint).toBe(4)
  })

  it('splits at the locked source time and clears the playhead', () => {
    const current = { ...addPlaylistClip(playlist(), 'video-1'), playheadTime: 2.5 }
    const result = splitPlaylistClipAtTime(current, current.clips[0].id, 2.5, 8)
    expect(result.clips).toHaveLength(2)
    expect(result.clips[0].outPoint).toBe(2.5)
    expect(result.clips[1].inPoint).toBe(2.5)
    expect(result.playheadTime).toBeUndefined()
  })

  it('inserts and removes a selected clip at a specific position', () => {
    const first = addPlaylistClip(playlist(), 'video-1')
    const second = addPlaylistClip(first, 'video-2')
    const inserted = addPlaylistClip(second, 'video-3', 1)
    expect(inserted.clips.map((clip) => clip.nodeId)).toEqual(['video-1', 'video-3', 'video-2'])
    const removed = removePlaylistClip(inserted, inserted.clips[1].id)
    expect(removed.clips.map((clip) => clip.nodeId)).toEqual(['video-1', 'video-2'])
  })

  it('reorders existing clips while preserving the active clip', () => {
    const current = addPlaylistClip(addPlaylistClip(addPlaylistClip(playlist(), 'video-1'), 'video-2'), 'video-3')
    const moved = reorderPlaylistClip(current, current.clips[0].id, 3)
    expect(moved.clips.map((clip) => clip.nodeId)).toEqual(['video-2', 'video-3', 'video-1'])
    expect(moved.activeClipId).toBe(current.activeClipId)
    expect(reorderPlaylistClip(moved, moved.clips[2].id, 2)).toBe(moved)
  })

  it('builds an export composition from ordered cut ranges', () => {
    const secondNode = { ...videoNode(), id: 'video-2', data: { ...videoNode().data, title: '第二段', media: { url: '/video-2.mp4', duration: 4 } } }
    const current: CanvasPlaylist = {
      ...playlist(),
      clips: [
        { id: 'clip-a', nodeId: 'video-1', inPoint: 1, outPoint: 3.5 },
        { id: 'clip-b', nodeId: 'video-2', inPoint: 0.5, outPoint: 2 },
      ],
    }
    const composition = buildPlaylistComposition(current, [videoNode(), secondNode])
    expect(composition.clips.map((clip) => [clip.sourceNodeId, clip.inPoint, clip.outPoint])).toEqual([
      ['video-1', 1, 3.5],
      ['video-2', 0.5, 2],
    ])
    expect(composition.totalDuration).toBe(4)
  })

  it('uses real clip durations for the timeline, playhead and drop insertion', () => {
    const secondNode = { ...videoNode(), id: 'video-2', data: { ...videoNode().data, media: { url: '/video-2.mp4', duration: 4 } } }
    const nodes = [videoNode(), secondNode]
    const withClips = addPlaylistClip(addPlaylistClip(playlist(), 'video-1'), 'video-2')
    expect(playlistDuration(withClips, nodes)).toBe(12)
    const location = locatePlaylistTime(withClips, nodes, 10)
    expect(location?.clip.nodeId).toBe('video-2')
    expect(location?.localTime).toBe(2)
    expect(playlistInsertionIndexAtPoint(withClips, nodes, 218)).toBe(1)
  })

  it('keeps insertion points aligned when the expanded toolbar is visible', () => {
    const secondNode = { ...videoNode(), id: 'video-2', data: { ...videoNode().data, media: { url: '/video-2.mp4', duration: 4 } } }
    const nodes = [videoNode(), secondNode]
    const withClips = addPlaylistClip(addPlaylistClip(playlist(), 'video-1'), 'video-2')
    expect(playlistInsertionIndexAtPoint(withClips, nodes, 200)).toBe(1)
    expect(playlistInsertionIndexAtPoint(withClips, nodes, 200, true)).toBe(0)
  })

  it('prunes missing clips across playlists and repairs active clip state', () => {
    const current: CanvasPlaylist[] = [
      {
        ...playlist(),
        clips: [
          { id: 'clip-a', nodeId: 'video-1', inPoint: 0 },
          { id: 'clip-missing', nodeId: 'video-missing', inPoint: 0 },
          { id: 'clip-b', nodeId: 'video-2', inPoint: 0 },
        ],
        activeClipId: 'clip-missing',
        playheadTime: 9,
      },
      {
        ...playlist(),
        id: 'p2',
        clips: [{ id: 'clip-only-missing', nodeId: 'video-missing', inPoint: 0 }],
        activeClipId: 'clip-only-missing',
        playheadTime: 2,
      },
    ]
    const nodes = [videoNode(), { ...videoNode(), id: 'video-2' }]

    const result = pruneMissingPlaylistClips(current, nodes)

    expect(result[0].clips.map((clip) => clip.id)).toEqual(['clip-a', 'clip-b'])
    expect(result[0].activeClipId).toBe('clip-b')
    expect(result[0].playheadTime).toBeUndefined()
    expect(result[1].clips).toEqual([])
    expect(result[1].activeClipId).toBeUndefined()
    expect(result[1].playheadTime).toBeUndefined()
    expect(current[0].clips).toHaveLength(3)
  })

  it('keeps a valid active clip while clearing a shifted playhead', () => {
    const current: CanvasPlaylist[] = [{
      ...playlist(),
      clips: [
        { id: 'clip-missing', nodeId: 'video-missing', inPoint: 0 },
        { id: 'clip-valid', nodeId: 'video-1', inPoint: 0 },
      ],
      activeClipId: 'clip-valid',
      playheadTime: 4,
    }]

    const result = pruneMissingPlaylistClips(current, [videoNode()])

    expect(result[0].activeClipId).toBe('clip-valid')
    expect(result[0].playheadTime).toBeUndefined()
  })

  it('repairs stale selection without changing clips and preserves unchanged playlists', () => {
    const stale: CanvasPlaylist[] = [{
      ...playlist(),
      clips: [{ id: 'clip-valid', nodeId: 'video-1', inPoint: 0 }],
      activeClipId: 'clip-stale',
      playheadTime: 2,
    }]
    const repaired = pruneMissingPlaylistClips(stale, [videoNode()])
    expect(repaired[0].activeClipId).toBe('clip-valid')
    expect(repaired[0].playheadTime).toBeUndefined()

    const unchanged: CanvasPlaylist[] = [{ ...repaired[0], playheadTime: 3 }]
    const result = pruneMissingPlaylistClips(unchanged, [videoNode()])
    expect(result).toBe(unchanged)
    expect(result[0]).toBe(unchanged[0])
    expect(result[0].playheadTime).toBe(3)
  })

  it('recognizes a successful video dropped over the playlist', () => {
    expect(isVideoNodeInPlaylistDropZone(videoNode({ x: 120, y: 90 }), playlist())).toBe(true)
    expect(isVideoNodeInPlaylistDropZone(videoNode({ x: 1200, y: 900 }), playlist())).toBe(false)
  })

  it('accepts a visible partial overlap without requiring the node center', () => {
    expect(isVideoNodeInPlaylistDropZone(videoNode({ x: 804, y: 180 }), playlist())).toBe(true)
    expect(isVideoNodeInPlaylistDropZone(videoNode({ x: 805, y: 180 }), playlist())).toBe(false)
  })

  it('uses measured node geometry for playlist drop intersections', () => {
    const measured = { ...videoNode({ x: 10, y: 100 }), measured: { width: 80, height: 80 } }
    expect(isVideoNodeInPlaylistDropZone(measured, playlist())).toBe(false)
  })

  it('scales the expanded drop zone height with the playlist width', () => {
    const withClip = addPlaylistClip(playlist(), 'video-1')
    expect(playlistExpandedHeight(withClip)).toBe(PLAYLIST_FILLED_HEIGHT)

    const wide = { ...withClip, width: 1040 }
    const expandedHeight = playlistExpandedHeight(wide)
    expect(expandedHeight).toBe(697)
    expect(isVideoNodeInPlaylistDropZone(videoNode({ x: 120, y: 100 + expandedHeight - 16 }), wide, true)).toBe(true)
    expect(isVideoNodeInPlaylistDropZone(videoNode({ x: 120, y: 100 + expandedHeight + 1 }), wide, true)).toBe(false)
  })

  it('rejects non-playable media even when it overlaps the playlist', () => {
    const failed: CanvasFlowNode = { ...videoNode(), data: { ...videoNode().data, status: 'failed' } }
    const image: CanvasFlowNode = { ...videoNode(), type: 'image', data: { ...videoNode().data, nodeType: 'image' } }
    expect(isVideoNodeInPlaylistDropZone(failed, playlist())).toBe(false)
    expect(isVideoNodeInPlaylistDropZone(image, playlist())).toBe(false)
  })
})
