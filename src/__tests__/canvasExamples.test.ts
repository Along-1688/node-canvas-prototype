import { describe, expect, it } from 'vitest'
import { buildStarterExample, starterExamples, type StarterExampleId } from '../canvasExamples'

const cases: Array<{
  id: StarterExampleId
  sourceType: string
  targetType: string
  role: string
}> = [
  { id: 'text-to-video', sourceType: 'text', targetType: 'video', role: 'default' },
  { id: 'image-background', sourceType: 'image', targetType: 'image', role: 'default' },
  { id: 'first-frame-video', sourceType: 'image', targetType: 'video', role: 'first-frame' },
  { id: 'audio-to-video', sourceType: 'audio', targetType: 'video', role: 'default' },
]

describe('starter canvas examples', () => {
  it('exposes the four approved quick starts', () => {
    expect(starterExamples.map((example) => example.id)).toEqual(cases.map((example) => example.id))
  })

  it.each(cases)('builds $id as a connected source and target pair', ({ id, sourceType, targetType, role }) => {
    const result = buildStarterExample(id, 'test')
    expect(result.nodes).toHaveLength(2)
    expect(result.edges).toHaveLength(1)
    expect(result.nodes[0].data.nodeType).toBe(sourceType)
    expect(result.nodes[1].data.nodeType).toBe(targetType)
    expect(result.nodes[1].selected).toBe(true)
    expect(result.edges[0]).toMatchObject({
      source: result.nodes[0].id,
      sourceHandle: 'output',
      target: result.nodes[1].id,
      targetHandle: 'input',
      data: { inputRole: role },
    })
  })

  it('marks starter images as replaceable only when the source is an image', () => {
    expect(buildStarterExample('image-background', 'replace').nodes[0].data.starterReplaceable).toBe(true)
    expect(buildStarterExample('first-frame-video', 'replace').nodes[0].data.starterReplaceable).toBe(true)
    expect(buildStarterExample('text-to-video', 'replace').nodes[0].data.starterReplaceable).toBeUndefined()
  })
})
