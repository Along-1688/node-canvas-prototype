import type { CanvasDocument, CanvasFlowEdge, CanvasFlowNode, CanvasGroup, CanvasPlaylist, GenerationTask } from './types'

export interface CanvasSnapshot {
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  groups: CanvasGroup[]
  tasks: GenerationTask[]
  playlists: CanvasPlaylist[]
}

export function cloneCanvasSnapshot(
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
  groups: CanvasGroup[],
  tasks: GenerationTask[],
  playlists: CanvasPlaylist[] = [],
): CanvasSnapshot {
  return {
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
    groups: structuredClone(groups),
    tasks: structuredClone(tasks),
    playlists: structuredClone(playlists),
  }
}

export function restoreCanvasSnapshot(canvas: CanvasDocument, snapshot: CanvasSnapshot): CanvasDocument {
  return {
    ...canvas,
    nodes: structuredClone(snapshot.nodes),
    edges: structuredClone(snapshot.edges),
    groups: structuredClone(snapshot.groups),
    tasks: structuredClone(snapshot.tasks),
    playlists: structuredClone(snapshot.playlists),
  }
}
