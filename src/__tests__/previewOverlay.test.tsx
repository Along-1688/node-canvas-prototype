import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CanvasActionContext } from '../canvasContext'
import { PreviewOverlay } from '../nodes'
import type { CanvasNodeData } from '../types'

function renderPreview(data: CanvasNodeData, onClose = vi.fn()) {
  render(
    <CanvasActionContext.Provider value={{ updateNode: vi.fn(), notify: vi.fn() } as never}>
      <PreviewOverlay open id="preview-node" data={data} onClose={onClose} />
    </CanvasActionContext.Provider>,
  )
  return { onClose }
}

describe('node fullscreen preview', () => {
  it('uses a title-free centered editor with the close action inside the text toolbar', () => {
    renderPreview({
      nodeType: 'text',
      title: '樱花城市提示词',
      content: '傍晚的未来城市，樱花沿街盛开。',
      status: 'ready',
      sourceKind: 'generated',
    })

    const dialog = screen.getByRole('dialog', { name: '樱花城市提示词全屏编辑' })
    const panel = dialog.querySelector('section')
    expect(panel).toHaveClass('node-preview-panel', 'preview-text', 'fullscreen-text-editor')
    expect(within(dialog).queryByText('樱花城市提示词')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('toolbar', { name: '全屏文本工具' })).toContainElement(
      within(dialog).getByRole('button', { name: '关闭全屏编辑' }),
    )
    expect(within(dialog).getByLabelText('全屏编辑文本')).toHaveValue('傍晚的未来城市，樱花沿街盛开。')
  })

  it.each([
    ['image', '图片全屏预览', 'preview-image'],
    ['video', '视频全屏预览', 'preview-video'],
  ] as const)('gives the %s preview its dedicated near-viewport panel', (nodeType, dialogName, panelClass) => {
    renderPreview({
      nodeType,
      title: nodeType === 'image' ? '图片' : '视频',
      content: `${nodeType} preview`,
      status: 'ready',
      sourceKind: 'generated',
      media: nodeType === 'video' ? { url: '/preview.mp4', width: 1280, height: 720 } : undefined,
    })

    const dialog = screen.getByRole('dialog', { name: dialogName })
    expect(dialog.querySelector('section')).toHaveClass('node-preview-panel', panelClass)
    expect(within(dialog).getByRole('button', { name: '关闭全屏预览' })).toBeInTheDocument()
  })

  it('closes the active preview with Escape', () => {
    const { onClose } = renderPreview({
      nodeType: 'text',
      title: '文本',
      content: '内容',
      status: 'ready',
      sourceKind: 'generated',
    })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
