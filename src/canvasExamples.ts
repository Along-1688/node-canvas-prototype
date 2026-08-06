import { defaultVideoGenerationParams } from './videoGeneration'
import { imageMediaForVariant } from './mediaMetadata'
import { DEFAULT_TEXT_MODEL_ID } from './textModelClient'
import type { CanvasFlowEdge, CanvasFlowNode, CanvasNodeData, GenerationReferenceRole, ImageGenerationParams, MediaNodeType } from './types'

export type StarterExampleId = 'story-script' | 'image-background' | 'first-frame-video' | 'audio-to-video'

export const starterExamples: Array<{
  id: StarterExampleId
  label: string
  sourceType: MediaNodeType
  targetType: MediaNodeType
  iconType: MediaNodeType
  artworkUrl: string
  artworkPosition: string
}> = [
  { id: 'story-script', label: '故事脚本生成', sourceType: 'text', targetType: 'text', iconType: 'text', artworkUrl: '/node-canvas-prototype/assets/starter/text-to-video.jpg', artworkPosition: 'center 52%' },
  { id: 'image-background', label: '图片换背景', sourceType: 'image', targetType: 'image', iconType: 'image', artworkUrl: '/node-canvas-prototype/assets/starter/image-background.jpg', artworkPosition: 'center top' },
  { id: 'first-frame-video', label: '首帧图生视频', sourceType: 'image', targetType: 'video', iconType: 'video', artworkUrl: '/node-canvas-prototype/assets/starter/first-frame-video.jpg', artworkPosition: 'center 44%' },
  { id: 'audio-to-video', label: '音频生视频', sourceType: 'audio', targetType: 'video', iconType: 'audio', artworkUrl: '/node-canvas-prototype/assets/starter/audio-to-video.jpg', artworkPosition: 'center top' },
]

const storyDraft = `《带着 AI 重返 80 年代》第一集

总时长：60 秒
人物：林晓（现代青年）、青年母亲（1986 年）、AI（手环机械音）
场景：80 年代红砖家属院，二八自行车、晾衣绳、老式收音机

0-10s（10s）
白光爆闪，林晓踉跄落地，手腕 AI 手环蓝光频闪，耳边是复古流行歌。林晓慌张张望：时空测试翻车了？AI：定位 1986 年，穿梭成功，信号不稳，部分功能受限。

10-27s（17s，累计 27s）
扎麻花辫、穿碎花衫的年轻母亲拎搪瓷脸盆路过，疑惑打量林晓。母亲：小姑娘，哪家的？从没见过你。林晓攥紧手环，声音发颤：我……迷路了。

27-42s（15s，累计 42s）
手环私自出声。AI：匹配成功，目标是你的生母，现年 20 岁。检测：三年后她将遭遇重大健康隐患。母亲好奇凑近，林晓慌忙捂住手环。

42-53s（11s，累计 53s）
林晓心绪大乱，指尖反复摩挲手环。林晓（内心呢喃）：原来隐患在这个时间点，我到底能不能提醒她？AI 弹出提示：干预过往会引发未知时空风险。`

const portraitBackgroundPrompt = '黑西装黑衬衫墨镜男士，姿态不拘束，搭建全新户外或室内场景，时尚杂志人像布光，立体轮廓光，高清写实，构图舒展，画面干净富有高级感。'

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
    title: '黑西装男士场景图',
    status: 'idle',
    sourceKind: 'created',
    content: '',
    localPrompt: portraitBackgroundPrompt,
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

  if (exampleId === 'story-script') {
    source = {
      id: sourceId,
      type: 'text',
      position: { x: 110, y: 170 },
      style: { width: 320, height: 240 },
      data: {
        nodeType: 'text',
        title: '《带着 AI 重返 80 年代》',
        status: 'success',
        sourceKind: 'created',
        content: storyDraft,
        backgroundColor: 'default',
        textFormat: { block: 'body', bold: false, italic: false },
      },
    }
    target = {
      id: targetId,
      type: 'text',
      position: { x: 570, y: 170 },
      selected: true,
      style: { width: 320, height: 240 },
      data: {
        nodeType: 'text',
        title: '完整故事脚本',
        status: 'idle',
        sourceKind: 'created',
        content: '',
        localPrompt: '根据我上传的剧本生成一个完整的故事脚本',
        modeId: 'generate-copy',
        modelId: DEFAULT_TEXT_MODEL_ID,
        cost: 1,
        backgroundColor: 'default',
        textFormat: { block: 'body', bold: false, italic: false },
      },
    }
  } else if (exampleId === 'image-background') {
    source = {
      id: sourceId,
      type: 'image',
      position: { x: 150, y: 170 },
      data: {
        nodeType: 'image',
        title: '黑西装男士人像',
        status: 'success',
        sourceKind: 'asset',
        content: '黑西装、黑衬衫与墨镜男士棚拍人像',
        media: { url: '/node-canvas-prototype/assets/starter/image-background-source.jpg', mimeType: 'image/jpeg', width: 1280, height: 720 },
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
    target = { id: targetId, type: 'video', position: { x: 620, y: 150 }, selected: true, data: videoTargetData('首帧生成视频', '根据图片生成视频。', 'reference') }
    inputRole = 'reference'
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
