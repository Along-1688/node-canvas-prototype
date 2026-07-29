import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CanvasActionContext } from '../canvasContext'
import { AudioConfig, AudioTrimEditor } from '../nodes'
import type { CanvasNodeData } from '../types'

describe('AudioTrimEditor', () => {
  it('keeps two independent handles so a middle segment can be selected and generated', () => {
    const createAudioTrimDerivative = vi.fn()
    render(
      <CanvasActionContext.Provider value={{ createAudioTrimDerivative } as never}>
        <AudioTrimEditor id="audio-source" duration={12} onCancel={vi.fn()} />
      </CanvasActionContext.Provider>,
    )

    const startHandle = screen.getByRole('button', { name: '裁剪开始位置' })
    const endHandle = screen.getByRole('button', { name: '裁剪结束位置' })
    expect(startHandle).toBeVisible()
    expect(endHandle).toBeVisible()
    expect(screen.queryByText('00:03 - 00:09')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '试听裁剪片段' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '试听裁剪片段' }))
    expect(screen.getByRole('button', { name: '暂停试听裁剪片段' })).toBeVisible()

    for (let index = 0; index < 20; index += 1) fireEvent.keyDown(startHandle, { key: 'ArrowRight' })

    expect(screen.queryByText('00:04 - 00:09')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '生成' }))
    expect(createAudioTrimDerivative).toHaveBeenCalledWith('audio-source', expect.objectContaining({ operation: 'trim', start: expect.closeTo(4, 5), end: 9 }))
  })

  it('loads an audio source so the selected segment can be heard', () => {
    render(
      <CanvasActionContext.Provider value={{ createAudioTrimDerivative: vi.fn() } as never}>
        <AudioTrimEditor id="audio-source" duration={3.816} sourceUrl="/node-canvas-prototype/assets/node-canvas-welcome.mp3" onCancel={vi.fn()} />
      </CanvasActionContext.Provider>,
    )

    expect(screen.getByLabelText('裁剪试听音频')).toHaveAttribute('src', '/node-canvas-prototype/assets/node-canvas-welcome.mp3')
  })

  it('removes reference-audio and voice-library additions for MiniMax Speech', () => {
    const data: CanvasNodeData = {
      nodeType: 'audio',
      title: '音频节点',
      status: 'success',
      sourceKind: 'generated',
      modelId: 'minimax-speech-2.8',
      localPrompt: '欢迎来到节点式画布',
      params: { voiceId: 'elegant-senior', voiceLabel: '淡雅学姐' },
    }
    render(
      <CanvasActionContext.Provider value={{ updateNode: vi.fn(), runGeneration: vi.fn(), beginReferenceSelection: vi.fn() } as never}>
        <AudioConfig id="audio-minimax" data={data} />
      </CanvasActionContext.Provider>,
    )

    expect(screen.queryByLabelText('音频参考与音色')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '音频' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '音色库' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '停顿' })).toBeVisible()
    expect(screen.getByRole('button', { name: '语气词' })).toBeVisible()
    expect(screen.getByRole('button', { name: '选择音色' })).toBeVisible()
  })
})
