import { createContext, useContext } from 'react'
import type {
  CanvasNodeData,
  CanvasFlowNode,
  AudioOperationResult,
  GenerationReferenceRole,
  ImageGenerationParams,
  ImageOperation,
  ImageOperationResult,
  PromptAssetReference,
  PromptMarker,
  VideoGenerationMode,
  VideoOperation,
  VideoOperationResult,
} from './types'
import type { TextModelId } from './textModelClient'

export type CanvasInteractionMode =
  | { kind: 'reference'; targetNodeId: string; replaceEdgeId?: string; role?: GenerationReferenceRole }
  | { kind: 'marker'; targetNodeId: string; promptOffset: number }
  | { kind: 'playlist-clips'; playlistId: string }
  | null

interface CanvasActions {
  updateNode: (nodeId: string, patch: Partial<CanvasNodeData>) => void
  changeTextModel: (nodeId: string, modelId: TextModelId, localPrompt: string) => void
  renameNode: (nodeId: string, title: string) => void
  runGeneration: (nodeId: string) => void
  retryGeneration: (nodeId: string) => void
  deleteEdge: (edgeId: string) => void
  createImageDerivative: (nodeId: string, operation: ImageOperation, result: ImageOperationResult) => void
  prepareImageEditor: (nodeId: string, operation: Extract<ImageOperation, 'rotate' | 'edit-text'>) => void
  completeImageEditor: (nodeId: string, patch?: Partial<ImageOperationResult>) => void
  cancelPendingImageEditor: (nodeId: string) => void
  prepareImageUpscale: (nodeId: string) => void
  completeImageUpscale: (nodeId: string, resolution: '2K' | '4K' | '6K') => void
  regenerateImage: (nodeId: string, prompt: string, params: ImageGenerationParams) => void
  prepareVideoOperation: (nodeId: string, operation: Exclude<VideoOperation, 'lip-sync'>) => void
  cancelPendingVideoOperation: (nodeId: string) => void
  completeVideoOperation: (nodeId: string, result: VideoOperationResult) => void
  createLipSyncDerivative: (nodeId: string, result: Extract<VideoOperationResult, { operation: 'lip-sync' }>) => void
  completeVideoEdit: (nodeId: string, result: Extract<VideoOperationResult, { operation: 'edit' }>) => void
  createAudioTrimDerivative: (nodeId: string, result: AudioOperationResult) => void
  uploadNodeMedia: (nodeId: string, file: File) => void
  openImageEditor: (nodeId: string) => void
  openContinuation: (nodeId: string, clientX: number, clientY: number) => void
  openContextAdd: (nodeId: string, clientX: number, clientY: number) => void
  beginReferenceSelection: (targetNodeId: string, replaceSourceNodeId?: string, role?: GenerationReferenceRole) => void
  changeVideoGenerationMode: (nodeId: string, mode: VideoGenerationMode) => void
  beginMarkerSelection: (targetNodeId: string) => void
  removeReference: (targetNodeId: string, sourceNodeId: string) => void
  hoverReference: (sourceNodeId: string | null) => void
  addPromptMarker: (targetNodeId: string, sourceNodeId: string, x: number, y: number) => void
  updatePromptMarker: (targetNodeId: string, markerId: string, label?: string) => void
  markersForSource: (sourceNodeId: string) => PromptMarker[]
  hoveredPromptMarkerId: string | null
  hoverPromptMarker: (markerId: string | null) => void
  interactionMode: CanvasInteractionMode
  isInteractionCandidate: (nodeId: string) => boolean
  selectedItemCount: number
  isConnectionTargetCandidate: (nodeId: string) => boolean
  exitInteractionMode: () => void
  videoEditAssets: PromptAssetReference[]
  seedanceComplianceAssets: CanvasFlowNode[]
  notify: (message: string) => void
}

export const CanvasActionContext = createContext<CanvasActions | null>(null)

export function useCanvasActions() {
  const value = useContext(CanvasActionContext)
  if (!value) throw new Error('useCanvasActions must be used inside CanvasActionContext')
  return value
}
