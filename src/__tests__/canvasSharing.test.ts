import { describe, expect, it, vi } from 'vitest'
import {
  canvasShareTokenFromHash,
  canvasShareUrl,
  copyCanvasShareLink,
  createCanvasShareSnapshot,
  loadCanvasShareSnapshot,
  saveCanvasShareSnapshot,
} from '../canvasSharing'
import type { CanvasDocument } from '../types'

const canvas = (): CanvasDocument => ({
  id: 'canvas-1',
  name: '产品宣传片',
  viewport: { x: 24, y: 16, zoom: 0.88 },
  nodes: [{
    id: 'video-1',
    type: 'video',
    position: { x: 100, y: 80 },
    data: { nodeType: 'video', title: '成片', status: 'success', sourceKind: 'generated', media: { url: '/video.mp4' } },
  }],
  edges: [],
  tasks: [],
  groups: [],
  playlists: [],
})

describe('canvas sharing', () => {
  it('persists an immutable whole-canvas snapshot', () => {
    const source = canvas()
    const snapshot = createCanvasShareSnapshot(source, 1_700_000_000_000)
    source.nodes[0].data.title = '后来修改'
    saveCanvasShareSnapshot(window.localStorage, snapshot)

    expect(loadCanvasShareSnapshot(window.localStorage, `#share/canvas/${snapshot.token}`)).toEqual({ status: 'ready', snapshot })
    expect(snapshot.canvas.nodes[0].data.title).toBe('成片')
  })

  it('migrates external launcher anchors back to node borders when a snapshot is created or loaded', () => {
    const source = canvas()
    source.nodes.push({ ...structuredClone(source.nodes[0]), id: 'video-2' })
    source.edges = [{ id: 'launcher-edge', source: 'video-1', sourceHandle: 'output-launcher', target: 'video-2', targetHandle: 'input-launcher', type: 'canvas' }]
    const created = createCanvasShareSnapshot(source, 1_700_000_000_100)
    expect(created.canvas.edges[0]).toMatchObject({ sourceHandle: 'output', targetHandle: 'input' })

    created.canvas.edges[0] = { ...created.canvas.edges[0], sourceHandle: 'output-launcher', targetHandle: 'input-launcher' }
    saveCanvasShareSnapshot(window.localStorage, created)
    const loaded = loadCanvasShareSnapshot(window.localStorage, `#share/canvas/${created.token}`)
    expect(loaded.status === 'ready' && loaded.snapshot.canvas.edges[0]).toMatchObject({ sourceHandle: 'output', targetHandle: 'input' })
  })

  it('builds a revocable canvas share URL without the one-time handoff query', () => {
    const snapshot = createCanvasShareSnapshot(canvas(), 1_700_000_000_000)
    const link = canvasShareUrl('http://127.0.0.1:4173/?canvasSnapshot=temporary', snapshot)
    expect(link).not.toContain('canvasSnapshot=temporary')
    expect(canvasShareTokenFromHash(new URL(link).hash)).toBe(snapshot.token)
    window.localStorage.clear()
    expect(loadCanvasShareSnapshot(window.localStorage, new URL(link).hash)).toEqual({ status: 'missing' })
  })

  it('keeps legacy local-only share URLs readable', () => {
    const snapshot = createCanvasShareSnapshot(canvas(), 1_700_000_000_000)
    saveCanvasShareSnapshot(window.localStorage, snapshot)
    const link = canvasShareUrl('http://127.0.0.1:4173/', snapshot.token)
    expect(link).toBe(`http://127.0.0.1:4173/#share/canvas/${snapshot.token}`)
    expect(loadCanvasShareSnapshot(window.localStorage, new URL(link).hash)).toEqual({ status: 'ready', snapshot })
  })

  it('rejects missing and malformed snapshots', () => {
    expect(loadCanvasShareSnapshot(window.localStorage, '#share/canvas/not-found')).toEqual({ status: 'missing' })
    window.localStorage.setItem('mango-canvas-share:broken', '{')
    expect(loadCanvasShareSnapshot(window.localStorage, '#share/canvas/broken')).toEqual({ status: 'invalid' })
  })

  it('copies the generated link through the Clipboard API', async () => {
    const execCommand = vi.fn().mockReturnValue(false)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await copyCanvasShareLink('https://app.example/share/canvas/abc1234')
    expect(writeText).toHaveBeenCalledWith('https://app.example/share/canvas/abc1234')
  })

  it('falls back to a synchronous copy when Clipboard API access is rejected', async () => {
    const execCommand = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    await expect(copyCanvasShareLink('https://app.example/share/canvas/fallback')).resolves.toBeUndefined()
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('reports failure when neither clipboard path succeeds', async () => {
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    await expect(copyCanvasShareLink('https://app.example/share/canvas/failed')).rejects.toThrow('denied')
  })
})
