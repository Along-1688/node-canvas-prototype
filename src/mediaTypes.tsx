import { FileAudio, FileImage, FileText, Film } from 'lucide-react'
import type { MediaNodeType } from './types'

export const mediaNodeTypes: MediaNodeType[] = ['text', 'image', 'video', 'audio']

export const mediaTypeLabels: Record<MediaNodeType, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
}

export function MediaTypeIcon({ type, size = 18 }: { type: MediaNodeType; size?: number }) {
  if (type === 'text') return <FileText size={size} />
  if (type === 'image') return <FileImage size={size} />
  if (type === 'video') return <Film size={size} />
  return <FileAudio size={size} />
}
