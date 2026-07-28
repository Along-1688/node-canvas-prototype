import { describe, expect, it } from 'vitest'
import { createVideoShareSnapshot, loadVideoShareSnapshot, saveVideoShareSnapshot } from '../videoSharing'

describe('local video sharing', () => {
  it('persists a read-only share snapshot and enforces its expiry', () => {
    const now = 1_700_000_000_000
    const snapshot = createVideoShareSnapshot({
      canvasId: 'canvas-1', videoId: 'video-1', title: '主播视频', media: { url: '/video.mp4', width: 1248, height: 1664 }, expires: '7', allowDownload: true, now,
    })
    saveVideoShareSnapshot(window.localStorage, snapshot)

    expect(loadVideoShareSnapshot(window.localStorage, `#share/video/${snapshot.token}`, now + 1)).toEqual({ status: 'ready', snapshot })
    expect(loadVideoShareSnapshot(window.localStorage, `#share/video/${snapshot.token}`, now + 8 * 24 * 60 * 60 * 1000)).toEqual({ status: 'expired' })
  })

  it('returns missing for unknown links', () => {
    expect(loadVideoShareSnapshot(window.localStorage, '#share/video/not-found')).toEqual({ status: 'missing' })
  })
})
