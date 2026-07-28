import { describe, expect, it } from 'vitest'
import type { CanvasFlowEdge, CanvasFlowNode, CanvasGroup } from '../types'
import {
  calculateGroupBounds,
  canStartMarquee,
  duplicateCanvasSelection,
  edgeSelectionIntersections,
  isRepeatedBlankCanvasTap,
  mergeMarqueeSelection,
  organizeCanvasLayout,
  pruneGroups,
  reconcileDraggedNodeGroups,
  reconcileNodeGroupMembership,
  removeCanvasSelection,
  resizeGroupBounds,
  selectionIntersections,
  translateGroupNodes,
  translateNodesFromOrigin,
} from '../grouping'

const node = (id: string, x: number, y: number, type: CanvasFlowNode['data']['nodeType'] = 'image'): CanvasFlowNode => ({
  id,
  type,
  position: { x, y },
  style: type === 'text' ? { width: 290, height: 176 } : undefined,
  data: { nodeType: type, title: id, sourceKind: 'created', status: 'ready', content: id },
})

describe('marquee and group geometry', () => {
  it('supports trackpad primary drag and mouse secondary drag, while preserving Space panning', () => {
    expect(canStartMarquee(0, false)).toBe(true)
    expect(canStartMarquee(2, false)).toBe(true)
    expect(canStartMarquee(0, true)).toBe(false)
    expect(canStartMarquee(1, false)).toBe(false)
  })

  it('recognizes a tolerant second blank-canvas tap without confusing drags or distant clicks', () => {
    const first = { x: 240, y: 180, time: 1000 }
    expect(isRepeatedBlankCanvasTap(first, { x: 247, y: 186, time: 1420 })).toBe(true)
    expect(isRepeatedBlankCanvasTap(first, { x: 247, y: 186, time: 1600 })).toBe(false)
    expect(isRepeatedBlankCanvasTap(first, { x: 268, y: 180, time: 1200 })).toBe(false)
  })

  it('replaces selection by default and merges it when Shift is held', () => {
    expect([...mergeMarqueeSelection(['b', 'c'], ['a', 'b'], false)]).toEqual(['b', 'c'])
    expect([...mergeMarqueeSelection(['b', 'c'], ['a', 'b'], true)]).toEqual(['a', 'b', 'c'])
  })

  it('selects every node intersecting the marquee, including partial intersections', () => {
    const nodes = [node('a', 0, 0), node('b', 420, 0), node('c', 900, 0)]
    expect(selectionIntersections({ x: 340, y: 20, width: 180, height: 120 }, nodes)).toEqual(['a', 'b'])
  })

  it('calculates padded bounds and translates only group members', () => {
    const nodes = [node('a', 100, 120), node('b', 500, 220), node('c', 1000, 0)]
    expect(calculateGroupBounds(nodes.slice(0, 2), 20)).toEqual({ x: 80, y: 100, width: 800, height: 390 })
    const moved = translateGroupNodes(nodes, ['a', 'b'], 12, -8)
    expect(moved.map((item) => item.position)).toEqual([{ x: 112, y: 112 }, { x: 512, y: 212 }, { x: 1000, y: 0 }])
  })

  it('moves every temporarily selected node from one drag snapshot without cumulative drift', () => {
    const origin = [node('a', 100, 120), node('b', 500, 220), node('outside', 1000, 0)]
    const latest = origin.map((item) => item.id === 'b'
      ? { ...item, data: { ...item.data, content: 'latest result' } }
      : item)
    const firstFrame = translateNodesFromOrigin(latest, origin, ['a', 'b'], 40, 30)
    const finalFrame = translateNodesFromOrigin(firstFrame, origin, ['a', 'b'], 70, 50)

    expect(finalFrame.map((item) => item.position)).toEqual([
      { x: 170, y: 170 },
      { x: 570, y: 270 },
      { x: 1000, y: 0 },
    ])
    expect(finalFrame[1].data.content).toBe('latest result')
    expect({
      x: finalFrame[1].position.x - finalFrame[0].position.x,
      y: finalFrame[1].position.y - finalFrame[0].position.y,
    }).toEqual({ x: 400, y: 100 })
  })

  it('translates a complete persisted group boundary with its selected members', () => {
    const origin = [node('a', 100, 120), node('b', 500, 220), node('outside', 1000, 0)]
    const groups: CanvasGroup[] = [{ id: 'g1', name: '组 1', nodeIds: ['a', 'b'], bounds: { x: 80, y: 90, width: 800, height: 410 } }]
    const movedNodes = translateNodesFromOrigin(origin, origin, ['a', 'b'], 60, -20)
    const movedGroups = reconcileDraggedNodeGroups(groups, movedNodes, ['a', 'b'], 60, -20)

    expect(movedGroups[0].bounds).toEqual({ x: 140, y: 70, width: 800, height: 410 })
    expect(movedGroups[0].nodeIds).toEqual(['a', 'b'])
  })

  it('organizes persisted groups as units without changing member spacing', () => {
    const nodes = [node('a', 620, 420), node('b', 1040, 510), node('outside', 80, 900, 'text')]
    const groups: CanvasGroup[] = [{ id: 'g1', name: '组 1', nodeIds: ['a', 'b'], bounds: { x: 580, y: 370, width: 860, height: 430 } }]
    const result = organizeCanvasLayout(nodes, groups)
    const a = result.nodes.find((item) => item.id === 'a')!
    const b = result.nodes.find((item) => item.id === 'b')!
    const outside = result.nodes.find((item) => item.id === 'outside')!
    expect(result.groups[0].bounds).toEqual({ x: 90, y: 150, width: 860, height: 430 })
    expect({ x: b.position.x - a.position.x, y: b.position.y - a.position.y }).toEqual({ x: 420, y: 90 })
    expect(outside.position.y).toBeGreaterThan(result.groups[0].bounds.y + result.groups[0].bounds.height)
  })

  it('automatically removes groups with fewer than two available nodes', () => {
    const groups: CanvasGroup[] = [{ id: 'g1', name: '组 1', nodeIds: ['a', 'b'], bounds: { x: -20, y: -42, width: 800, height: 360 } }]
    expect(pruneGroups(groups, [node('a', 0, 0)])).toEqual([])
  })

  it('selects a Bezier edge when the marquee crosses the curve', () => {
    const nodes = [node('a', 0, 0), node('b', 600, 200)]
    const edges: CanvasFlowEdge[] = [{ id: 'curve', source: 'a', target: 'b', data: { relationType: 'generation-input' } }]
    expect(edgeSelectionIntersections({ x: 430, y: 90, width: 90, height: 150 }, edges, nodes)).toEqual(['curve'])
    expect(edgeSelectionIntersections({ x: 0, y: 500, width: 80, height: 80 }, edges, nodes)).toEqual([])
  })

  it('clamps all four resize directions to the member boundary', () => {
    const minimum = { x: 100, y: 80, width: 500, height: 300 }
    const bounds = { x: 40, y: 20, width: 640, height: 420 }
    expect(resizeGroupBounds(bounds, 'nw', 200, 200, minimum)).toEqual({ x: 100, y: 80, width: 580, height: 360 })
    expect(resizeGroupBounds(bounds, 'se', -200, -200, minimum)).toEqual({ x: 40, y: 20, width: 560, height: 360 })
  })

  it('adds by center point, expands for the full member and removes when the center exits', () => {
    const nodes = [node('a', 20, 30), node('b', 420, 30), node('c', 210, 40)]
    const group: CanvasGroup = { id: 'g1', name: '组 1', nodeIds: ['a', 'b'], bounds: { x: 0, y: 0, width: 460, height: 340 } }
    const added = reconcileNodeGroupMembership([group], nodes, 'c')
    expect(added[0].nodeIds).toEqual(['a', 'b', 'c'])
    expect(added[0].bounds.width).toBeGreaterThan(460)
    const movedOutside = nodes.map((item) => item.id === 'b' ? { ...item, position: { x: 1200, y: 30 } } : item)
    expect(reconcileNodeGroupMembership([group], movedOutside, 'b')).toEqual([])
  })

  it('transfers a node between groups without nesting', () => {
    const nodes = [node('a', 10, 20), node('b', 940, 40), node('c', 900, 20), node('d', 1280, 20)]
    const groups: CanvasGroup[] = [
      { id: 'g1', name: '组 1', nodeIds: ['a', 'b'], bounds: { x: 0, y: 0, width: 700, height: 400 } },
      { id: 'g2', name: '组 2', nodeIds: ['c', 'd'], bounds: { x: 850, y: 0, width: 850, height: 420 } },
    ]
    const result = reconcileNodeGroupMembership(groups, nodes, 'b')
    expect(result.map((group) => group.id)).toEqual(['g2'])
    expect(result[0].nodeIds).toEqual(['c', 'd', 'b'])
  })

  it('removes selected nodes and edges as one pure canvas mutation', () => {
    const nodes = [node('a', 0, 0), node('b', 500, 0), node('c', 1000, 0)]
    const edges: CanvasFlowEdge[] = [
      { id: 'ab', source: 'a', target: 'b', data: { relationType: 'generation-input' } },
      { id: 'bc', source: 'b', target: 'c', data: { relationType: 'generation-input' } },
    ]
    const groups: CanvasGroup[] = [{ id: 'g1', name: '组 1', nodeIds: ['a', 'b'], bounds: { x: -20, y: -42, width: 920, height: 360 } }]
    const result = removeCanvasSelection(nodes, edges, groups, ['a'], ['bc'])
    expect(result.nodes.map((item) => item.id)).toEqual(['b', 'c'])
    expect(result.edges).toEqual([])
    expect(result.groups).toEqual([])
  })
})

describe('complete group duplication', () => {
  it('remaps member ids, internal connections and the group', () => {
    const nodes = [node('a', 0, 0, 'text'), node('b', 400, 0), node('outside', 900, 0)]
    const edges: CanvasFlowEdge[] = [
      { id: 'inside', source: 'a', target: 'b', data: { relationType: 'generation-input' } },
      { id: 'outside', source: 'b', target: 'outside', data: { relationType: 'generation-input' } },
    ]
    const groups: CanvasGroup[] = [{ id: 'g1', name: '组 1', nodeIds: ['a', 'b'], bounds: { x: -20, y: -42, width: 810, height: 340 } }]
    const duplicated = duplicateCanvasSelection(nodes, edges, groups, ['a', 'b'], 's')
    expect(duplicated.copies.map((item) => item.id)).toEqual(['a-copy-s', 'b-copy-s'])
    expect(duplicated.copiedEdges).toHaveLength(1)
    expect(duplicated.copiedEdges[0]).toMatchObject({ source: 'a-copy-s', target: 'b-copy-s' })
    expect(duplicated.copiedGroups[0]).toMatchObject({ id: 'g1-copy-s', nodeIds: ['a-copy-s', 'b-copy-s'], bounds: { x: 18, y: -4, width: 810, height: 340 } })
  })
})
