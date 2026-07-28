import type { CanvasFlowEdge, CanvasFlowNode, CanvasGroup, CanvasRect } from './types'

export type FlowRect = CanvasRect
export type GroupResizeCorner = 'nw' | 'ne' | 'sw' | 'se'
export interface BlankCanvasTap { x: number; y: number; time: number }

export function canStartMarquee(button: number, spacePressed: boolean) {
  return button === 2 || (button === 0 && !spacePressed)
}

export function isRepeatedBlankCanvasTap(
  previous: BlankCanvasTap | null,
  current: BlankCanvasTap,
  maxDelay = 520,
  maxDistance = 12,
) {
  if (!previous) return false
  const elapsed = current.time - previous.time
  return elapsed >= 0
    && elapsed <= maxDelay
    && Math.hypot(current.x - previous.x, current.y - previous.y) <= maxDistance
}

export function mergeMarqueeSelection(hitIds: string[], selectedIds: string[], additive: boolean) {
  return new Set(additive ? [...selectedIds, ...hitIds] : hitIds)
}

export function nodeDimensions(node: CanvasFlowNode) {
  const measuredWidth = node.measured?.width ?? node.width ?? Number(node.style?.width)
  const measuredHeight = node.measured?.height ?? node.height ?? Number(node.style?.height)
  const fallback = {
    text: { width: 290, height: 176 },
    image: { width: 360, height: 250 },
    video: { width: 440, height: 330 },
    audio: { width: 330, height: 100 },
  }[node.data.nodeType]
  return {
    width: measuredWidth || fallback.width,
    height: measuredHeight || fallback.height,
  }
}

export function selectionIntersections(rect: FlowRect, nodes: CanvasFlowNode[]) {
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  return nodes.filter((node) => {
    const size = nodeDimensions(node)
    return node.position.x < right
      && node.position.x + size.width > rect.x
      && node.position.y < bottom
      && node.position.y + size.height > rect.y
  }).map((node) => node.id)
}

export function calculateGroupBounds(nodes: CanvasFlowNode[], padding = 34): FlowRect | null {
  if (!nodes.length) return null
  const minX = Math.min(...nodes.map((node) => node.position.x))
  const minY = Math.min(...nodes.map((node) => node.position.y))
  const maxX = Math.max(...nodes.map((node) => node.position.x + nodeDimensions(node).width))
  const maxY = Math.max(...nodes.map((node) => node.position.y + nodeDimensions(node).height))
  return { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 }
}

export function pointInsideRect(point: { x: number; y: number }, rect: FlowRect) {
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height
}

export function nodeCenter(node: CanvasFlowNode) {
  const size = nodeDimensions(node)
  return { x: node.position.x + size.width / 2, y: node.position.y + size.height / 2 }
}

export function expandGroupBounds(bounds: FlowRect, required: FlowRect): FlowRect {
  const x = Math.min(bounds.x, required.x)
  const y = Math.min(bounds.y, required.y)
  const right = Math.max(bounds.x + bounds.width, required.x + required.width)
  const bottom = Math.max(bounds.y + bounds.height, required.y + required.height)
  return { x, y, width: right - x, height: bottom - y }
}

export function resizeGroupBounds(
  bounds: FlowRect,
  corner: GroupResizeCorner,
  dx: number,
  dy: number,
  minimum: FlowRect,
): FlowRect {
  const left = bounds.x
  const top = bounds.y
  const right = bounds.x + bounds.width
  const bottom = bounds.y + bounds.height
  const nextLeft = corner.includes('w') ? Math.min(left + dx, minimum.x) : left
  const nextTop = corner.includes('n') ? Math.min(top + dy, minimum.y) : top
  const nextRight = corner.includes('e') ? Math.max(right + dx, minimum.x + minimum.width) : right
  const nextBottom = corner.includes('s') ? Math.max(bottom + dy, minimum.y + minimum.height) : bottom
  return { x: nextLeft, y: nextTop, width: nextRight - nextLeft, height: nextBottom - nextTop }
}

export function reconcileNodeGroupMembership(
  groups: CanvasGroup[],
  nodes: CanvasFlowNode[],
  nodeId: string,
) {
  const node = nodes.find((item) => item.id === nodeId)
  if (!node) return groups
  const center = nodeCenter(node)
  const current = groups.find((group) => group.nodeIds.includes(nodeId))
  const overlapping = groups.filter((group) => pointInsideRect(center, group.bounds))
  const destination = [...overlapping].reverse().find((group) => group.id !== current?.id) ?? overlapping.find((group) => group.id === current?.id)
  const required = calculateGroupBounds([node], 16)!

  const next = groups.map((group) => {
    if (group.id === destination?.id) {
      return {
        ...group,
        nodeIds: group.nodeIds.includes(nodeId) ? group.nodeIds : [...group.nodeIds, nodeId],
        bounds: expandGroupBounds(group.bounds, required),
      }
    }
    if (group.nodeIds.includes(nodeId)) return { ...group, nodeIds: group.nodeIds.filter((id) => id !== nodeId) }
    return group
  })
  return next.filter((group) => group.nodeIds.length >= 2)
}

export function translateGroupNodes(nodes: CanvasFlowNode[], nodeIds: string[], dx: number, dy: number) {
  const selected = new Set(nodeIds)
  return nodes.map((node) => selected.has(node.id)
    ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }
    : node)
}

export function translateNodesFromOrigin(
  nodes: CanvasFlowNode[],
  originNodes: CanvasFlowNode[],
  nodeIds: string[],
  dx: number,
  dy: number,
) {
  const selected = new Set(nodeIds)
  const originPositions = new Map(originNodes.map((node) => [node.id, node.position]))
  return nodes.map((node) => {
    const origin = originPositions.get(node.id)
    if (!selected.has(node.id) || !origin) return node
    return { ...node, position: { x: origin.x + dx, y: origin.y + dy } }
  })
}

export function translateRect(rect: FlowRect, dx: number, dy: number): FlowRect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy }
}

export function reconcileDraggedNodeGroups(
  groups: CanvasGroup[],
  nodes: CanvasFlowNode[],
  nodeIds: string[],
  dx: number,
  dy: number,
) {
  const dragged = new Set(nodeIds)
  const completeGroups = groups.filter((group) => group.nodeIds.every((id) => dragged.has(id)))
  const completeGroupIds = new Set(completeGroups.map((group) => group.id))
  const completeGroupMembers = new Set(completeGroups.flatMap((group) => group.nodeIds))
  let nextGroups = groups.map((group) => completeGroupIds.has(group.id)
    ? { ...group, bounds: translateRect(group.bounds, dx, dy) }
    : group)

  nodeIds.filter((id) => !completeGroupMembers.has(id)).forEach((id) => {
    nextGroups = reconcileNodeGroupMembership(nextGroups, nodes, id)
  })
  return nextGroups
}

/**
 * Arrange groups as indivisible units, then place ungrouped nodes beneath them.
 * Member nodes keep their relative positions and every persisted group bound is
 * translated by the exact same delta, so "整理画布" cannot tear groups apart.
 */
export function organizeCanvasLayout(nodes: CanvasFlowNode[], groups: CanvasGroup[]) {
  const nextNodes = nodes.map((node) => ({ ...node, position: { ...node.position } }))
  const nextGroups = groups.map((group) => ({ ...group, bounds: { ...group.bounds }, nodeIds: [...group.nodeIds] }))
  const nodeIndex = new Map(nextNodes.map((node, index) => [node.id, index]))
  const groupedIds = new Set(nextGroups.flatMap((group) => group.nodeIds))
  const rowLimit = 2300
  const gap = 110
  let cursorX = 90
  let cursorY = 150
  let rowHeight = 0

  nextGroups.forEach((group) => {
    if (cursorX > 90 && cursorX + group.bounds.width > rowLimit) {
      cursorX = 90
      cursorY += rowHeight + gap
      rowHeight = 0
    }
    const dx = cursorX - group.bounds.x
    const dy = cursorY - group.bounds.y
    group.bounds = translateRect(group.bounds, dx, dy)
    group.nodeIds.forEach((id) => {
      const index = nodeIndex.get(id)
      if (index === undefined) return
      const node = nextNodes[index]
      nextNodes[index] = { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }
    })
    cursorX += group.bounds.width + gap
    rowHeight = Math.max(rowHeight, group.bounds.height)
  })

  const ungrouped = nextNodes.filter((node) => !groupedIds.has(node.id))
    .sort((left, right) => ['text', 'image', 'video', 'audio'].indexOf(left.data.nodeType) - ['text', 'image', 'video', 'audio'].indexOf(right.data.nodeType))
  cursorX = 90
  cursorY = nextGroups.length ? cursorY + rowHeight + 150 : 150
  rowHeight = 0
  ungrouped.forEach((node) => {
    const size = nodeDimensions(node)
    if (cursorX > 90 && cursorX + size.width > rowLimit) {
      cursorX = 90
      cursorY += rowHeight + gap
      rowHeight = 0
    }
    const index = nodeIndex.get(node.id)!
    nextNodes[index] = { ...nextNodes[index], position: { x: cursorX, y: cursorY } }
    cursorX += size.width + 90
    rowHeight = Math.max(rowHeight, size.height)
  })

  return { nodes: nextNodes, groups: nextGroups }
}

export function pruneGroups(groups: CanvasGroup[], nodes: CanvasFlowNode[]) {
  const available = new Set(nodes.map((node) => node.id))
  return groups.map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => available.has(id)) }))
    .filter((group) => group.nodeIds.length >= 2)
}

function segmentsIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
) {
  const cross = (p: typeof a, q: typeof a, r: typeof a) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const c1 = cross(a, b, c)
  const c2 = cross(a, b, d)
  const c3 = cross(c, d, a)
  const c4 = cross(c, d, b)
  return ((c1 <= 0 && c2 >= 0) || (c1 >= 0 && c2 <= 0))
    && ((c3 <= 0 && c4 >= 0) || (c3 >= 0 && c4 <= 0))
}

function segmentIntersectsRect(start: { x: number; y: number }, end: { x: number; y: number }, rect: FlowRect) {
  if (pointInsideRect(start, rect) || pointInsideRect(end, rect)) return true
  const topLeft = { x: rect.x, y: rect.y }
  const topRight = { x: rect.x + rect.width, y: rect.y }
  const bottomRight = { x: rect.x + rect.width, y: rect.y + rect.height }
  const bottomLeft = { x: rect.x, y: rect.y + rect.height }
  return segmentsIntersect(start, end, topLeft, topRight)
    || segmentsIntersect(start, end, topRight, bottomRight)
    || segmentsIntersect(start, end, bottomRight, bottomLeft)
    || segmentsIntersect(start, end, bottomLeft, topLeft)
}

function bezierPoint(t: number, start: { x: number; y: number }, c1: { x: number; y: number }, c2: { x: number; y: number }, end: { x: number; y: number }) {
  const mt = 1 - t
  return {
    x: mt ** 3 * start.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * end.x,
    y: mt ** 3 * start.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * end.y,
  }
}

export function edgeSelectionIntersections(rect: FlowRect, edges: CanvasFlowEdge[], nodes: CanvasFlowNode[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  return edges.filter((edge) => {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) return false
    const sourceSize = nodeDimensions(source)
    const targetSize = nodeDimensions(target)
    const start = { x: source.position.x + sourceSize.width, y: source.position.y + sourceSize.height / 2 }
    const end = { x: target.position.x, y: target.position.y + targetSize.height / 2 }
    const controlDistance = Math.max(56, Math.abs(end.x - start.x) * 0.5)
    const c1 = { x: start.x + controlDistance, y: start.y }
    const c2 = { x: end.x - controlDistance, y: end.y }
    let previous = start
    for (let index = 1; index <= 32; index += 1) {
      const current = bezierPoint(index / 32, start, c1, c2, end)
      if (segmentIntersectsRect(previous, current, rect)) return true
      previous = current
    }
    return false
  }).map((edge) => edge.id)
}

export function removeCanvasSelection(
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
  groups: CanvasGroup[],
  nodeIds: string[],
  edgeIds: string[],
) {
  const removedNodes = new Set(nodeIds)
  const removedEdges = new Set(edgeIds)
  const nextNodes = nodes.filter((node) => !removedNodes.has(node.id))
  const nextEdges = edges.filter((edge) => !removedEdges.has(edge.id) && !removedNodes.has(edge.source) && !removedNodes.has(edge.target))
  return { nodes: nextNodes, edges: nextEdges, groups: pruneGroups(groups, nextNodes) }
}

export function duplicateCanvasSelection(
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
  groups: CanvasGroup[],
  selectedIds: string[],
  stamp: string,
) {
  const selected = new Set(selectedIds)
  const idMap = new Map(selectedIds.map((id) => [id, `${id}-copy-${stamp}`]))
  const copies = nodes.filter((node) => selected.has(node.id)).map((node) => ({
    ...structuredClone(node),
    id: idMap.get(node.id)!,
    position: { x: node.position.x + 38, y: node.position.y + 38 },
    selected: true,
    data: { ...structuredClone(node.data), title: `${node.data.title} 副本`, references: [] },
  }))
  const copiedEdges = edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target)).map((edge) => ({
    ...structuredClone(edge),
    id: `${edge.id}-copy-${stamp}`,
    source: idMap.get(edge.source)!,
    target: idMap.get(edge.target)!,
    selected: false,
  }))
  const copiedGroups = groups.filter((group) => group.nodeIds.every((id) => selected.has(id))).map((group) => ({
    ...structuredClone(group),
    id: `${group.id}-copy-${stamp}`,
    name: `${group.name} 副本`,
    nodeIds: group.nodeIds.map((id) => idMap.get(id)!),
    bounds: translateRect(group.bounds, 38, 38),
  }))
  return { copies, copiedEdges, copiedGroups }
}
