import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaylistVideoPreview } from '../App'
import type { CanvasFlowNode, CanvasPlaylist } from '../types'

const pausedStates = new WeakMap<HTMLMediaElement, boolean>()
let requestFullscreenMock: ReturnType<typeof vi.fn>

const nodes: CanvasFlowNode[] = [
  {
    id: 'video-a',
    type: 'video',
    position: { x: 0, y: 0 },
    data: { nodeType: 'video', title: '视频 A', sourceKind: 'upload', status: 'success', media: { url: '/a.mp4', duration: .2 } },
  },
  {
    id: 'video-b',
    type: 'video',
    position: { x: 0, y: 0 },
    data: { nodeType: 'video', title: '视频 B', sourceKind: 'upload', status: 'success', media: { url: '/b.mp4', duration: .2 } },
  },
]

const initialPlaylist: CanvasPlaylist = {
  id: 'playlist-test',
  name: '连续播放测试',
  position: { x: 0, y: 0 },
  clips: [
    { id: 'clip-a', nodeId: 'video-a', inPoint: 0 },
    { id: 'clip-b', nodeId: 'video-b', inPoint: 0 },
  ],
  activeClipId: 'clip-a',
}

function PreviewHarness() {
  const [playlist, setPlaylist] = useState(initialPlaylist)
  return <PlaylistVideoPreview
    playlist={playlist}
    nodes={nodes}
    onActivate={(clipId) => setPlaylist((current) => ({ ...current, activeClipId: clipId, playheadTime: undefined }))}
  />
}

describe('playlist continuous preview', () => {
  beforeEach(() => {
    requestFullscreenMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: requestFullscreenMock })
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (this: HTMLMediaElement) {
      return pausedStates.get(this) ?? true
    })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      pausedStates.set(this, false)
      fireEvent.play(this)
      return Promise.resolve()
    })
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      pausedStates.set(this, true)
      fireEvent.pause(this)
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
    vi.restoreAllMocks()
  })

  it('keeps titles off the preview and provides mute and fullscreen controls', () => {
    const { container } = render(<PreviewHarness />)
    const video = container.querySelector('video')!
    expect(screen.queryByText('视频 A')).not.toBeInTheDocument()
    expect(screen.queryByText('视频 B')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '静音播放列表' }))
    expect(video.muted).toBe(true)
    expect(screen.getByRole('button', { name: '打开播放列表声音' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '全屏播放列表' }))
    expect(requestFullscreenMock).toHaveBeenCalledTimes(1)
    expect(requestFullscreenMock.mock.instances[0]).toBe(container.querySelector('.playlist-player'))
  })

  it('keeps playing when the browser marks the ending clip as paused before switching', async () => {
    const { container } = render(<PreviewHarness />)
    const firstVideo = container.querySelector('video')!
    fireEvent.loadedMetadata(firstVideo)
    fireEvent.click(screen.getByRole('button', { name: '播放播放列表' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '暂停播放列表' })).toBeEnabled())

    pausedStates.set(firstVideo, true)
    firstVideo.currentTime = .2
    fireEvent.timeUpdate(firstVideo)

    await waitFor(() => expect(container.querySelector('video')).toHaveAttribute('src', '/b.mp4'))
    const secondVideo = container.querySelector('video')!
    expect(secondVideo).not.toBe(firstVideo)
    fireEvent.loadedMetadata(secondVideo)

    await waitFor(() => expect(screen.getByRole('button', { name: '暂停播放列表' })).toBeEnabled())
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2)

    secondVideo.currentTime = .05
    fireEvent.timeUpdate(secondVideo)
    expect(Number((screen.getByRole('slider', { name: '播放列表播放进度' }) as HTMLInputElement).value)).toBeGreaterThan(.2)
  })
})
