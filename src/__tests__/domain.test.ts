import type { Connection } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  allowedContextSourcesForTarget,
  allowedTargetsForSource,
  attachCanvasEdgesToBorders,
  isConnectionPairAllowed,
  isSeedanceComplianceEligible,
  markDownstreamNodesStale,
  resolveEffectivePrompt,
  resolveMockPromptMarkerLabel,
  syncTargetReferences,
  validateConnection,
} from '../domain';
import { initialEdges, initialNodes, initialTasks } from '../mockData';

const connection = (source: string, target: string): Connection => ({
  source,
  target,
  sourceHandle: 'source',
  targetHandle: 'target',
});

describe('node connection domain rules', () => {
  it('anchors initial edges to the node borders', () => {
    expect(initialEdges).not.toHaveLength(0);
    expect(initialEdges.every((edge) => edge.sourceHandle === 'output' && edge.targetHandle === 'input')).toBe(true);
  });

  it('keeps failed starter nodes, concrete task errors and their incoming border connections', () => {
    const failedNodes = initialNodes.filter((node) => node.data.status === 'failed');

    expect(failedNodes).toHaveLength(2);
    expect(failedNodes.some((node) => node.data.error?.includes('内容审核未通过'))).toBe(true);
    failedNodes.forEach((node) => {
      expect(node.data.error).toBeTruthy();
      expect(initialTasks.find((task) => task.nodeId === node.id)).toMatchObject({
        status: 'failed',
        error: node.data.error,
        outputNodeIds: expect.arrayContaining([node.id]),
      });
      expect(initialEdges.find((edge) => edge.target === node.id)).toMatchObject({
        sourceHandle: 'output',
        targetHandle: 'input',
      });
    });
  });

  it('migrates launcher handles without replacing specialized operation anchors', () => {
    const migrated = attachCanvasEdgesToBorders([
      { id: 'generated', source: 'a', sourceHandle: 'output-launcher', target: 'b', targetHandle: 'input-launcher' },
      { id: 'operation', source: 'b', sourceHandle: 'video-operation-output', target: 'c' },
    ]);

    expect(migrated[0]).toMatchObject({ sourceHandle: 'output', targetHandle: 'input' });
    expect(migrated[1]).toMatchObject({ sourceHandle: 'video-operation-output', targetHandle: 'input' });
  });

  it('exposes the current compatibility matrix from one shared rule', () => {
    expect(allowedTargetsForSource('text')).toEqual(['text', 'image', 'video', 'audio']);
    expect(allowedTargetsForSource('image')).toEqual(['text', 'image', 'video']);
    expect(allowedTargetsForSource('audio')).toEqual(['audio', 'video']);
    expect(allowedTargetsForSource('video')).toEqual(['text', 'video', 'audio']);
    expect(isConnectionPairAllowed('text', 'text')).toBe(true);
    expect(isConnectionPairAllowed('image', 'text')).toBe(true);
    expect(isConnectionPairAllowed('image', 'audio')).toBe(false);
    expect(isConnectionPairAllowed('video', 'text')).toBe(true);
    expect(isConnectionPairAllowed('video', 'audio')).toBe(true);
    expect(isConnectionPairAllowed('audio', 'audio')).toBe(true);
    expect(isConnectionPairAllowed('video', 'image')).toBe(false);
    expect(isConnectionPairAllowed('video', 'video')).toBe(true);
  });

  it('uses a separate, deliberately constrained matrix for adding context on the left side', () => {
    const text = initialNodes.find((node) => node.id === 'text-prompt')!;
    const generatedImage = initialNodes.find((node) => node.id === 'image-generated')!;
    const uploadedImage = initialNodes.find((node) => node.id === 'image-upload')!;
    const video = initialNodes.find((node) => node.id === 'video-host-demo')!;
    const audio = {
      ...structuredClone(video),
      id: 'audio-target',
      type: 'audio' as const,
      data: { ...structuredClone(video.data), nodeType: 'audio' as const, sourceKind: 'generated' as const },
    };

    expect(allowedContextSourcesForTarget(text)).toEqual(['text', 'image']);
    expect(allowedContextSourcesForTarget(generatedImage)).toEqual(['text', 'image']);
    expect(allowedContextSourcesForTarget(uploadedImage)).toEqual([]);
    expect(allowedContextSourcesForTarget(video)).toEqual(['text', 'image', 'audio']);
    expect(allowedContextSourcesForTarget(audio)).toEqual(['text']);
  });

  it('allows text to feed an image and images to create branches', () => {
    expect(validateConnection(connection('text-prompt', 'image-generated'), initialNodes, [])).toEqual({ valid: true });
    expect(validateConnection(connection('image-generated', 'image-relight'), initialNodes, [])).toEqual({ valid: true });
  });

  it('allows a completed video to continue into another video node', () => {
    const source = structuredClone(initialNodes.find((node) => node.id === 'video-host-demo')!);
    const target = { ...structuredClone(source), id: 'video-next', data: { ...structuredClone(source.data), references: [] } };
    expect(validateConnection(connection(source.id, target.id), [source, target], [])).toEqual({ valid: true });
  });

  it('rejects unsupported, duplicate and self connections', () => {
    const unsupportedNodes = initialNodes.map((node) => node.id === 'text-prompt'
      ? { ...node, data: { ...node.data, nodeType: 'audio' as const } }
      : node);
    expect(validateConnection(connection('image-generated', 'text-prompt'), unsupportedNodes, []).valid).toBe(false);
    expect(validateConnection(connection('text-prompt', 'text-prompt'), initialNodes, []).valid).toBe(false);
    expect(validateConnection(connection('text-prompt', 'image-generated'), initialNodes, initialEdges).valid).toBe(false);
  });

  it('rejects a connection that would create a cycle', () => {
    const cycleNodes = initialNodes.map((node) =>
      node.id === 'text-prompt' || node.id === 'image-generated'
        ? { ...node, data: { ...node.data, nodeType: 'image' as const } }
        : node,
    );
    const cycleEdges = [{ id: 'a-to-b', source: 'text-prompt', target: 'image-generated', data: { relationType: 'generation-input' as const } }];
    expect(validateConnection(connection('image-generated', 'text-prompt'), cycleNodes, cycleEdges).valid).toBe(false);
  });
});

describe('Seedance compliance eligibility', () => {
  it('accepts completed image, video and audio media but excludes text and active tasks', () => {
    const completedVideo = structuredClone(initialNodes.find((node) => node.id === 'video-host-demo')!);
    expect(isSeedanceComplianceEligible(completedVideo)).toBe(true);
    expect(isSeedanceComplianceEligible({ ...completedVideo, id: 'audio-ready', data: { ...completedVideo.data, nodeType: 'audio', status: 'success' } })).toBe(true);
    expect(isSeedanceComplianceEligible({ ...completedVideo, id: 'text-ready', data: { ...completedVideo.data, nodeType: 'text' } })).toBe(false);
    expect(isSeedanceComplianceEligible({ ...completedVideo, id: 'video-running', data: { ...completedVideo.data, status: 'running' } })).toBe(false);
    for (const status of ['idle', 'ready', 'queued', 'failed', 'cancelled', 'stale'] as const) {
      expect(isSeedanceComplianceEligible({ ...completedVideo, id: `video-${status}`, data: { ...completedVideo.data, status } })).toBe(false);
    }
  });
});

describe('generation prompt resolution', () => {
  it('combines upstream text references with local supplemental prompt', () => {
    const synced = syncTargetReferences(initialNodes, initialEdges);
    const image = synced.find((node) => node.id === 'image-generated');

    expect(image).toBeDefined();
    const effectivePrompt = resolveEffectivePrompt(image!.data.references, '保持电影级构图');
    expect(effectivePrompt).toContain('傍晚的未来城市');
    expect(effectivePrompt).toContain('保持电影级构图');
  });

  it('turns image and video references into executable prompt context', () => {
    const prompt = resolveEffectivePrompt([
      { nodeId: 'image-1', nodeType: 'image', label: '主视觉', content: '主视觉' },
      { nodeId: 'video-1', nodeType: 'video', label: '成片', content: '成片', media: { url: '/video.mp4', duration: 8.08 } },
    ]);

    expect(prompt).toContain('参考图片「主视觉」');
    expect(prompt).toContain('参考视频「成片」（8.1 秒）');
  });

  it('does not count image operation edges as generation references', () => {
    const synced = syncTargetReferences(initialNodes, initialEdges);
    const derived = synced.find((node) => node.id === 'image-relight');

    expect(derived?.data.references ?? []).toEqual([]);
  });

  it('preserves video input roles and excludes video operation edges from references', () => {
    const derivative = {
      ...structuredClone(initialNodes.find((node) => node.id === 'video-host-demo')!),
      id: 'video-derived',
      data: {
        ...structuredClone(initialNodes.find((node) => node.id === 'video-host-demo')!.data),
        references: [],
        videoOperation: { operation: 'subtitle-removal' as const },
      },
    };
    const edges = [
      ...initialEdges,
      { id: 'first-frame', source: 'image-upload', target: 'video-host-demo', data: { relationType: 'generation-input' as const, inputRole: 'first-frame' as const } },
      { id: 'video-operation', source: 'video-host-demo', target: 'video-derived', data: { relationType: 'video-operation' as const, videoOperation: 'subtitle-removal' as const } },
    ];
    const synced = syncTargetReferences([...initialNodes, derivative], edges);

    expect(synced.find((node) => node.id === 'video-host-demo')?.data.references?.[0]).toMatchObject({ nodeId: 'image-upload', role: 'first-frame' });
    expect(synced.find((node) => node.id === 'video-derived')?.data.references ?? []).toEqual([]);
  });
});

describe('input update propagation', () => {
  it('marks only completed direct and indirect downstream nodes as input-updated', () => {
    const source = { ...structuredClone(initialNodes.find((node) => node.id === 'image-generated')!), id: 'source', data: { ...structuredClone(initialNodes.find((node) => node.id === 'image-generated')!.data), status: 'success' as const } };
    const direct = { ...structuredClone(source), id: 'direct', data: { ...structuredClone(source.data), status: 'success' as const } };
    const indirect = { ...structuredClone(source), id: 'indirect', data: { ...structuredClone(source.data), status: 'stale' as const, staleNoticeDismissed: true } };
    const active = { ...structuredClone(source), id: 'active', data: { ...structuredClone(source.data), status: 'running' as const } };
    const result = markDownstreamNodesStale(
      [source, direct, indirect, active],
      [
        { id: 'source-direct', source: 'source', target: 'direct' },
        { id: 'direct-indirect', source: 'direct', target: 'indirect' },
        { id: 'source-active', source: 'source', target: 'active' },
      ],
      ['source'],
    );

    expect(result.find((node) => node.id === 'source')?.data.status).toBe('success');
    expect(result.find((node) => node.id === 'direct')?.data).toMatchObject({ status: 'stale', staleNoticeDismissed: false });
    expect(result.find((node) => node.id === 'indirect')?.data).toMatchObject({ status: 'stale', staleNoticeDismissed: false });
    expect(result.find((node) => node.id === 'active')?.data.status).toBe('running');
  });
});

describe('prompt marker mock parsing', () => {
  it('maps a clicked image area to a deterministic semantic token', () => {
    expect(resolveMockPromptMarkerLabel(0.5, 0.25)).toBe('主体面部特征');
    expect(resolveMockPromptMarkerLabel(0.08, 0.2)).toBe('画面上方元素');
    expect(resolveMockPromptMarkerLabel(0.82, 0.55)).toBe('主体局部细节');
    expect(resolveMockPromptMarkerLabel(0.5, 0.9)).toBe('前景局部细节');
  });
});
