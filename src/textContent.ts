export type TextContentBlock =
  | { kind: 'text'; content: string }
  | { kind: 'code'; content: string; language?: string }

const fencedCodeBlock = /```([^\r\n`]*)\r?\n([\s\S]*?)```/g

function rawCodeLanguage(content: string) {
  const value = content.trim()
  if (/^<!doctype html\b/i.test(value) || /^<html(?:\s|>)/i.test(value)) return 'html'
  if (/^(?:import|export|const|let|var|function|class|interface|type)\b/.test(value)) return 'typescript'

  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try {
      JSON.parse(value)
      return 'json'
    } catch {
      return undefined
    }
  }

  return undefined
}

/** Splits fenced code from prose without treating ordinary Markdown as source code. */
export function parseTextContent(content: string): TextContentBlock[] {
  const blocks: TextContentBlock[] = []
  let cursor = 0
  let match = fencedCodeBlock.exec(content)

  while (match) {
    const prose = content.slice(cursor, match.index)
    if (prose) blocks.push({ kind: 'text', content: prose })

    const language = match[1].trim().split(/\s+/, 1)[0] || undefined
    blocks.push({ kind: 'code', content: match[2].replace(/\r\n/g, '\n'), language })
    cursor = fencedCodeBlock.lastIndex
    match = fencedCodeBlock.exec(content)
  }

  if (blocks.length === 0) {
    const language = rawCodeLanguage(content)
    return language ? [{ kind: 'code', content, language }] : [{ kind: 'text', content }]
  }

  const trailingProse = content.slice(cursor)
  if (trailingProse) blocks.push({ kind: 'text', content: trailingProse })
  return blocks
}
