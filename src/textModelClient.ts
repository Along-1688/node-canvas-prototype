export const DEFAULT_TEXT_MODEL_ID = 'deepseek-v4-pro'
export const TEXT_MODEL_OPTIONS = [
  { id: 'gpt-5.6-terra', label: 'GPT 5.6 Terra', supportedInputs: ['text', 'image', 'video'], capabilityLabel: '支持图片、视频' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', supportedInputs: ['text', 'image'], capabilityLabel: '支持图片' },
  { id: DEFAULT_TEXT_MODEL_ID, label: 'DeepSeek V4 Pro', supportedInputs: ['text'], capabilityLabel: '仅支持文本' },
  { id: 'glm-5.2', label: 'GLM 5.2', supportedInputs: ['text'], capabilityLabel: '仅支持文本' },
] as const

export type TextModelId = (typeof TEXT_MODEL_OPTIONS)[number]['id']

export interface TextModelCompletionRequest {
  tid: number
  modelId: string
  userPrompt: string
}

export interface TextModelCompletionResult {
  providerTaskId?: number
  content: string
  finishReason?: 'mock' | 'length'
}

export class TextModelRequestError extends Error {}

export function isTextModelId(value: string | undefined): value is TextModelId {
  return TEXT_MODEL_OPTIONS.some((model) => model.id === value)
}

export function textModelLabel(modelId?: string): string {
  return TEXT_MODEL_OPTIONS.find((model) => model.id === modelId)?.label ?? '文本生成模型'
}

export function textModelUnsupportedReferenceTypes(
  modelId: string | undefined,
  references: Array<{ nodeType: string }> = [],
): Array<'image' | 'video'> {
  const model = TEXT_MODEL_OPTIONS.find((item) => item.id === modelId)
    ?? TEXT_MODEL_OPTIONS.find((item) => item.id === DEFAULT_TEXT_MODEL_ID)!
  return [...new Set(references
    .map((reference) => reference.nodeType)
    .filter((nodeType): nodeType is 'image' | 'video' => (
      (nodeType === 'image' || nodeType === 'video')
      && !(model.supportedInputs as readonly string[]).includes(nodeType)
    )))]
}

export function compatibleTextModelForReferences(
  currentModelId: string | undefined,
  references: Array<{ nodeType: string }> = [],
): TextModelId {
  const currentModel = isTextModelId(currentModelId) ? currentModelId : DEFAULT_TEXT_MODEL_ID
  if (textModelUnsupportedReferenceTypes(currentModel, references).length === 0) return currentModel
  if (references.some((reference) => reference.nodeType === 'video')) return 'gpt-5.6-terra'
  if (references.some((reference) => reference.nodeType === 'image')) return 'gemini-3.6-flash'
  return currentModel
}

export function textModelUnsupportedReason(
  modelId: string | undefined,
  references: Array<{ nodeType: string }> = [],
): string | undefined {
  const labels = textModelUnsupportedReferenceTypes(modelId, references)
    .map((type) => type === 'image' ? '图片' : '视频')
  return labels.length ? `该模型不支持当前连入的${labels.join('、')}素材` : undefined
}

function buildMockContent(modelId: string, userPrompt: string) {
  const requirement = userPrompt.trim().replace(/\s+/g, ' ')
  const model = textModelLabel(modelId)
  if (!requirement) return model + ' 已返回公开原型 Mock 文本，可继续编辑或作为下游节点的输入。'
  return model + ' 已根据“' + requirement.slice(0, 72) + '”生成公开原型 Mock 文本，可继续编辑、串联或重新生成。'
}

export async function requestTextModelCompletion({ modelId, userPrompt }: TextModelCompletionRequest): Promise<TextModelCompletionResult> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 900))
  return { content: buildMockContent(modelId, userPrompt), finishReason: 'mock' }
}
