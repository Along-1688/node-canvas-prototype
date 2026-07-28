import type { AlignmentGuide, AlignmentKind } from './types'

export interface AlignmentBox {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface AlignmentSnapResult {
  x: number
  y: number
  guides: AlignmentGuide[]
}

interface AxisCandidate {
  delta: number
  position: number
  kind: AlignmentKind
  spanStart: number
  spanEnd: number
}

const anchors = (start: number, size: number) => ({
  start,
  center: start + size / 2,
  end: start + size,
})

function nearestCandidate(candidates: AxisCandidate[], threshold: number) {
  return candidates
    .filter((candidate) => Math.abs(candidate.delta) <= threshold)
    .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0]
}

export function calculateAlignmentSnap(dragged: AlignmentBox, others: AlignmentBox[], threshold: number): AlignmentSnapResult {
  const draggedX = anchors(dragged.x, dragged.width)
  const draggedY = anchors(dragged.y, dragged.height)
  const xCandidates: AxisCandidate[] = []
  const yCandidates: AxisCandidate[] = []

  for (const other of others) {
    const otherX = anchors(other.x, other.width)
    const otherY = anchors(other.y, other.height)
    for (const kind of ['start', 'center', 'end'] as const) {
      xCandidates.push({
        delta: otherX[kind] - draggedX[kind],
        position: otherX[kind],
        kind,
        spanStart: Math.min(dragged.y, other.y) - 20,
        spanEnd: Math.max(dragged.y + dragged.height, other.y + other.height) + 20,
      })
      yCandidates.push({
        delta: otherY[kind] - draggedY[kind],
        position: otherY[kind],
        kind,
        spanStart: Math.min(dragged.x, other.x) - 20,
        spanEnd: Math.max(dragged.x + dragged.width, other.x + other.width) + 20,
      })
    }
  }

  const snapX = nearestCandidate(xCandidates, threshold)
  const snapY = nearestCandidate(yCandidates, threshold)
  const guides: AlignmentGuide[] = []
  if (snapX) guides.push({ axis: 'x', position: snapX.position, spanStart: snapX.spanStart, spanEnd: snapX.spanEnd, kind: snapX.kind })
  if (snapY) guides.push({ axis: 'y', position: snapY.position, spanStart: snapY.spanStart, spanEnd: snapY.spanEnd, kind: snapY.kind })

  return {
    x: dragged.x + (snapX?.delta ?? 0),
    y: dragged.y + (snapY?.delta ?? 0),
    guides,
  }
}
