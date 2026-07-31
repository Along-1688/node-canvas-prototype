import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasActionContext } from '../canvasContext'
import { ImageNode } from '../nodes'
import type { CanvasNodeData } from '../types'

const setViewport = vi.hoisted(() => vi.fn())
const updateNodeInternals = vi.hoisted(() => vi.fn())

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    Handle: ({ children, id, className }: { children?: ReactNode; id: string; className?: string }) => <button type="button" data-handle-id={id} className={className}>{children}</button>,
    useReactFlow: () => ({ setViewport }),
    useUpdateNodeInternals: () => updateNodeInternals,
    useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
  }
})

function savedEditorData(operation: 'image-editor' | 'image-compose'): CanvasNodeData {
  return {
    nodeType: 'image',
    title: '图片编辑器',
    content: '图片编辑结果',
    status: 'success',
    sourceKind: 'generated',
    imageOperation: {
      operation,
      aspectRatio: 'custom',
      editorComposition: {
        version: 2,
        aspectRatio: 'custom',
        backgroundColor: '#ffffff',
        width: 1000,
        height: 1000,
        fabricJson: { version: '6.9.1', objects: [] },
        sourceNodeIds: ['source-image'],
        renderedDataUrl: 'data:image/png;base64,saved-editor-result',
      },
    },
  }
}

describe('saved image editor node', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(['image-editor', 'image-compose'] as const)('keeps only preview actions in the %s toolbar and reopens on a selected preview click', (operation) => {
    const openImageEditor = vi.fn()
    const imageNodeProps = { id: 'saved-editor', data: savedEditorData(operation), selected: true } as unknown as ComponentProps<typeof ImageNode>
    render(
      <CanvasActionContext.Provider value={{
        openImageEditor,
        openContinuation: vi.fn(),
        openContextAdd: vi.fn(),
        updateNode: vi.fn(),
        notify: vi.fn(),
        selectedItemCount: 1,
        interactionMode: null,
        isInteractionCandidate: vi.fn(() => false),
        isConnectionTargetCandidate: vi.fn(() => false),
        markersForSource: vi.fn(() => []),
        hoverPromptMarker: vi.fn(),
      } as never}>
        <ImageNode {...imageNodeProps} />
      </CanvasActionContext.Provider>,
    )

    const toolbar = screen.getByRole('toolbar', { name: '图片编辑器工具' })
    expect(within(toolbar).getByRole('button', { name: '下载图片' })).toBeVisible()
    expect(within(toolbar).getByRole('button', { name: '全屏预览' })).toBeVisible()
    expect(within(toolbar).queryByRole('button', { name: '继续编辑' })).not.toBeInTheDocument()
    expect(within(toolbar).queryByRole('button', { name: '裁剪' })).not.toBeInTheDocument()
    expect(within(toolbar).queryByRole('button', { name: 'Pin 标记' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '收藏图片' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('img', { name: '图片编辑结果' }))

    expect(openImageEditor).toHaveBeenCalledOnce()
    expect(openImageEditor).toHaveBeenCalledWith('saved-editor')
  })
})
