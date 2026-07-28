import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasActionContext } from '../canvasContext'
import { LipSyncPanel, VideoEditPanel } from '../nodes'
import type { CanvasNodeData } from '../types'

function renderWithActions(ui: React.ReactNode, actions: Record<string, unknown>) {
  return render(<CanvasActionContext.Provider value={actions as never}>{ui}</CanvasActionContext.Provider>)
}

describe('V1.9 video tools', () => {
  const lipSourceData: CanvasNodeData = {
    nodeType: 'video',
    title: '主播探店视频 01',
    status: 'success',
    sourceKind: 'upload',
    media: { url: '/source.mp4', posterUrl: '/poster.jpg', duration: 8, width: 1248, height: 1664 },
  }

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:local-reference') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps lip sync in one inline panel and opens a working fixed voice picker', () => {
    const createLipSyncDerivative = vi.fn()
    const { container } = renderWithActions(<LipSyncPanel id="video-source" data={lipSourceData} onClose={vi.fn()} />, {
      createLipSyncDerivative,
      notify: vi.fn(),
    })

    expect(container.querySelector('.lip-sync-panel')).toBeInTheDocument()
    expect(screen.queryByText('确认视频')).not.toBeInTheDocument()
    expect(screen.queryByText('下一步')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /主播 当前视频/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '立即生成' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '选择声音' }))
    expect(screen.getByRole('dialog', { name: '选择声音' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '克隆声音' }))
    fireEvent.change(screen.getByLabelText('上传克隆声音样本'), {
      target: { files: [new File(['voice'], 'voice-demo.wav', { type: 'audio/wav' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: '确定' }))
    expect(screen.getByText('voice-demo.wav · 克隆')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('输入需要人物说出的内容'), { target: { value: '今天带你了解新品' } })
    fireEvent.click(screen.getByRole('button', { name: '立即生成' }))
    expect(createLipSyncDerivative).toHaveBeenCalledWith('video-source', expect.objectContaining({
      operation: 'lip-sync',
      personId: 'person-primary',
      personLabel: '主播',
      source: 'ai',
      script: '今天带你了解新品',
      voiceId: expect.stringMatching(/^clone:voice-demo\.wav:/),
      speed: 1,
      pitch: 0,
    }))
  })

  it('closes only the voice picker on Escape', () => {
    const onClose = vi.fn()
    renderWithActions(<LipSyncPanel id="video-source" data={lipSourceData} onClose={onClose} />, {
      createLipSyncDerivative: vi.fn(),
      notify: vi.fn(),
    })

    fireEvent.click(screen.getByRole('button', { name: '选择声音' }))
    fireEvent.keyDown(screen.getByRole('dialog', { name: '选择声音' }), { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: '选择声音' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('对口型配置')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('requires an explicit keyframe and keeps only that frame plus local upload as edit inputs', () => {
    const completeVideoEdit = vi.fn()
    const notify = vi.fn()
    const updateNode = vi.fn()
    const data: CanvasNodeData = {
      nodeType: 'video',
      title: '主播视频',
      status: 'ready',
      sourceKind: 'generated',
      content: '待编辑视频',
      videoOperation: { operation: 'edit', selectedTime: .5, prompt: '' },
      media: {
        url: '/source.mp4',
        posterUrl: '/poster.jpg',
        duration: 8,
        width: 1280,
        height: 720,
        timelineFrameUrls: ['/frame-1.jpg', '/frame-2.jpg'],
      },
    }
    renderWithActions(<VideoEditPanel id="video-edit" data={data} />, {
      cancelPendingVideoOperation: vi.fn(),
      completeVideoEdit,
      notify,
      updateNode,
      videoEditAssets: [{ id: 'canvas:old', title: '不应显示的画布素材' }],
    })

    expect(screen.queryByAltText('已选关键帧')).not.toBeInTheDocument()
    expect(screen.queryByText('参考素材')).not.toBeInTheDocument()
    expect(screen.queryByText('不应显示的画布素材')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /生成图片/ })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '选择 0.5 秒画面' }))
    expect(screen.getByAltText('已选关键帧')).toHaveAttribute('src', '/frame-1.jpg')
    expect(
      screen.getByText('0:00', { selector: '.video-edit-selected-frame small' }),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('上传视频编辑参考图'), {
      target: { files: [new File(['image'], 'wardrobe.png', { type: 'image/png' })] },
    })
    fireEvent.change(screen.getByPlaceholderText(/保持镜头运动/), { target: { value: '将主播服装改为浅绿色' } })
    fireEvent.click(screen.getByRole('button', { name: /生成图片/ }))

    expect(screen.getByAltText('生成后的关键帧')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /生成视频/ }))
    expect(completeVideoEdit).toHaveBeenCalledWith('video-edit', expect.objectContaining({
      operation: 'edit',
      selectedTime: .5,
      prompt: '将主播服装改为浅绿色',
      referenceAssetId: expect.stringMatching(/^local:wardrobe\.png:/),
      referenceAssetLabel: 'wardrobe.png',
      referenceMedia: expect.objectContaining({ url: 'blob:local-reference', mimeType: 'image/png' }),
      previewUrl: '/frame-1.jpg',
      selectedPreviewId: expect.stringMatching(/^video-edit-preview-/),
      previewResults: [expect.objectContaining({ prompt: '将主播服装改为浅绿色' })],
    }))
  })

  it('keeps multiple image results and applies the selected result snapshot', () => {
    const completeVideoEdit = vi.fn()
    const notify = vi.fn()
    const updateNode = vi.fn()
    const data: CanvasNodeData = {
      nodeType: 'video',
      title: '横屏广告短片',
      status: 'ready',
      sourceKind: 'generated',
      content: '待编辑视频',
      videoOperation: { operation: 'edit', selectedTime: .5, prompt: '' },
      media: {
        url: '/source.mp4',
        posterUrl: '/poster.jpg',
        duration: 8,
        width: 1280,
        height: 720,
        timelineFrameUrls: ['/frame-1.jpg', '/frame-2.jpg'],
      },
    }
    const view = renderWithActions(<VideoEditPanel id="video-edit" data={data} />, {
      cancelPendingVideoOperation: vi.fn(),
      completeVideoEdit,
      notify,
      updateNode,
    })

    fireEvent.click(screen.getByRole('button', { name: '选择 0.5 秒画面' }))
    const promptInput = screen.getByPlaceholderText(/保持镜头运动/)
    fireEvent.change(promptInput, { target: { value: '方案 A：浅绿色服装' } })
    fireEvent.click(screen.getByRole('button', { name: /生成图片/ }))
    fireEvent.change(promptInput, { target: { value: '方案 B：深蓝色服装' } })
    fireEvent.click(screen.getByRole('button', { name: /生成图片/ }))

    expect(screen.getAllByAltText('生成后的关键帧')).toHaveLength(2)
    const resultButtons = screen.getAllByRole('button', { name: /选择图片结果/ })
    expect(resultButtons).toHaveLength(2)
    expect(resultButtons[0]).toHaveAttribute('aria-pressed', 'false')
    expect(resultButtons[1]).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(resultButtons[0])
    expect(resultButtons[0]).toHaveAttribute('aria-pressed', 'true')
    expect(resultButtons[1]).toHaveAttribute('aria-pressed', 'false')
    expect(promptInput).toHaveValue('方案 A：浅绿色服装')
    fireEvent.click(screen.getByRole('button', { name: /生成视频/ }))

    const selectedOperation = completeVideoEdit.mock.calls[0][1]
    expect(selectedOperation.prompt).toBe('方案 A：浅绿色服装')
    expect(selectedOperation.previewResults).toHaveLength(2)
    expect(selectedOperation.previewResults.map((result: { prompt: string }) => result.prompt)).toEqual([
      '方案 A：浅绿色服装',
      '方案 B：深蓝色服装',
    ])
    expect(selectedOperation.selectedPreviewId).toBe(selectedOperation.previewResults[0].id)

    const savedOperation = updateNode.mock.calls.at(-1)?.[1].videoOperation as CanvasNodeData['videoOperation']
    view.unmount()
    renderWithActions(<VideoEditPanel id="video-edit" data={{ ...data, videoOperation: savedOperation }} />, {
      cancelPendingVideoOperation: vi.fn(),
      completeVideoEdit: vi.fn(),
      notify: vi.fn(),
      updateNode: vi.fn(),
    })
    const restoredButtons = screen.getAllByRole('button', { name: /选择图片结果/ })
    expect(restoredButtons).toHaveLength(2)
    expect(restoredButtons[0]).toHaveAttribute('aria-pressed', 'true')
  })
})

