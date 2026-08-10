import type { Connection } from '@xyflow/react'
import type {
  CanvasFlowEdge,
  CanvasFlowNode,
  CanvasNodeData,
  GenerationReferenceRole,
  MediaNodeType,
  NodeReference,
} from './types'
import { compatibleTextModelForReferences } from './textModelClient'

const targetMatrix: Record<MediaNodeType, MediaNodeType[]> = {
  text: ['text', 'image', 'video', 'audio'],
  image: ['text', 'image', 'video'],
  audio: ['audio', 'video'],
  video: ['text', 'video', 'audio'],
}

const contextSourceMatrix: Record<MediaNodeType, MediaNodeType[]> = {
  text: ['text', 'image'],
  image: ['text', 'image'],
  video: ['text', 'image', 'audio'],
  audio: ['text'],
}

function isImageEditorNode(node: CanvasFlowNode) {
  return node.data.nodeType === 'image'
    && (node.data.imageOperation?.operation === 'image-editor' || node.data.imageOperation?.operation === 'image-compose')
}

export function allowedTargetsForSource(sourceType: MediaNodeType) {
  return [...targetMatrix[sourceType]]
}

export function isConnectionPairAllowed(sourceType: MediaNodeType, targetType: MediaNodeType) {
  return targetMatrix[sourceType].includes(targetType)
}

export function allowedContextSourcesForTarget(target: CanvasFlowNode) {
  if (isImageEditorNode(target)) return []
  if (target.data.nodeType === 'image' && target.data.sourceKind === 'upload') return []
  return [...contextSourceMatrix[target.data.nodeType]]
}

export function isSeedanceComplianceEligible(node: CanvasFlowNode) {
  return node.data.nodeType !== 'text'
    && node.data.status === 'success'
    && Boolean((node.data.content ?? '').trim() || node.data.media?.url)
}

export function resolveEffectivePrompt(references: NodeReference[] = [], localPrompt = '') {
  const referencedContent = references
    .map((reference) => {
      if (reference.nodeType === 'text') return reference.content.trim()
      const typeLabel = { image: '图片', video: '视频', audio: '音频' }[reference.nodeType]
      const duration = reference.media?.duration ? `（${reference.media.duration.toFixed(1)} 秒）` : ''
      return `参考${typeLabel}「${reference.label}」${duration}`
    })
    .filter(Boolean)

  return [...referencedContent, localPrompt.trim()].filter(Boolean).join('\n\n')
}

export function resolveMockPromptMarkerLabel(x: number, y: number) {
  if (x >= 0.22 && x <= 0.78 && y >= 0.08 && y <= 0.58) return '主体面部特征'
  if (y < 0.35) return '画面上方元素'
  if (y < 0.72) return '主体局部细节'
  return '前景局部细节'
}

function createsCycle(source: string, target: string, edges: CanvasFlowEdge[]) {
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    const next = adjacency.get(edge.source) ?? []
    next.push(edge.target)
    adjacency.set(edge.source, next)
  }

  const stack = [target]
  const visited = new Set<string>()
  while (stack.length) {
    const current = stack.pop()!
    if (current === source) return true
    if (visited.has(current)) continue
    visited.add(current)
    stack.push(...(adjacency.get(current) ?? []))
  }
  return false
}

export function validateConnection(
  connection: Connection,
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
): { valid: true } | { valid: false; reason: string } {
  const { source, target } = connection
  if (!source || !target) return { valid: false, reason: '请选择完整的输入和目标节点' }
  if (source === target) return { valid: false, reason: '节点不能连接自己' }
  if (edges.some((edge) => edge.source === source && edge.target === target)) {
    return { valid: false, reason: '这两个节点已经连接' }
  }

  const sourceNode = nodes.find((node) => node.id === source)
  const targetNode = nodes.find((node) => node.id === target)
  if (!sourceNode || !targetNode) return { valid: false, reason: '未找到连接节点' }

  if (isImageEditorNode(targetNode) && sourceNode.data.nodeType !== 'image') {
    return { valid: false, reason: '图片编辑器仅支持图片节点输入' }
  }
  if (!isConnectionPairAllowed(sourceNode.data.nodeType, targetNode.data.nodeType)) {
    return { valid: false, reason: `${labelForType(sourceNode.data.nodeType)}暂不能作为${labelForType(targetNode.data.nodeType)}的输入` }
  }
  if (createsCycle(source, target, edges)) return { valid: false, reason: '生成输入不能形成循环依赖' }
  return { valid: true }
}

export function attachCanvasEdgesToBorders(edges: CanvasFlowEdge[]) {
  let changed = false
  const next = edges.map((edge) => {
    const sourceHandle = !edge.sourceHandle || edge.sourceHandle === 'output-launcher' ? 'output' : edge.sourceHandle
    const targetHandle = !edge.targetHandle || edge.targetHandle === 'input-launcher' ? 'input' : edge.targetHandle
    if (sourceHandle === edge.sourceHandle && targetHandle === edge.targetHandle) return edge
    changed = true
    return { ...edge, sourceHandle, targetHandle }
  })
  return changed ? next : edges
}

export function labelForType(type: MediaNodeType) {
  return { text: '文本', image: '图片', video: '视频', audio: '音频' }[type]
}

export function referenceFromNode(node: CanvasFlowNode, role: GenerationReferenceRole = 'default'): NodeReference {
  return {
    nodeId: node.id,
    nodeType: node.data.nodeType,
    label: node.data.title,
    content: node.data.content ?? node.data.title,
    mediaVariant: node.data.mediaVariant,
    media: node.data.media ? { ...node.data.media } : undefined,
    role,
  }
}

export function syncTargetReferences(
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
): CanvasFlowNode[] {
  return nodes.map((node) => {
    const incoming = edges.filter(
      (edge) => edge.target === node.id && edge.data?.relationType === 'generation-input',
    )
    const references = incoming.flatMap((edge) => {
      const source = nodes.find((candidate) => candidate.id === edge.source)
      return source ? [referenceFromNode(source, edge.data?.inputRole ?? 'default')] : []
    })
    const modelId = node.data.nodeType === 'text'
      ? compatibleTextModelForReferences(node.data.modelId, references)
      : node.data.modelId
    if (JSON.stringify(node.data.references ?? []) === JSON.stringify(references) && modelId === node.data.modelId) return node
    return { ...node, data: { ...node.data, references, modelId } }
  })
}

export function updateNodeData(
  nodes: CanvasFlowNode[],
  nodeId: string,
  patch: Partial<CanvasNodeData>,
) {
  return nodes.map((node) =>
    node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node,
  )
}

export function markNodesStale(
  nodes: CanvasFlowNode[],
  nodeIds: string[],
): CanvasFlowNode[] {
  const affected = new Set(nodeIds)
  return nodes.map((node): CanvasFlowNode => {
    if (!affected.has(node.id) || (node.data.status !== 'success' && node.data.status !== 'stale')) return node
    return { ...node, data: { ...node.data, status: 'stale' as const, staleNoticeDismissed: false } }
  })
}

export function markDirectDependentsStale(
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
  changedNodeIds: string[],
): CanvasFlowNode[] {
  const changed = new Set(changedNodeIds)
  const directDependentIds = edges
    .filter((edge) => changed.has(edge.source))
    .map((edge) => edge.target)
  return markNodesStale(nodes, directDependentIds)
}
