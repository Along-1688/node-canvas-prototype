import { defaultVideoGenerationParams } from './videoGeneration'
import { imageMediaForVariant } from './mediaMetadata'
import type { CanvasFlowEdge, CanvasFlowNode, CanvasNodeData, GenerationReferenceRole, ImageGenerationParams, MediaNodeType } from './types'

export type StarterExampleId = 'text-to-video' | 'image-background' | 'first-frame-video' | 'audio-to-video'

export const starterExamples: Array<{
  id: StarterExampleId
  label: string
  sourceType: MediaNodeType
  targetType: MediaNodeType
}> = [
  { id: 'text-to-video', label: '文字生视频', sourceType: 'text', targetType: 'video' },
  { id: 'image-background', label: '图片换背景', sourceType: 'image', targetType: 'image' },
  { id: 'first-frame-video', label: '首帧生视频', sourceType: 'image', targetType: 'video' },
  { id: 'audio-to-video', label: '音频生视频', sourceType: 'audio', targetType: 'video' },
]

const imageGeneration: ImageGenerationParams = {
  ratio: '16:9',
  resolution: '2K',
  count: 1,
  styleCategory: 'all',
  camera: { body: 'Red V-Raptor', lens: 'Arri Signature Prime', focalLength: '24mm', aperture: 'f/4' },
  enhancePrompt: false,
  webSearch: false,
}

function videoTargetData(title: string, prompt: string, modeId: 'first-frame' | 'reference' = 'first-frame'): CanvasNodeData {
  return {
    nodeType: 'video',
    title,
    status: 'idle',
    sourceKind: 'created',
    content: '',
    localPrompt: prompt,
    modeId,
    modelId: 'kling-o1',
    params: { ...defaultVideoGenerationParams() },
    videoGeneration: defaultVideoGenerationParams(),
    duration: 8,
    cost: 35,
  }
}

function imageTargetData(): CanvasNodeData {
  return {
    nodeType: 'image',
    title: '海边咖啡馆背景',
    status: 'idle',
    sourceKind: 'created',
    content: '',
    localPrompt: '保留人物和服装，将背景替换为清晨的海边咖啡馆，光线自然。',
    modeId: 'text-to-image',
    modelId: 'seedream-3',
    imageGeneration: structuredClone(imageGeneration),
    favorite: false,
    cost: 18,
  }
}

export function buildStarterExample(exampleId: StarterExampleId, seed: string): { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[] } {
  const sourceId = `starter-${exampleId}-source-${seed}`
  const targetId = `starter-${exampleId}-target-${seed}`
  let source: CanvasFlowNode
  let target: CanvasFlowNode
  let inputRole: GenerationReferenceRole = 'default'

  if (exampleId === 'text-to-video') {
    source = {
      id: sourceId,
      type: 'text',
      position: { x: 120, y: 220 },
      style: { width: 290, height: 176 },
      data: {
        nodeType: 'text',
        title: '雨夜骑行脚本',
        status: 'success',
        sourceKind: 'created',
        content: '雨夜的城市街道，骑行者穿过霓虹和湿漉路面，镜头跟随车轮快速推进。',
        backgroundColor: 'default',
        textFormat: { block: 'body', bold: false, italic: false },
      },
    }
    target = { id: targetId, type: 'video', position: { x: 540, y: 180 }, selected: true, data: videoTargetData('雨夜骑行视频', '节奏逐渐加快，保留路面倒影与车灯轨迹。') }
  } else if (exampleId === 'image-background') {
    source = {
      id: sourceId,
      type: 'image',
      position: { x: 150, y: 170 },
      data: {
        nodeType: 'image',
        title: '街拍人像',
        status: 'success',
        sourceKind: 'asset',
        content: '户外街拍人像',
        mediaVariant: 'ip',
        media: imageMediaForVariant('ip'),
        starterReplaceable: true,
        favorite: false,
      },
    }
    target = { id: targetId, type: 'image', position: { x: 620, y: 170 }, selected: true, data: imageTargetData() }
  } else if (exampleId === 'first-frame-video') {
    source = {
      id: sourceId,
      type: 'image',
      position: { x: 150, y: 170 },
      data: {
        nodeType: 'image',
        title: '樱花列车首帧',
        status: 'success',
        sourceKind: 'asset',
        content: '傍晚的樱花城市列车站',
        mediaVariant: 'anime',
        media: imageMediaForVariant('anime'),
        starterReplaceable: true,
        favorite: false,
      },
    }
    target = { id: targetId, type: 'video', position: { x: 620, y: 150 }, selected: true, data: videoTargetData('樱花列车短片', '镜头缓慢向前，列车驶入站台，花瓣被气流卷起。') }
    inputRole = 'first-frame'
  } else {
    source = {
      id: sourceId,
      type: 'audio',
      position: { x: 130, y: 250 },
      data: {
        nodeType: 'audio',
        title: '清晨城市氛围音',
        status: 'success',
        sourceKind: 'asset',
        content: '轻快鼓点、远处车流与早鸟环境声',
        mediaVariant: 'audio',
        duration: 12,
      },
    }
    target = { id: targetId, type: 'video', position: { x: 560, y: 170 }, selected: true, data: videoTargetData('清晨城市短片', '根据音乐节拍切换早晨街景、咖啡店开门与行人出发的画面。', 'reference') }
  }

  const edge: CanvasFlowEdge = {
    id: `starter-edge-${exampleId}-${seed}`,
    source: sourceId,
    sourceHandle: 'output',
    target: targetId,
    targetHandle: 'input',
    type: 'canvas',
    data: { relationType: 'generation-input', inputRole },
  }
  return { nodes: [source, target], edges: [edge] }
}
