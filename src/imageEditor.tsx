import { useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type {
  ImageEditorAsset,
  ImageEditorCommitPayload,
  ImageEditorCommitResult,
  ImageEditorComposition,
  ImageEditorGenerateRequest,
  ImageEditorLayer,
} from './types'
import { normalizeImageEditorComposition } from './imageEditorModel'
import { ImageEditorWorkspace as ImageEditorWorkspaceSurface } from './imageEditorWorkspace'

export type { ImageEditorAsset } from './types'
export * from './imageEditorModel'

export interface ImageEditorWorkspaceProps {
  source?: ImageEditorAsset
  assets: ImageEditorAsset[]
  /** Images linked to the editor node when this is a new, unsaved project. */
  initialAssets?: ImageEditorAsset[]
  historyAssets?: ImageEditorAsset[]
  initialComposition?: ImageEditorComposition
  onClose: () => void
  onSave: (payload: ImageEditorCommitPayload) => ImageEditorCommitResult | Promise<ImageEditorCommitResult>
  onGenerate?: (request: ImageEditorGenerateRequest) => void | Promise<void>
}

const renderedPreviewStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
}

function layerStyle(layer: Extract<ImageEditorLayer, { x: number; y: number; width: number; height: number }>): CSSProperties {
  return {
    left: `${layer.x}%`,
    top: `${layer.y}%`,
    width: `${layer.width}%`,
    height: `${layer.height}%`,
    transform: `translate(-50%, -50%) rotate(${layer.rotation ?? 0}deg)`,
  }
}

function textLayerStyle(layer: Extract<ImageEditorLayer, { kind: 'text' }>): CSSProperties {
  return {
    ...layerStyle(layer),
    color: layer.color,
    fontFamily: layer.fontFamily ?? 'Open Sans, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
    fontSize: `${layer.fontSize}px`,
    fontStyle: layer.fontStyle ?? 'normal',
    fontWeight: layer.weight,
    letterSpacing: `${layer.letterSpacing ?? 0}px`,
    textAlign: layer.textAlign ?? 'left',
    textDecoration: [layer.underline ? 'underline' : '', layer.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
  }
}

function BrushLayer({ layer }: { layer: Extract<ImageEditorLayer, { kind: 'brush' }> }) {
  if (layer.points.length < 2) return null
  const points = layer.points.map((point) => `${point.x},${point.y}`).join(' ')
  return (
    <svg className="image-editor-brush-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={layer.color} strokeWidth={layer.size} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowLayer({ layer }: { layer: Extract<ImageEditorLayer, { kind: 'arrow' }> }) {
  return (
    <svg className="image-editor-arrow-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M7 88 L91 12 M68 12 H91 V34" fill="none" stroke={layer.color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ShapeGraphic({ shape, fill, stroke }: Pick<Extract<ImageEditorLayer, { kind: 'shape' }>, 'shape' | 'fill' | 'stroke'>) {
  if (shape === 'line') {
    return <svg className="image-editor-shape-graphic line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M7 50 H93" fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round" /></svg>
  }
  if (shape === 'star') {
    return <svg className="image-editor-shape-graphic" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 7 61 37 93 38 68 58 77 90 50 72 23 90 32 58 7 38 39 37Z" fill={fill} stroke={stroke} strokeWidth="5" strokeLinejoin="round" /></svg>
  }
  if (shape === 'speech') {
    return <svg className="image-editor-shape-graphic" viewBox="0 0 100 100" aria-hidden="true"><path d="M11 13H89V68H56L39 88V68H11Z" fill={fill} stroke={stroke} strokeWidth="5" strokeLinejoin="round" /></svg>
  }
  if (shape === 'sparkles') {
    return <svg className="image-editor-shape-graphic" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 5 58 35 86 43 58 51 50 84 42 51 14 43 42 35Z M78 63 82 77 96 81 82 85 78 99 74 85 60 81 74 77Z M22 5 25 15 35 18 25 21 22 31 19 21 9 18 19 15Z" fill={fill} stroke={stroke} strokeWidth="4" strokeLinejoin="round" /></svg>
  }
  return <i className={`image-editor-shape-graphic ${shape}`} style={{ background: fill, borderColor: stroke }} aria-hidden="true" />
}

function LegacyCompositionLayers({ layers }: { layers: ImageEditorLayer[] }) {
  return layers.map((layer) => {
    if (layer.kind === 'image') {
      return <img key={layer.id} className="image-editor-preview-layer image-editor-preview-image" style={layerStyle(layer)} src={layer.src} alt="" />
    }
    if (layer.kind === 'shape') {
      return <span key={layer.id} className={`image-editor-preview-layer image-editor-preview-shape ${layer.shape}`} style={layerStyle(layer)}><ShapeGraphic {...layer} /></span>
    }
    if (layer.kind === 'arrow') {
      return <span key={layer.id} className="image-editor-preview-layer image-editor-preview-arrow" style={layerStyle(layer)}><ArrowLayer layer={layer} /></span>
    }
    if (layer.kind === 'brush') return <BrushLayer key={layer.id} layer={layer} />
    return <span key={layer.id} className="image-editor-preview-layer image-editor-preview-text" style={textLayerStyle(layer)}>{layer.text}</span>
  })
}

export function ImageEditorCompositionPreview({
  composition,
  className = '',
}: {
  composition: ImageEditorComposition
  className?: string
}) {
  const rootClassName = ['image-editor-composition-preview', className].filter(Boolean).join(' ')
  return (
    <div className={rootClassName} style={{ backgroundColor: composition.backgroundColor }}>
      {composition.renderedDataUrl
        ? <img className="image-editor-rendered-preview" src={composition.renderedDataUrl} alt="" draggable={false} style={renderedPreviewStyle} />
        : <LegacyCompositionLayers layers={composition.layers ?? []} />}
    </div>
  )
}

export function ImageEditorWorkspace(props: ImageEditorWorkspaceProps) {
  const initialComposition = useMemo(
    () => props.initialComposition
      ? normalizeImageEditorComposition(props.initialComposition, props.source)
      : undefined,
    [props.initialComposition, props.source],
  )
  useEffect(() => {
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      window.requestAnimationFrame(() => {
        if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true })
      })
    }
  }, [])
  return createPortal(
    <ImageEditorWorkspaceSurface {...props} initialComposition={initialComposition} />,
    document.body,
  )
}
