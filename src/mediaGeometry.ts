export interface MediaBoxGeometry {
  width: number
  height: number
  ratio: number
}

export function formatMediaResolution(width?: number, height?: number) {
  if (!width || !height || width <= 0 || height <= 0) return null
  return `${Math.round(width)} × ${Math.round(height)}`
}

export function fitMediaAspect(width?: number, height?: number, maxWidth = 440, maxHeight = 480): MediaBoxGeometry {
  const ratio = width && height && width > 0 && height > 0 ? width / height : 16 / 9
  const fittedWidth = Math.min(maxWidth, maxHeight * ratio)
  return {
    width: Math.round(fittedWidth),
    height: Math.round(fittedWidth / ratio),
    ratio,
  }
}

export function batchMediaPosition(origin: { x: number; y: number }, index: number) {
  return {
    x: origin.x + (index % 2) * 500,
    y: origin.y + Math.floor(index / 2) * 560,
  }
}
