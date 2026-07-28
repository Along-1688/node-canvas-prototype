import { fireEvent, render } from '@testing-library/react'
import { Position } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'
import { CanvasActionContext } from '../canvasContext'
import { SmartPort } from '../nodes'

const updateNodeInternals = vi.hoisted(() => vi.fn())

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    Handle: ({ children, id, className, style, tabIndex, onClick, onKeyDown, ...props }: React.HTMLAttributes<HTMLButtonElement> & { id: string }) => (
      <button
        type="button"
        data-handle-id={id}
        className={className}
        style={style}
        tabIndex={tabIndex}
        onClick={onClick}
        onKeyDown={onKeyDown}
        aria-label={props['aria-label']}
        aria-hidden={props['aria-hidden']}
      >
        {children}
      </button>
    ),
    useUpdateNodeInternals: () => updateNodeInternals,
  }
})

describe('SmartPort', () => {
  it('refreshes React Flow internals after the launcher offset moves', () => {
    const { container } = render(
      <CanvasActionContext.Provider value={{ openContinuation: vi.fn() } as never}>
        <SmartPort nodeId="node-video" id="output" type="source" position={Position.Right} label="输出端口" />
      </CanvasActionContext.Provider>,
    )

    const anchor = container.querySelector<HTMLElement>('[data-handle-id="output"]')!
    const track = container.querySelector<HTMLElement>('.port-track-right')!
    const launcher = container.querySelector<HTMLElement>('[data-handle-id="output-launcher"]')!
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ top: 10, height: 200 } as DOMRect)

    expect(anchor).toHaveClass('port-anchor-right')
    expect(anchor).toHaveAttribute('aria-hidden', 'true')
    expect(updateNodeInternals).toHaveBeenLastCalledWith('node-video')
    expect(launcher).toHaveStyle({ top: '70px' })

    fireEvent(track, new MouseEvent('pointermove', { bubbles: true, clientY: 130 }))

    expect(launcher).toHaveStyle({ top: '120px' })
    expect(updateNodeInternals).toHaveBeenCalledTimes(2)
    expect(updateNodeInternals).toHaveBeenLastCalledWith('node-video')
  })
})
