import { describe, expect, it } from 'vitest';
import {
  buildVideoDerivativeData,
  buildVideoBatchPlan,
  buildVideoResultData,
  buildVideoTaskSnapshot,
  canUseAsVideoReference,
  defaultVideoGenerationParams,
  mediaFileExtension,
  remapVideoInputRolesForMode,
  resolveVideoGenerationParams,
  shouldShowVideoGenerationPanel,
  validateVideoGenerationInputs,
  videoOperationCost,
  videoTimelineFrameUrls,
  videoTimelineTimes,
  videoReferencesForMode,
  videoModeRequirements,
} from '../videoGeneration';
import type {
  CanvasNodeData,
  CanvasFlowEdge,
  CanvasFlowNode,
  NodeReference,
  PromptAssetReference,
  VideoOperationResult,
} from '../types';

const imageReference = (overrides: Partial<NodeReference> = {}): NodeReference => ({
  nodeId: 'image-1',
  nodeType: 'image',
  label: '参考图',
  content: '参考图',
  ...overrides,
});

const promptAsset = (overrides: Partial<PromptAssetReference> = {}): PromptAssetReference => ({
  id: 'asset-1',
  title: '资产图',
  category: 'personal',
  mediaVariant: 'dog',
  ...overrides,
});

const videoNode = (overrides: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
  nodeType: 'video',
  title: '视频节点',
  status: 'ready',
  sourceKind: 'created',
  modeId: 'first-last-frame',
  modelId: 'kling-o1',
  ...overrides,
});

describe('video generation parameters', () => {
  it('accepts usable text, image, video and audio nodes as full references', () => {
    const usable = (nodeType: CanvasNodeData['nodeType']): CanvasNodeData => ({
      nodeType,
      title: nodeType,
      status: 'success',
      sourceKind: 'generated',
      content: nodeType === 'text' ? '镜头描述' : '',
      media: nodeType === 'text' ? undefined : { url: `/${nodeType}.mock` },
    });

    expect((['text', 'image', 'video', 'audio'] as const).map((type) => canUseAsVideoReference(usable(type)))).toEqual([true, true, true, true]);
    expect(canUseAsVideoReference({ ...usable('image'), content: '', media: undefined })).toBe(false);
    expect(canUseAsVideoReference({ ...usable('video'), status: 'running' })).toBe(false);
  });

  it('returns a fresh V1.2 default configuration', () => {
    expect(defaultVideoGenerationParams()).toEqual({
      ratio: 'auto',
      resolution: '720p',
      count: 1,
      duration: 8,
      webSearch: false,
      generateAudio: false,
    });
    expect(defaultVideoGenerationParams()).not.toBe(defaultVideoGenerationParams());
  });

  it('normalizes legacy params and keeps values inside supported ranges', () => {
    expect(resolveVideoGenerationParams({
      params: {
        ratio: '21:9',
        resolution: '4K',
        count: 4,
        duration: 20,
        webSearch: true,
        generateAudio: true,
      },
    })).toEqual({
      ratio: '21:9',
      resolution: '4K',
      count: 4,
      duration: 15,
      webSearch: true,
      generateAudio: true,
    });

    expect(resolveVideoGenerationParams({
      params: { ratio: '2:1', resolution: '8K', count: 8, duration: -2 },
    })).toEqual({
      ratio: 'auto',
      resolution: '720p',
      count: 1,
      duration: 1,
      webSearch: false,
      generateAudio: false,
    });
  });

  it('prefers structured video parameters over legacy params', () => {
    expect(resolveVideoGenerationParams({
      params: { resolution: '480p', duration: 3 },
      videoGeneration: { resolution: '1080p', duration: 12 },
    })).toMatchObject({ resolution: '1080p', duration: 12 });
  });

  it('crops parameters to the selected model capability', () => {
    expect(resolveVideoGenerationParams({
      modelId: 'kling-o1',
      videoGeneration: { ratio: '21:9', resolution: '4K', duration: 15 },
    })).toMatchObject({ ratio: 'auto', resolution: '720p', duration: 10 });
    expect(resolveVideoGenerationParams({
      modelId: 'video-model-b',
      videoGeneration: { ratio: '21:9', resolution: '4K', duration: 15 },
    })).toMatchObject({ ratio: '21:9', resolution: '4K', duration: 15 });
  });
});

describe('video mode validation', () => {
  it('publishes independent requirement snapshots for all supported modes', () => {
    expect(videoModeRequirements('first-frame')).toEqual({
      mode: 'first-frame',
      requiredRoles: ['first-frame'],
      acceptsPromptOnly: false,
    });
    const requirement = videoModeRequirements('first-last-frame')!;
    requirement.requiredRoles.push('reference');
    expect(videoModeRequirements('first-last-frame')?.requiredRoles).toEqual(['first-frame', 'last-frame']);
    expect(videoModeRequirements('unknown')).toBeNull();
  });

  it('requires an explicitly assigned first-frame image', () => {
    expect(validateVideoGenerationInputs('first-frame', [imageReference()])).toMatchObject({
      valid: false,
      code: 'first-frame-required',
    });
    expect(validateVideoGenerationInputs('first-frame', [imageReference({ role: 'first-frame' })])).toEqual({ valid: true });
    expect(validateVideoGenerationInputs('first-frame', [{
      ...imageReference({ role: 'first-frame' }),
      nodeType: 'video',
    }])).toMatchObject({ valid: false, code: 'first-frame-required' });
  });

  it('requires distinct first-frame and last-frame image roles', () => {
    const first = imageReference({ nodeId: 'first', role: 'first-frame' });
    const last = imageReference({ nodeId: 'last', role: 'last-frame' });

    expect(validateVideoGenerationInputs('first-last-frame', [first])).toMatchObject({
      valid: false,
      code: 'last-frame-required',
    });
    expect(validateVideoGenerationInputs('first-last-frame', [last])).toMatchObject({
      valid: false,
      code: 'first-frame-required',
    });
    expect(validateVideoGenerationInputs('first-last-frame', [first, last])).toEqual({ valid: true });
  });

  it('accepts either a prompt, a connected reference, or an @ asset in reference mode', () => {
    expect(validateVideoGenerationInputs('reference')).toMatchObject({ valid: false, code: 'reference-required' });
    expect(validateVideoGenerationInputs('reference', [{
      nodeId: 'empty-text',
      nodeType: 'text',
      label: '空文本',
      content: ' ',
    }])).toMatchObject({ valid: false, code: 'reference-required' });
    expect(validateVideoGenerationInputs('reference', [], [], '让镜头缓慢推进')).toEqual({ valid: true });
    expect(validateVideoGenerationInputs('reference', [{
      nodeId: 'text-1',
      nodeType: 'text',
      label: '镜头描述',
      content: '让镜头缓慢推进',
    }])).toEqual({ valid: true });
    expect(validateVideoGenerationInputs('reference', [imageReference()])).toEqual({ valid: true });
    expect(validateVideoGenerationInputs('reference', [], [promptAsset()])).toEqual({ valid: true });
    expect(validateVideoGenerationInputs('reference', [], [], '', ['seedance-host'])).toEqual({ valid: true });
    expect(validateVideoGenerationInputs('not-a-mode')).toMatchObject({ valid: false, code: 'unsupported-mode' });
  });

  it('keeps role-specific frame references out of other modes', () => {
    const first = imageReference({ nodeId: 'first', role: 'first-frame' });
    const last = imageReference({ nodeId: 'last', role: 'last-frame' });
    const general = imageReference({ nodeId: 'general', role: 'reference' });

    expect(videoReferencesForMode('first-frame', [first, last, general]).map((item) => item.nodeId)).toEqual(['first']);
    expect(videoReferencesForMode('first-last-frame', [first, last, general]).map((item) => item.nodeId)).toEqual(['first', 'last']);
    expect(videoReferencesForMode('reference', [first, last, general]).map((item) => item.nodeId)).toEqual(['general']);
    expect(validateVideoGenerationInputs('reference', [first])).toMatchObject({ valid: false, code: 'reference-required' });
  });

  it('moves existing image references into frame slots without dropping their edges when the mode changes', () => {
    const nodes: CanvasFlowNode[] = [
      { id: 'image-1', type: 'image', position: { x: 0, y: 0 }, data: { nodeType: 'image', title: '图片一', status: 'success', sourceKind: 'generated', media: { url: '/one.png' } } },
      { id: 'image-2', type: 'image', position: { x: 0, y: 0 }, data: { nodeType: 'image', title: '图片二', status: 'success', sourceKind: 'generated', media: { url: '/two.png' } } },
      { id: 'video-1', type: 'video', position: { x: 0, y: 0 }, data: videoNode({ modeId: 'reference' }) },
    ];
    const edges: CanvasFlowEdge[] = [
      { id: 'reference-one', source: 'image-1', target: 'video-1', data: { relationType: 'generation-input', inputRole: 'reference' } },
      { id: 'reference-two', source: 'image-2', target: 'video-1', data: { relationType: 'generation-input', inputRole: 'reference' } },
    ];

    const firstLast = remapVideoInputRolesForMode('video-1', 'first-last-frame', nodes, edges);
    expect(firstLast).toHaveLength(2);
    expect(firstLast.map((edge) => edge.data?.inputRole)).toEqual(['first-frame', 'last-frame']);
    expect(edges.map((edge) => edge.data?.inputRole)).toEqual(['reference', 'reference']);

    const reference = remapVideoInputRolesForMode('video-1', 'reference', nodes, firstLast);
    expect(reference).toHaveLength(2);
    expect(reference.map((edge) => edge.data?.inputRole)).toEqual(['reference', 'reference']);
  });
});

describe('video generation state helpers', () => {
  it('plans independent tasks for 1-4 video results while filling the original node', () => {
    const plan = buildVideoBatchPlan('video-empty', 4, true, 'batch-1');
    expect(plan.map((item) => item.outputNodeId)).toEqual([
      'video-empty',
      'video-generated-batch-1-1',
      'video-generated-batch-1-2',
      'video-generated-batch-1-3',
    ]);
    expect(plan.map((item) => item.outputNodeIds)).toEqual(plan.map((item) => [item.outputNodeId]));
    expect(new Set(plan.map((item) => item.taskId)).size).toBe(4);
    const regenerated = buildVideoBatchPlan('video-result', 2, true, 'batch-2');
    expect(regenerated[0]).toMatchObject({ outputNodeId: 'video-result', usesCurrentNode: true });
    expect(regenerated[1]).toMatchObject({ outputNodeId: 'video-generated-batch-2-1', usesCurrentNode: false });
  });

  it('shows generation controls only on authored or generated videos without an operation', () => {
    expect(shouldShowVideoGenerationPanel(videoNode())).toBe(true);
    expect(shouldShowVideoGenerationPanel(videoNode({ sourceKind: 'generated' }))).toBe(true);
    expect(shouldShowVideoGenerationPanel(videoNode({ sourceKind: 'upload' }))).toBe(false);
    expect(shouldShowVideoGenerationPanel(videoNode({ sourceKind: 'asset' }))).toBe(false);
    expect(shouldShowVideoGenerationPanel(videoNode({
      sourceKind: 'generated',
      videoOperation: { operation: 'subtitle-removal' },
    }))).toBe(false);
    expect(shouldShowVideoGenerationPanel({
      nodeType: 'image',
      title: '图片',
      status: 'success',
      sourceKind: 'generated',
    })).toBe(false);
  });

  it('builds an immutable task snapshot and composes connected text before the local prompt', () => {
    const source = videoNode({
      modeId: 'reference',
      modelId: 'seedance-2',
      localPrompt: '保持电影感',
      params: { duration: 6, resolution: '480p', customFlag: true },
      videoGeneration: {
        ratio: '16:9',
        resolution: '1080p',
        count: 2,
        duration: 10,
        webSearch: true,
        generateAudio: false,
      },
      references: [
        {
          nodeId: 'text-1',
          nodeType: 'text',
          label: '分镜',
          content: '镜头从远景推进',
        },
        imageReference({ media: { url: '/first.png', width: 1280, height: 720 } }),
      ],
      promptAssets: [promptAsset({ media: { url: '/asset.png' } })],
      seedanceComplianceAssetIds: ['seedance-host'],
    });

    const snapshot = buildVideoTaskSnapshot(source);

    expect(snapshot).toMatchObject({
      modeId: 'reference',
      modelId: 'seedance-2',
      effectivePrompt: '镜头从远景推进\n\n保持电影感',
      inputReferenceIds: ['text-1', 'image-1'],
      inputAssetIds: ['asset-1', 'seedance-host'],
      videoGeneration: { resolution: '1080p', duration: 10, count: 2 },
      params: { customFlag: true, resolution: '1080p', duration: 10, count: 2 },
    });

    snapshot.inputReferences[1].media!.url = '/changed.png';
    snapshot.promptAssets[0].media!.url = '/changed-asset.png';
    expect(source.references?.[1].media?.url).toBe('/first.png');
    expect(source.promptAssets?.[0].media?.url).toBe('/asset.png');
  });

  it('builds a successful result without mutating the pending node', () => {
    const source = videoNode({
      modelId: 'video-model-b',
      content: ' ',
      progress: 41,
      error: '旧错误',
      videoOperation: { operation: 'subtitle-removal' },
      params: { duration: 6 },
    });
    const result = buildVideoResultData(
      source,
      { url: '/result.mp4', posterUrl: '/result.jpg', duration: 11, hasAudio: true },
      { params: { ratio: '9:16', resolution: '4K', count: 3, generateAudio: true } },
    );

    expect(result).toMatchObject({
      status: 'success',
      sourceKind: 'generated',
      content: '生成的视频结果',
      progress: 100,
      duration: 11,
      media: { url: '/result.mp4', posterUrl: '/result.jpg', hasAudio: true },
      videoGeneration: {
        ratio: '9:16',
        resolution: '4K',
        count: 3,
        duration: 6,
        generateAudio: true,
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.videoOperation).toBeUndefined();
    expect(source.status).toBe('ready');
    expect(source.videoOperation).toEqual({ operation: 'subtitle-removal' });
  });

  it('constructs operation derivatives for the V1.2 operation shapes', () => {
    const source = videoNode({
      title: '海边镜头',
      sourceKind: 'upload',
      status: 'success',
      duration: 8,
      favorite: true,
      references: [imageReference()],
      media: { url: '/source.mp4', duration: 8 },
    });
    const operation: VideoOperationResult = {
      operation: 'super-resolution',
      model: 'topaz',
      scale: 4,
    };
    const result = buildVideoDerivativeData(source, operation, { url: '/4k.mp4', duration: 8 });

    expect(result).toMatchObject({
      title: '海边镜头 · 视频超分',
      status: 'success',
      sourceKind: 'generated',
      favorite: false,
      references: [],
      promptAssets: [],
      duration: 8,
      media: { url: '/4k.mp4', duration: 8 },
      videoOperation: operation,
    });
    expect(source.media?.url).toBe('/source.mp4');
    expect(source.references).toHaveLength(1);
  });

  it.each<[VideoOperationResult, string]>([
    [{ operation: 'frame-interpolation', targetFps: 60 }, '视频补帧'],
    [{ operation: 'subtitle-removal' }, '智能去字幕'],
    [{ operation: 'lip-sync', personId: 'person-primary', personLabel: '主播', source: 'ai', script: '你好', speed: 1, pitch: 0 }, '智能对口型'],
    [{ operation: 'edit', selectedTime: 2.4, prompt: '移除路人' }, '视频编辑'],
  ])('labels the %s derivative', (operation, label) => {
    const result = buildVideoDerivativeData(videoNode(), operation);
    expect(result.title).toBe(`视频节点 · ${label}`);
    expect(result.videoOperation).toEqual(operation);
  });

  it('keeps an independent snapshot of video edit preview history', () => {
    const operation: Extract<VideoOperationResult, { operation: 'edit' }> = {
      operation: 'edit',
      selectedTime: .5,
      prompt: '方案 A',
      previewUrl: '/frame-1.jpg',
      previewFilter: 'saturate(1.1)',
      selectedPreviewId: 'preview-a',
      previewResults: [
        {
          id: 'preview-a',
          selectedTime: .5,
          sourceFrameUrl: '/frame-1.jpg',
          prompt: '方案 A',
          previewUrl: '/frame-1.jpg',
          previewFilter: 'saturate(1.1)',
        },
        {
          id: 'preview-b',
          selectedTime: 2.3,
          sourceFrameUrl: '/frame-2.jpg',
          prompt: '方案 B',
          previewUrl: '/frame-2.jpg',
          previewFilter: 'hue-rotate(8deg)',
        },
      ],
    };
    const result = buildVideoDerivativeData(videoNode(), operation);

    operation.previewResults![0].prompt = '已修改输入';
    expect(result.videoOperation).toMatchObject({
      selectedPreviewId: 'preview-a',
      prompt: '方案 A',
      previewResults: [
        { id: 'preview-a', prompt: '方案 A' },
        { id: 'preview-b', prompt: '方案 B' },
      ],
    });
  });

  it('rejects non-video nodes and empty result URLs', () => {
    const image: CanvasNodeData = {
      nodeType: 'image',
      title: '图片',
      status: 'ready',
      sourceKind: 'created',
    };

    expect(() => buildVideoTaskSnapshot(image)).toThrow(TypeError);
    expect(() => buildVideoResultData(image, { url: '/video.mp4' })).toThrow(TypeError);
    expect(() => buildVideoDerivativeData(image, { operation: 'subtitle-removal' })).toThrow(TypeError);
    expect(() => buildVideoResultData(videoNode(), { url: '   ' })).toThrow('Video result media requires a URL');
  });

  it('keeps operation costs and media filename extensions consistent', () => {
    expect(videoOperationCost('super-resolution')).toBe(13);
    expect(videoOperationCost({ operation: 'subtitle-removal' })).toBe(8);
    expect(videoOperationCost({ operation: 'edit', selectedTime: 2, prompt: '换装' })).toBe(36);
    expect(mediaFileExtension({ url: 'blob:demo', mimeType: 'video/quicktime' }, 'video')).toBe('mov');
    expect(mediaFileExtension({ url: '/clip.webm' }, 'video')).toBe('webm');
    expect(mediaFileExtension({ url: 'blob:audio', mimeType: 'audio/wav' }, 'audio')).toBe('wav');
  });

  it('builds timeline points from the real duration and uses only source-specific frames', () => {
    expect(videoTimelineTimes(8, 5)).toEqual([0.5, 2.25, 4, 5.75, 7.5]);
    expect(videoTimelineTimes(4, 1)).toEqual([0.32]);
    expect(videoTimelineFrameUrls({ url: '/landscape.mp4', posterUrl: '/landscape.jpg', timelineFrameUrls: ['/frame-1.jpg', '/frame-2.jpg'] })).toEqual(['/frame-1.jpg', '/frame-2.jpg']);
    expect(videoTimelineFrameUrls({ url: '/upload.mp4', posterUrl: '/upload.jpg' })).toEqual(['/upload.jpg']);
    expect(videoTimelineFrameUrls({ url: '/upload.mp4' })).toEqual([]);
  });
});
