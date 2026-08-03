import type { CanvasNodeData } from './types'

/**
 * Assets represent model-generated results that can be reused independently.
 * Local uploads and image-editor projects stay on the canvas only.
 */
export function isImageEditorResult(data: CanvasNodeData) {
  const operation = data.imageOperation?.operation
  return operation === 'image-editor' || operation === 'image-compose'
}

export function canFavoriteMediaNode(data: CanvasNodeData) {
  return (data.nodeType === 'image' || data.nodeType === 'video')
    && data.sourceKind !== 'upload'
    && !isImageEditorResult(data)
}

export function shouldSyncNodeToAssets(data: CanvasNodeData) {
  return data.sourceKind === 'generated' && !isImageEditorResult(data)
}

/**
 * Local upload is only a fallback for a genuinely empty media node. Once a
 * generation-input edge exists, that upstream content is the node's input.
 */
export function canUploadToEmptyMediaNode(data: CanvasNodeData) {
  return (data.references?.length ?? 0) === 0
}
