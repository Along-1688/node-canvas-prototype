export const PUBLIC_TEXT_MODEL_MOCK_ID = 'text-generation-mock'
export const DEFAULT_TEXT_MODEL_ID = PUBLIC_TEXT_MODEL_MOCK_ID
export const TEXT_MODEL_OPTIONS = [{
  id: PUBLIC_TEXT_MODEL_MOCK_ID,
  label: '文本生成 Mock',
  supportedInputs: ['text', 'image', 'video'],
  capabilityLabel: '支持图片、视频',
}] as const

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
  return value === PUBLIC_TEXT_MODEL_MOCK_ID
}

export function textModelLabel(_modelId?: string): string {
  return '文本生成 Mock'
}

export function textModelUnsupportedReferenceTypes(
  _modelId: string | undefined,
  _references: Array<{ nodeType: string }> = [],
): Array<'image' | 'video'> {
  return []
}

export function compatibleTextModelForReferences(
  _currentModelId: string | undefined,
  _references: Array<{ nodeType: string }> = [],
): TextModelId {
  return PUBLIC_TEXT_MODEL_MOCK_ID
}

export function textModelUnsupportedReason(
  _modelId: string | undefined,
  _references: Array<{ nodeType: string }> = [],
): string | undefined {
  return undefined
}

function buildMockContent(userPrompt: string) {
  const requirement = userPrompt.trim().replace(/\s+/g, ' ')
  if (!requirement) return '这是公开原型的文本生成示例，可继续编辑或作为下游节点的输入。'
  return '已根据“' + requirement.slice(0, 72) + '”生成公开原型示例文本。这里展示的是确定性 Mock 结果，可继续编辑、串联或重新生成。'
}

export async function requestTextModelCompletion({ userPrompt }: TextModelCompletionRequest): Promise<TextModelCompletionResult> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 900))
  return { content: buildMockContent(userPrompt), finishReason: 'mock' }
}
