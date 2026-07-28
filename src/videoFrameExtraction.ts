import { videoTimelineTimes } from './videoGeneration'

const DEFAULT_FRAME_MAX_EDGE = 480
const FRAME_WAIT_TIMEOUT_MS = 2500

export function videoFrameCanvasSize(width: number, height: number, maxEdge = DEFAULT_FRAME_MAX_EDGE) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 16
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 9
  const scale = Math.min(1, maxEdge / Math.max(safeWidth, safeHeight))
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  }
}

function waitForFrameData(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('Timed out while loading a video frame')), FRAME_WAIT_TIMEOUT_MS)
    const finish = (error?: Error) => {
      window.clearTimeout(timeout)
      video.removeEventListener('loadeddata', onLoadedData)
      video.removeEventListener('error', onError)
      if (error) reject(error)
      else resolve()
    }
    const onLoadedData = () => finish()
    const onError = () => finish(new Error('Unable to load video frame data'))
    video.addEventListener('loadeddata', onLoadedData, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

function seekToFrame(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < 0.015 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('Timed out while seeking video')), FRAME_WAIT_TIMEOUT_MS)
    const finish = (error?: Error) => {
      window.clearTimeout(timeout)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      if (error) reject(error)
      else resolve()
    }
    const onSeeked = () => finish()
    const onError = () => finish(new Error('Unable to seek video'))
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.currentTime = time
  })
}

function captureCurrentFrame(video: HTMLVideoElement) {
  const canvas = document.createElement('canvas')
  const size = videoFrameCanvasSize(video.videoWidth, video.videoHeight)
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) return undefined
  context.drawImage(video, 0, 0, size.width, size.height)
  return canvas.toDataURL('image/jpeg', 0.78)
}

export async function extractVideoTimelineFrames(video: HTMLVideoElement, frameCount = 5) {
  if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) return []
  const originalTime = video.currentTime
  const frames: string[] = []
  try {
    await waitForFrameData(video)
    for (const time of videoTimelineTimes(video.duration, frameCount)) {
      await seekToFrame(video, time)
      const frame = captureCurrentFrame(video)
      if (frame) frames.push(frame)
    }
  } catch {
    return frames
  } finally {
    if (Number.isFinite(originalTime)) video.currentTime = originalTime
  }
  return frames
}
