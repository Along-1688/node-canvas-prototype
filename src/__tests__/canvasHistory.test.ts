import { describe, expect, it } from 'vitest'
import { cloneCanvasSnapshot, restoreCanvasSnapshot } from '../canvasHistory'
import type { CanvasDocument } from '../types'

const canvas = (): CanvasDocument => ({
  id: 'canvas-1',
  name: '视频画布',
  viewport: { x: 0, y: 0, zoom: 1 },
  groups: [],
  nodes: [{
    id: 'video-1',
    type: 'video',
    position: { x: 0, y: 0 },
    selected: true,
    data: { nodeType: 'video', title: '视频', status: 'ready', sourceKind: 'created' },
  }],
  edges: [],
  tasks: [],
})

describe('canvas history snapshots', () => {
  it('captures tasks with nodes and edges as one immutable undo unit', () => {
    const document = canvas()
    const before = cloneCanvasSnapshot(document.nodes, document.edges, document.groups, document.tasks)
    document.nodes[0].data.status = 'running'
    document.tasks.push({
      id: 'task-1',
      canvasId: document.id,
      nodeId: 'video-1',
      nodeTitle: '视频',
      nodeType: 'video',
      status: 'running',
      progress: 30,
      effectivePrompt: '生成视频',
      videoGeneration: { ratio: 'auto', resolution: '720p', count: 1, duration: 8, webSearch: false, generateAudio: false },
      modelLabel: 'Kling O1',
      cost: 35,
      createdAt: '12:00',
    })
    const after = cloneCanvasSnapshot(document.nodes, document.edges, document.groups, document.tasks)

    const undone = restoreCanvasSnapshot(document, before)
    expect(undone.nodes[0].data.status).toBe('ready')
    expect(undone.tasks).toEqual([])

    const redone = restoreCanvasSnapshot(undone, after)
    expect(redone.nodes[0].data.status).toBe('running')
    expect(redone.tasks).toHaveLength(1)
    redone.tasks[0].progress = 90
    expect(after.tasks[0].progress).toBe(30)
  })

  it('restores repaint masks in both the derived node and task snapshot', () => {
    const document = canvas()
    document.nodes[0] = {
      ...document.nodes[0],
      id: 'image-repaint',
      type: 'image',
      data: {
        nodeType: 'image',
        title: '重绘结果',
        status: 'success',
        sourceKind: 'generated',
        imageOperation: { operation: 'repaint', prompt: '换装', masks: [{ id: 'smart-1', kind: 'smart', x: 42, y: 36, size: 96, label: '人物' }] },
      },
    }
    document.tasks.push({
      id: 'task-repaint', canvasId: document.id, nodeId: 'image-repaint', nodeTitle: '重绘结果', nodeType: 'image', status: 'success', progress: 100,
      effectivePrompt: '换装', imageOperation: structuredClone(document.nodes[0].data.imageOperation), modelLabel: '图片重绘 Mock', cost: 6, createdAt: '12:00',
    })
    const snapshot = cloneCanvasSnapshot(document.nodes, document.edges, document.groups, document.tasks)
    document.nodes[0].data.imageOperation!.masks![0].x = 90
    document.tasks[0].imageOperation!.masks![0].x = 91

    const restored = restoreCanvasSnapshot(document, snapshot)
    expect(restored.nodes[0].data.imageOperation?.masks?.[0].x).toBe(42)
    expect(restored.tasks[0].imageOperation?.masks?.[0].x).toBe(42)
  })

  it('restores a prefilled playlist creation as one undo and redo unit', () => {
    const document = canvas()
    const before = cloneCanvasSnapshot(document.nodes, document.edges, document.groups, document.tasks, document.playlists)
    document.nodes[0].selected = false
    document.playlists = [{
      id: 'playlist-1',
      name: '播放列表 1',
      position: { x: 120, y: 360 },
      clips: [{ id: 'clip-1', nodeId: 'video-1', inPoint: 0 }],
      activeClipId: 'clip-1',
      playheadTime: 2.5,
    }]
    const after = cloneCanvasSnapshot(document.nodes, document.edges, document.groups, document.tasks, document.playlists)

    const undone = restoreCanvasSnapshot(document, before)
    expect(undone.playlists).toEqual([])
    expect(undone.nodes[0].selected).toBe(true)

    const redone = restoreCanvasSnapshot(undone, after)
    expect(redone.playlists?.[0].clips[0].nodeId).toBe('video-1')
    expect(redone.playlists?.[0].playheadTime).toBe(2.5)
    expect(redone.nodes[0].selected).toBe(false)
  })
})
