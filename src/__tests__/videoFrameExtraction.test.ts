import { describe, expect, it } from 'vitest'
import { videoFrameCanvasSize } from '../videoFrameExtraction'

describe('uploaded video frame extraction', () => {
  it('keeps landscape and portrait aspect ratios within the frame budget', () => {
    expect(videoFrameCanvasSize(1280, 720)).toEqual({ width: 480, height: 270 })
    expect(videoFrameCanvasSize(1248, 1664)).toEqual({ width: 360, height: 480 })
  })

  it('does not enlarge video frames that are already below the frame budget', () => {
    expect(videoFrameCanvasSize(320, 180)).toEqual({ width: 320, height: 180 })
  })
})
