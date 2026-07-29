import type {
  CanvasFlowEdge,
  CanvasFlowNode,
  GenerationDefinition,
  GenerationTask,
  ModelParameter,
  VideoModelCapability,
  VideoModeOptionDefinition,
} from './types'
import { cloneMediaMetadata, HOST_VIDEO_MEDIA, imageMediaForVariant, LANDSCAPE_VIDEO_MEDIA } from './mediaMetadata'

export const videoModeOptions: VideoModeOptionDefinition[] = [
  { id: 'first-frame', label: '首帧', hint: '使用一张图片控制视频起始画面' },
  { id: 'first-last-frame', label: '首尾帧', hint: '使用两张图片控制起始与结束画面' },
  { id: 'reference', label: '全能参考', hint: '综合参考画面、角色与风格' },
]

export const videoModelCapabilities: VideoModelCapability[] = [
  {
    id: 'seedance-2',
    label: 'Seedance 2.0',
    badge: '合规',
    hint: '支持合规素材库与角色一致性生成',
    supportedModes: ['first-frame', 'first-last-frame', 'reference'],
    ratios: ['auto', '1:1', '9:16', '16:9', '3:4', '4:3', '21:9'],
    resolutions: ['480p', '720p', '1080p', '4K'],
    maxDuration: 15,
  },
  {
    id: 'kling-o1',
    label: 'Kling O1',
    badge: '默认',
    hint: '适合首帧、首尾帧与稳定镜头生成',
    supportedModes: ['first-frame', 'first-last-frame', 'reference'],
    ratios: ['auto', '1:1', '9:16', '16:9', '3:4', '4:3'],
    resolutions: ['480p', '720p', '1080p'],
    maxDuration: 10,
  },
  {
    id: 'video-model-b',
    label: '视频模型 B（示例）',
    badge: '15s',
    hint: '支持完整比例、4K 和 15 秒生成',
    supportedModes: ['first-frame', 'first-last-frame', 'reference'],
    ratios: ['auto', '1:1', '9:16', '16:9', '3:4', '4:3', '21:9'],
    resolutions: ['480p', '720p', '1080p', '4K'],
    maxDuration: 15,
  },
]

const videoParameters = [
  { id: 'ratio', label: '画面比例', type: 'select' as const, options: [{ label: '智能', value: 'auto' }, { label: '1:1', value: '1:1' }, { label: '9:16', value: '9:16' }, { label: '16:9', value: '16:9' }, { label: '3:4', value: '3:4' }, { label: '4:3', value: '4:3' }, { label: '21:9', value: '21:9' }], defaultValue: 'auto' },
  { id: 'resolution', label: '分辨率', type: 'select' as const, options: [{ label: '480p', value: '480p' }, { label: '720p', value: '720p' }, { label: '1080p', value: '1080p' }, { label: '4K', value: '4K' }], defaultValue: '720p' },
  { id: 'count', label: '数量', type: 'select' as const, options: [{ label: '1 个', value: 1 }, { label: '2 个', value: 2 }, { label: '3 个', value: 3 }, { label: '4 个', value: 4 }], defaultValue: 1 },
  { id: 'duration', label: '时长', type: 'number' as const, defaultValue: 8 },
]

function videoParametersFor(capability: VideoModelCapability): ModelParameter[] {
  return videoParameters.map((parameter) => {
    if (parameter.id === 'ratio') {
      return { ...parameter, options: parameter.options?.filter((option) => capability.ratios.includes(option.value as VideoModelCapability['ratios'][number])) }
    }
    if (parameter.id === 'resolution') {
      return { ...parameter, options: parameter.options?.filter((option) => capability.resolutions.includes(option.value as VideoModelCapability['resolutions'][number])) }
    }
    return { ...parameter }
  })
}

export const generationDefinitions: GenerationDefinition[] = [
  {
    nodeType: 'image',
    modes: [
      {
        id: 'text-to-image',
        label: '文生图',
        models: [
          {
            id: 'seedream-3',
            label: 'Seedream 3.0',
            parameters: [
              { id: 'ratio', label: '画面比例', type: 'select', options: [{ label: '1:1', value: '1:1' }, { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' }], defaultValue: '1:1' },
              { id: 'quality', label: '清晰度', type: 'select', options: [{ label: '标准', value: 'standard' }, { label: '高清 2K', value: '2k' }], defaultValue: '2k' },
              { id: 'count', label: '张数', type: 'select', options: [{ label: '1 张', value: 1 }, { label: '2 张', value: 2 }, { label: '4 张', value: 4 }], defaultValue: 2 },
            ],
          },
          { id: 'universal-image', label: '万能模型 pro', parameters: [{ id: 'ratio', label: '画面比例', type: 'select', options: [{ label: '自适应', value: 'auto' }, { label: '16:9', value: '16:9' }], defaultValue: 'auto' }] },
        ],
      },
      { id: 'image-edit', label: '图片编辑', models: [{ id: 'universal-edit', label: '万能编辑模型', parameters: [{ id: 'strength', label: '参考强度', type: 'select', options: [{ label: '弱', value: 'low' }, { label: '中', value: 'medium' }, { label: '强', value: 'high' }], defaultValue: 'medium' }] }] },
    ],
  },
  {
    nodeType: 'video',
    modes: videoModeOptions.map((mode) => ({
      id: mode.id,
      label: mode.label,
      models: videoModelCapabilities
        .filter((model) => model.supportedModes.includes(mode.id))
        .map((model) => ({ id: model.id, label: model.label, parameters: videoParametersFor(model) })),
    })),
  },
  {
    nodeType: 'audio',
    modes: [
      {
        id: 'audio-generate',
        label: '音频生成',
        models: [
          { id: 'seed-audio-1', label: 'Seed Audio 1.0', parameters: [{ id: 'speed', label: '语速', type: 'select', options: [{ label: '0.8×', value: 0.8 }, { label: '1.0×', value: 1 }, { label: '1.2×', value: 1.2 }], defaultValue: 1 }] },
          { id: 'mureka-9', label: 'Mureka-9', parameters: [{ id: 'musicType', label: '音乐类型', type: 'select', options: [{ label: '音乐', value: 'music' }, { label: '配乐', value: 'score' }], defaultValue: 'music' }, { id: 'lyricMode', label: '歌词模式', type: 'select', options: [{ label: '智能模式', value: 'smart' }, { label: '固定歌词', value: 'fixed' }, { label: '纯音乐', value: 'instrumental' }], defaultValue: 'smart' }] },
          { id: 'minimax-speech-2.8', label: 'MiniMax Speech-2.8 HD', parameters: [{ id: 'voiceLabel', label: '音色', type: 'select', options: [{ label: '淡雅学姐', value: '淡雅学姐' }], defaultValue: '淡雅学姐' }] },
        ],
      },
    ],
  },
  {
    nodeType: 'text',
    modes: [
      { id: 'generate-copy', label: '文本生成', models: [{ id: 'gemini-flash-lite', label: 'Gemini 3.1 Flash Lite', parameters: [] }] },
    ],
  },
]

export const initialNodes: CanvasFlowNode[] = [
  {
    id: 'text-prompt',
    type: 'text',
    position: { x: 90, y: 170 },
    data: {
      nodeType: 'text',
      title: '樱花城市提示词',
      status: 'ready',
      sourceKind: 'created',
      content: '傍晚的未来城市，樱花沿街盛开，潮湿路面映出暖色霓虹，画面安静、通透。',
      backgroundColor: 'default',
      textFormat: { block: 'body', bold: false, italic: false },
    },
    style: { width: 290, height: 176 },
  },
  {
    id: 'image-generated',
    type: 'image',
    position: { x: 510, y: 120 },
    selected: false,
    data: {
      nodeType: 'image',
      title: '樱花城市 01',
      status: 'success',
      sourceKind: 'generated',
      content: '未来城市樱花街景',
      mediaVariant: 'anime',
      media: imageMediaForVariant('anime'),
      favorite: false,
      promptHistory: [
        '傍晚的未来城市，樱花沿街盛开，潮湿路面映出暖色霓虹，画面安静、通透。',
        '未来城市街道，樱花与霓虹灯，电影级构图。',
      ],
      modelId: 'seedream-3',
      params: { ratio: '16:9', quality: '2K' },
      imageGeneration: {
        ratio: '16:9', resolution: '2K', count: 1, styleCategory: 'all', enhancePrompt: false, webSearch: false,
        camera: { body: 'Red V-Raptor', lens: 'Arri Signature Prime', focalLength: '24mm', aperture: 'f/4' },
      },
      cost: 18,
    },
  },
  {
    id: 'image-relight',
    type: 'image',
    position: { x: 1010, y: 170 },
    data: {
      nodeType: 'image',
      title: '暖光版本',
      status: 'success',
      sourceKind: 'generated',
      content: '暖色主光的樱花街景',
      mediaVariant: 'anime',
      media: imageMediaForVariant('anime'),
      favorite: false,
      imageOperation: {
        operation: 'relight',
        brightness: 18,
        temperature: 24,
        lightPosition: '右上',
        secondaryLight: true,
      },
    },
  },
  {
    id: 'image-upload',
    type: 'image',
    position: { x: 110, y: 500 },
    data: {
      nodeType: 'image',
      title: '上传参考图',
      status: 'success',
      sourceKind: 'upload',
      content: '柴犬棚拍参考图',
      mediaVariant: 'dog',
      media: imageMediaForVariant('dog'),
      favorite: false,
    },
  },
  {
    id: 'image-text-poster',
    type: 'image',
    position: { x: 1010, y: 540 },
    data: {
      nodeType: 'image',
      title: '世界杯决赛海报',
      status: 'success',
      sourceKind: 'upload',
      content: '世界杯决赛宣传海报',
      mediaVariant: 'poster',
      media: imageMediaForVariant('poster'),
      favorite: false,
      detectedTextLayers: ['决战巅峰', '世界杯决赛', '阿根廷 VS 法国', '12月18日 23:00'],
    },
  },
  {
    id: 'video-host-demo',
    type: 'video',
    position: { x: 520, y: 520 },
    data: {
      nodeType: 'video',
      title: '主播探店视频 01',
      status: 'success',
      sourceKind: 'generated',
      content: '主播出镜并切换街边场景的竖屏视频',
      localPrompt: '保持主播自然口播节奏，街边镜头转场流畅。',
      modeId: 'reference',
      modelId: 'kling-o1',
      params: { ratio: '3:4', resolution: '720p', count: 1, duration: 8, webSearch: false, generateAudio: true },
      videoGeneration: { ratio: '3:4', resolution: '720p', count: 1, duration: 8, webSearch: false, generateAudio: true },
      duration: 8.055,
      cost: 35,
      media: cloneMediaMetadata(HOST_VIDEO_MEDIA),
    },
  },
  {
    id: 'video-landscape-demo',
    type: 'video',
    position: { x: 520, y: 1060 },
    data: {
      nodeType: 'video',
      title: '横屏广告短片 01',
      status: 'success',
      sourceKind: 'upload',
      content: '用于横屏演示的 16:9 视频素材',
      localPrompt: '保持横屏构图与原片节奏，用于播放列表和 Seedance 2.0 演示。',
      modeId: 'reference',
      modelId: 'seedance-2',
      params: { ratio: '16:9', resolution: '720p', count: 1, duration: 8, webSearch: false, generateAudio: true },
      videoGeneration: { ratio: '16:9', resolution: '720p', count: 1, duration: 8, webSearch: false, generateAudio: true },
      duration: 8.042,
      media: cloneMediaMetadata(LANDSCAPE_VIDEO_MEDIA),
    },
  },
  {
    id: 'audio-node-welcome',
    type: 'audio',
    position: { x: 1010, y: 1060 },
    data: {
      nodeType: 'audio',
      title: '节点式画布欢迎语',
      status: 'success',
      sourceKind: 'upload',
      content: '欢迎来到节点式画布，你的 AI 创作助手。',
      modeId: 'audio-generate',
      modelId: 'seed-audio-1',
      params: { speed: 1, voiceId: 'elegant-senior', voiceLabel: '淡雅学姐' },
      duration: 3.816,
      cost: 12,
      media: { url: '/node-canvas-prototype/assets/node-canvas-welcome.mp3', mimeType: 'audio/mpeg', duration: 3.816, hasAudio: true },
    },
  },
  {
    id: 'image-review-failed',
    type: 'image',
    position: { x: 1510, y: 170 },
    data: {
      nodeType: 'image',
      title: '电影海报方案 02',
      status: 'failed',
      sourceKind: 'generated',
      content: '',
      localPrompt: '使用未授权的公众人物形象生成商业电影海报。',
      modelId: 'seedream-3',
      params: { ratio: '16:9', quality: '2K' },
      imageGeneration: {
        ratio: '16:9', resolution: '2K', count: 1, styleCategory: 'all', enhancePrompt: false, webSearch: false,
        camera: { body: 'Red V-Raptor', lens: 'Arri Signature Prime', focalLength: '24mm', aperture: 'f/4' },
      },
      favorite: false,
      cost: 18,
      error: '内容审核未通过：提示词包含未授权公众人物肖像，请替换为已授权素材后重试。',
    },
  },
  {
    id: 'video-timeout-failed',
    type: 'video',
    position: { x: 1510, y: 560 },
    data: {
      nodeType: 'video',
      title: '品牌预告片 02',
      status: 'failed',
      sourceKind: 'generated',
      content: '',
      localPrompt: '以世界杯海报为首帧，镜头缓慢推近并增加现场灯光。',
      modeId: 'first-frame',
      modelId: 'kling-o1',
      params: { ratio: '16:9', resolution: '720p', count: 1, duration: 8, webSearch: false, generateAudio: false },
      videoGeneration: { ratio: '16:9', resolution: '720p', count: 1, duration: 8, webSearch: false, generateAudio: false },
      duration: 8,
      cost: 35,
      error: '生成服务响应超时：当前配置已保留，请稍后直接重新生成。',
    },
  },
]

export const initialEdges: CanvasFlowEdge[] = [
  { id: 'text-to-image', source: 'text-prompt', sourceHandle: 'output', target: 'image-generated', targetHandle: 'input', type: 'canvas', animated: false, data: { relationType: 'generation-input' } },
  { id: 'image-relight-edge', source: 'image-generated', sourceHandle: 'output', target: 'image-relight', targetHandle: 'input', type: 'canvas', animated: false, data: { relationType: 'image-operation', operation: 'relight' } },
  { id: 'text-to-image-review-failed', source: 'text-prompt', sourceHandle: 'output', target: 'image-review-failed', targetHandle: 'input', type: 'canvas', animated: false, data: { relationType: 'generation-input' } },
  { id: 'poster-to-video-timeout-failed', source: 'image-text-poster', sourceHandle: 'output', target: 'video-timeout-failed', targetHandle: 'input', type: 'canvas', animated: false, data: { relationType: 'generation-input', inputRole: 'first-frame' } },
]

export const initialTasks: GenerationTask[] = [
  {
    id: 'task-image-review-failed',
    canvasId: 'canvas-1',
    nodeId: 'image-review-failed',
    nodeTitle: '电影海报方案 02',
    nodeType: 'image',
    status: 'failed',
    progress: 4,
    effectivePrompt: '使用未授权的公众人物形象生成商业电影海报。',
    inputReferenceIds: ['text-prompt'],
    imageGeneration: {
      ratio: '16:9', resolution: '2K', count: 1, styleCategory: 'all', enhancePrompt: false, webSearch: false,
      camera: { body: 'Red V-Raptor', lens: 'Arri Signature Prime', focalLength: '24mm', aperture: 'f/4' },
    },
    modelId: 'seedream-3',
    outputNodeIds: ['image-review-failed'],
    modelLabel: 'Seedream 3.0',
    cost: 18,
    error: '内容审核未通过：提示词包含未授权公众人物肖像，请替换为已授权素材后重试。',
    createdAt: '14:31',
  },
  {
    id: 'task-video-timeout-failed',
    canvasId: 'canvas-1',
    nodeId: 'video-timeout-failed',
    nodeTitle: '品牌预告片 02',
    nodeType: 'video',
    status: 'failed',
    progress: 72,
    effectivePrompt: '以世界杯海报为首帧，镜头缓慢推近并增加现场灯光。',
    inputReferenceIds: ['image-text-poster'],
    videoGeneration: { ratio: '16:9', resolution: '720p', count: 1, duration: 8, webSearch: false, generateAudio: false },
    modeId: 'first-frame',
    modelId: 'kling-o1',
    outputNodeIds: ['video-timeout-failed'],
    modelLabel: 'Kling O1',
    cost: 35,
    error: '生成服务响应超时：当前配置已保留，请稍后直接重新生成。',
    createdAt: '14:29',
  },
  {
    id: 'task-video-landscape-demo',
    canvasId: 'canvas-1',
    nodeId: 'video-landscape-demo',
    nodeTitle: '横屏广告短片 01',
    nodeType: 'video',
    status: 'success',
    progress: 100,
    effectivePrompt: '保持横屏构图与原片节奏。',
    videoGeneration: { ratio: '16:9', resolution: '720p', count: 1, duration: 8, webSearch: false, generateAudio: true },
    modeId: 'reference',
    modelId: 'seedance-2',
    outputNodeIds: ['video-landscape-demo'],
    outputMedia: cloneMediaMetadata(LANDSCAPE_VIDEO_MEDIA),
    modelLabel: 'Seedance 2.0',
    cost: 35,
    createdAt: '12:12',
  },
  {
    id: 'task-video-host-demo',
    canvasId: 'canvas-1',
    nodeId: 'video-host-demo',
    nodeTitle: '主播探店视频 01',
    nodeType: 'video',
    status: 'success',
    progress: 100,
    effectivePrompt: '保持主播自然口播节奏，街边镜头转场流畅。',
    videoGeneration: { ratio: '3:4', resolution: '720p', count: 1, duration: 8, webSearch: false, generateAudio: true },
    modeId: 'reference',
    modelId: 'kling-o1',
    outputNodeIds: ['video-host-demo'],
    outputMedia: cloneMediaMetadata(HOST_VIDEO_MEDIA),
    modelLabel: 'Kling O1',
    cost: 35,
    createdAt: '12:08',
  },
  {
    id: 'task-success',
    canvasId: 'canvas-1',
    nodeId: 'image-generated',
    nodeTitle: '樱花城市 01',
    nodeType: 'image',
    status: 'success',
    progress: 100,
    effectivePrompt: '傍晚的未来城市，樱花沿街盛开，潮湿路面映出暖色霓虹。',
    modelLabel: 'Seedream 3.0',
    cost: 18,
    createdAt: '14:26',
  },
]
