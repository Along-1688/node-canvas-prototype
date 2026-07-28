import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MediaErrorState } from '../nodes'

describe('media generation error state', () => {
  it('shows the concrete failure reason and keeps retry available', () => {
    const onRetry = vi.fn()

    render(<MediaErrorState error="内容审核未通过：请替换未授权素材。" onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('内容审核未通过：请替换未授权素材。')
    fireEvent.click(screen.getByRole('button', { name: '重新生成' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('uses a recoverable fallback when an older task has no error text', () => {
    render(<MediaErrorState onRetry={() => undefined} />)

    expect(screen.getByRole('alert')).toHaveTextContent('生成任务未完成，请稍后重试。')
  })
})

