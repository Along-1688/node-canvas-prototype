import { describe, expect, it } from 'vitest'
import { HOST_VIDEO_MEDIA, LANDSCAPE_VIDEO_MEDIA, imageMediaForVariant } from '../mediaMetadata'

describe('prototype media metadata', () => {
  it('records the real dimensions of every built-in image asset', () => {
    expect(imageMediaForVariant('anime')).toMatchObject({ width: 1088, height: 608 })
    expect(imageMediaForVariant('dog')).toMatchObject({ width: 1280, height: 720 })
    expect(imageMediaForVariant('poster')).toMatchObject({ width: 1280, height: 720 })
    expect(imageMediaForVariant('ip')).toMatchObject({ width: 852, height: 1280 })
  })

  it('keeps portrait and landscape timeline frames attached to their own media', () => {
    expect(HOST_VIDEO_MEDIA.timelineFrameUrls).toHaveLength(5)
    expect(HOST_VIDEO_MEDIA.timelineFrameUrls?.every((url) => url.includes('virtual-ip-host'))).toBe(true)
    expect(LANDSCAPE_VIDEO_MEDIA.timelineFrameUrls).toHaveLength(5)
    expect(LANDSCAPE_VIDEO_MEDIA.timelineFrameUrls?.every((url) => url.includes('demo-landscape'))).toBe(true)
  })
})
