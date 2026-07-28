import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  compositionSourceNodeIds,
  createImageEditorComposition,
  IMAGE_EDITOR_DIMENSIONS,
  ImageEditorCompositionPreview,
  ImageEditorWorkspace,
  normalizeImageEditorComposition,
  sanitizeImageEditorFilename,
} from '../imageEditor'
import type { ImageEditorAsset, ImageEditorCommitPayload, ImageEditorCommitResult, ImageEditorGenerateRequest } from '../types'

vi.mock('../imageEditorWorkspace', () => ({
  ImageEditorWorkspace: ({ source, assets, onGenerate }: { source?: ImageEditorAsset; assets: ImageEditorAsset[]; onGenerate?: (request: ImageEditorGenerateRequest) => void }) => (
    <div data-testid="fabric-workspace">
      {source?.title ?? '空白画布'} · {assets.length}
      <button type="button" onClick={() => onGenerate?.({ prompt: '生成夜景', count: 1, coverDataUrl: 'data:image/png;base64,cover', width: 800, height: 450, sourceNodeIds: ['saved-editor-image'], outputNodeId: 'saved-editor-image' })}>发起外层生成</button>
    </div>
  ),
}))

const source: ImageEditorAsset = {
  id: 'source-image',
  sourceNodeId: 'image-source',
  title: '横版源图',
  src: '/assets/source.png',
  aspectRatio: 16 / 9,
}

describe('image editor project model', () => {
  it('uses the same fixed document dimensions as the reference editor', () => {
    expect(IMAGE_EDITOR_DIMENSIONS).toMatchObject({
      custom: { width: 1000, height: 1000 },
      '16:9': { width: 800, height: 450 },
      '9:16': { width: 450, height: 800 },
      '21:9': { width: 700, height: 300 },
    })
  })

  it('creates a versioned, source-aware Fabric project instead of percentage layers', () => {
    expect(createImageEditorComposition(source)).toEqual({
      version: 2,
      aspectRatio: 'custom',
      backgroundColor: '#ffffff',
      width: 1000,
      height: 1000,
      fabricJson: { version: '6.9.1', objects: [] },
      sourceNodeIds: ['image-source'],
    })
  })

  it('migrates a legacy project without losing its source lineage', () => {
    const migrated = normalizeImageEditorComposition({
      aspectRatio: '16:9',
      backgroundColor: '#121212',
      prompt: '保留旧工程',
      layers: [{
        id: 'legacy-image',
        kind: 'image',
        sourceNodeId: 'legacy-source',
        src: '/legacy.png',
        label: '旧图',
        x: 50,
        y: 50,
        width: 70,
        height: 40,
      }],
    }, source)

    expect(migrated).toMatchObject({
      version: 2,
      aspectRatio: '16:9',
      width: 800,
      height: 450,
      prompt: '保留旧工程',
      sourceNodeIds: ['legacy-source', 'image-source'],
    })
    expect(migrated.layers).toHaveLength(1)
  })

  it('deduplicates declared and object-level source ids', () => {
    expect(compositionSourceNodeIds({
      sourceNodeIds: ['source-a', 'source-a', 'source-b'],
      layers: [{ sourceNodeId: 'source-b' }, { sourceNodeId: 'source-c' }],
    })).toEqual(['source-a', 'source-b', 'source-c'])
  })

  it('sanitizes exported filenames without erasing Chinese names', () => {
    expect(sanitizeImageEditorFilename(' 图片编辑：最终版?.png ')).toBe('图片编辑-最终版-.png')
    expect(sanitizeImageEditorFilename('CON')).toBe('_CON')
  })
})

describe('image editor lightweight shell', () => {
  it('renders the real saved bitmap as the node preview', () => {
    const composition = {
      ...createImageEditorComposition(),
      renderedDataUrl: 'data:image/png;base64,rendered-result',
    }
    const { container } = render(<ImageEditorCompositionPreview composition={composition} />)

    const preview = container.querySelector<HTMLImageElement>('.image-editor-rendered-preview')
    expect(preview).toHaveAttribute('src', composition.renderedDataUrl)
    expect(preview).toHaveStyle({ width: '100%', height: '100%' })
  })

  it('keeps a legacy visual fallback until the project is saved again', () => {
    const composition = normalizeImageEditorComposition({
      aspectRatio: '1:1',
      backgroundColor: '#ffffff',
      layers: [{
        id: 'legacy-text',
        kind: 'text',
        x: 50,
        y: 50,
        width: 30,
        height: 10,
        text: '旧文字',
        color: '#111111',
        fontSize: 32,
        weight: 500,
      }],
    })

    render(<ImageEditorCompositionPreview composition={composition} />)
    expect(screen.getByText('旧文字')).toBeInTheDocument()
  })

  it('renders the Fabric workspace in a portal and forwards the saved source id', async () => {
    const onSave = vi.fn<(payload: ImageEditorCommitPayload) => ImageEditorCommitResult>()
    const onGenerate = vi.fn<(request: ImageEditorGenerateRequest) => void>()
    render(<ImageEditorWorkspace source={source} assets={[source]} onClose={vi.fn()} onSave={onSave} onGenerate={onGenerate} />)

    await waitFor(() => expect(screen.getByTestId('fabric-workspace')).toHaveTextContent('横版源图 · 1'))
    fireEvent.click(screen.getByRole('button', { name: '发起外层生成' }))
    expect(onGenerate).toHaveBeenCalledWith({
      prompt: '生成夜景',
      count: 1,
      coverDataUrl: 'data:image/png;base64,cover',
      width: 800,
      height: 450,
      sourceNodeIds: ['saved-editor-image'],
      outputNodeId: 'saved-editor-image',
    })
  })
})
