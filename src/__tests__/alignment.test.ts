import { describe, expect, it } from 'vitest'
import { calculateAlignmentSnap, type AlignmentBox } from '../alignment'

const box = (id: string, x: number, y: number, width = 100, height = 80): AlignmentBox => ({
  id,
  x,
  y,
  width,
  height,
})

describe('canvas alignment snapping', () => {
  it('snaps matching left and top edges within the threshold', () => {
    const result = calculateAlignmentSnap(box('dragged', 106, 107), [box('reference', 100, 100)], 8)

    expect(result.x).toBe(100)
    expect(result.y).toBe(100)
    expect(result.guides).toEqual(expect.arrayContaining([
      expect.objectContaining({ axis: 'x', position: 100, kind: 'start' }),
      expect.objectContaining({ axis: 'y', position: 100, kind: 'start' }),
    ]))
  })

  it('snaps center and end anchors for differently sized nodes', () => {
    const center = calculateAlignmentSnap(
      box('dragged', 156, 44, 80, 60),
      [box('reference', 100, 120, 200, 100)],
      8,
    )
    const end = calculateAlignmentSnap(
      box('dragged', 214, 158, 80, 60),
      [box('reference', 100, 120, 200, 100)],
      8,
    )

    expect(center.x).toBe(160)
    expect(center.guides).toContainEqual(expect.objectContaining({ axis: 'x', kind: 'center', position: 200 }))
    expect(end.x).toBe(220)
    expect(end.y).toBe(160)
    expect(end.guides).toEqual(expect.arrayContaining([
      expect.objectContaining({ axis: 'x', kind: 'end', position: 300 }),
      expect.objectContaining({ axis: 'y', kind: 'end', position: 220 }),
    ]))
  })

  it('leaves the node unchanged outside the threshold', () => {
    const result = calculateAlignmentSnap(box('dragged', 111, 112), [box('reference', 100, 100)], 8)

    expect(result).toEqual({ x: 111, y: 112, guides: [] })
  })

  it('chooses the nearest eligible alignment', () => {
    const result = calculateAlignmentSnap(
      box('dragged', 107, 300),
      [box('far', 100, 20), box('near', 104, 180)],
      8,
    )

    expect(result.x).toBe(104)
    expect(result.guides).toContainEqual(expect.objectContaining({ axis: 'x', position: 104 }))
  })
})
