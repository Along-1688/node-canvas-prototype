import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaylistFrame } from '../App'
import type { CanvasFlowNode, CanvasPlaylist } from '../types'

const node: CanvasFlowNode = {
  id: 'video-a',
  type: 'video',
  position: { x: 0, y: 0 },
  data: {
    nodeType: 'video',
    title: '视频 A',
    sourceKind: 'upload',
    status: 'success',
    media: { url: '/a.mp4', posterUrl: '/a.jpg', duration: 8 },
  },
}

const initialPlaylist: CanvasPlaylist = {
  id: 'playlist-test',
  name: '播放列表 1',
  position: { x: 0, y: 0 },
  clips: [{ id: 'clip-a', nodeId: 'video-a', inPoint: 0 }],
  activeClipId: 'clip-a',
}

function FrameHarness({
  onSplit,
  onBeginSelection,
  onSelectPlaylist = () => undefined,
  onStartMove = () => undefined,
  onMove = () => undefined,
  onStartResize = () => undefined,
  onResize = () => undefined,
  zoom = 1,
}: {
  onSplit: (clipId: string, time: number) => void
  onBeginSelection: () => void
  onSelectPlaylist?: (ensureVisible?: boolean) => void
  onStartMove?: () => void
  onMove?: (dx: number, dy: number) => void
  onStartResize?: () => void
  onResize?: (width: number) => void
  zoom?: number
}) {
  const [playlist, setPlaylist] = useState(initialPlaylist)
  const [selectedClipId, setSelectedClipId] = useState<string | undefined>('clip-a')
  return <PlaylistFrame
    playlist={playlist}
    nodes={[node]}
    zoom={zoom}
    selected
    selectedClipId={selectedClipId}
    selecting={false}
    mergeCandidate={false}
    onSelectPlaylist={(ensureVisible) => { setSelectedClipId(undefined); onSelectPlaylist(ensureVisible) }}
    onSelectClip={(clipId) => {
      setSelectedClipId(clipId)
      setPlaylist((current) => ({ ...current, activeClipId: clipId, playheadTime: undefined }))
    }}
    onAppendPlaylist={() => undefined}
    onBeginSelection={onBeginSelection}
    onActivate={(clipId) => setPlaylist((current) => ({ ...current, activeClipId: clipId, playheadTime: undefined }))}
    onLockTime={(time, clipId) => {
      setSelectedClipId(clipId)
      setPlaylist((current) => ({ ...current, activeClipId: clipId, playheadTime: time }))
    }}
    onSplit={onSplit}
    onReorder={() => undefined}
    onExportToCanvas={() => undefined}
    onStartMove={onStartMove}
    onMove={onMove}
    onStartResize={onStartResize}
    onResize={(width) => { onResize(width); setPlaylist((current) => ({ ...current, width })) }}
  />
}

describe('playlist frame', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent })
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'PointerEvent')
    vi.restoreAllMocks()
  })

  it('uses a headerless preview and keeps the icon-only add button after the clips', () => {
    const onBeginSelection = vi.fn()
    const { container } = render(<FrameHarness onSplit={() => undefined} onBeginSelection={onBeginSelection} />)
    const track = container.querySelector('.playlist-clip-track')!
    const addButton = screen.getByRole('button', { name: '添加视频片段' })

    expect(container.querySelector('.canvas-playlist > header')).not.toBeInTheDocument()
    expect(screen.queryByText('播放列表 1')).not.toBeInTheDocument()
    expect(addButton.parentElement).toBe(track)
    expect(track.lastElementChild).toBe(addButton)
    expect(addButton).toHaveTextContent('')
    expect(screen.queryByRole('button', { name: '删除选中片段' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除播放列表' })).not.toBeInTheDocument()

    fireEvent.click(addButton)
    expect(onBeginSelection).toHaveBeenCalledTimes(1)
  })

  it('moves without requesting viewport focus and scales pointer deltas by zoom', () => {
    const onSelectPlaylist = vi.fn()
    const onStartMove = vi.fn()
    const onMove = vi.fn()
    render(<FrameHarness
      onSplit={() => undefined}
      onBeginSelection={() => undefined}
      onSelectPlaylist={onSelectPlaylist}
      onStartMove={onStartMove}
      onMove={onMove}
      zoom={2}
    />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '移动播放列表' }), {
      button: 0,
      clientX: 100,
      clientY: 200,
    })
    fireEvent.pointerMove(window, { clientX: 160, clientY: 240 })
    fireEvent.pointerUp(window)

    expect(onSelectPlaylist).toHaveBeenCalledWith(false)
    expect(onStartMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith(30, 20)
  })

  it('keeps the playlist after closing the upper preview and exposes an explicit width handle', () => {
    const onResize = vi.fn()
    const onStartResize = vi.fn()
    const { container } = render(<FrameHarness onSplit={() => undefined} onBeginSelection={() => undefined} onResize={onResize} onStartResize={onStartResize} zoom={2} />)

    expect(container.querySelector('.playlist-player')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭播放列表预览' }))
    expect(container.querySelector('.playlist-player')).not.toBeInTheDocument()
    expect(container.querySelector('.playlist-timeline')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '调整播放列表宽度' }).parentElement).toHaveClass('playlist-editor')

    fireEvent.pointerDown(screen.getByRole('button', { name: '调整播放列表宽度' }), { button: 0, clientX: 120 })
    fireEvent.pointerMove(window, { clientX: 280 })
    fireEvent.pointerUp(window)
    expect(onStartResize).toHaveBeenCalledTimes(1)
    expect(onResize).toHaveBeenLastCalledWith(800)
  })

  it('selects the whole playlist from timeline whitespace and only previews a selected clip', () => {
    const onSelectPlaylist = vi.fn()
    const { container } = render(<FrameHarness onSplit={() => undefined} onBeginSelection={() => undefined} onSelectPlaylist={onSelectPlaylist} />)

    expect(container.querySelector('.playlist-player')).toBeInTheDocument()
    fireEvent.pointerDown(container.querySelector('.playlist-timeline')!, { button: 0 })
    expect(onSelectPlaylist).toHaveBeenCalled()
    expect(container.querySelector('.playlist-player')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '选择片段 1，时长 8.0 秒' }), { clientX: 140, detail: 1 })
    expect(container.querySelector('.playlist-player')).toBeInTheDocument()
  })

  it('follows the pointer, locks the clicked cut line and splits at that exact time', () => {
    const onSplit = vi.fn()
    const { container } = render(<FrameHarness onSplit={onSplit} onBeginSelection={() => undefined} />)
    const clip = screen.getByRole('button', { name: '选择片段 1，时长 8.0 秒' })
    Object.defineProperty(clip, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 100, right: 260, top: 0, bottom: 70, width: 160, height: 70, x: 100, y: 0, toJSON: () => ({}) }),
    })

    fireEvent.pointerMove(clip, { clientX: 140 })
    expect(container.querySelector('.playlist-timeline-line.is-candidate')).toHaveStyle({ left: '25%' })
    expect(screen.getByRole('button', { name: '切割片段' })).toBeDisabled()

    fireEvent.click(clip, { clientX: 140, detail: 1 })
    expect(container.querySelector('.playlist-timeline-line.is-locked')).toHaveStyle({ left: '25%' })
    fireEvent.pointerLeave(container.querySelector('.playlist-clip-track')!)
    expect(container.querySelector('.playlist-timeline-line.is-candidate')).not.toBeInTheDocument()
    expect(container.querySelector('.playlist-timeline-line.is-locked')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '切割片段' }))
    expect(onSplit).toHaveBeenCalledWith('clip-a', 2)
  })
})
