import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Path as FabricPath, Rect as FabricRect } from 'fabric'
import type { ImageEditorCommitPayload, ImageEditorComposition, ImageEditorGenerateRequest } from '../types'
import { ImageEditorWorkspace } from '../imageEditorWorkspace'

type FabricCanvasHarness = {
  add: (...objects: unknown[]) => FabricCanvasHarness
  emit: (eventName: string, payload?: unknown) => void
  freeDrawingBrush: unknown
  getObjects: () => unknown[]
  insertAt: (index: number, ...objects: unknown[]) => FabricCanvasHarness
  lastRenderedObjects: unknown[]
  loadFromJSON: (json: string | Record<string, unknown>) => Promise<FabricCanvasHarness>
  setActiveObject: (object: unknown) => FabricCanvasHarness
  toJSON: () => { version: string; objects: Array<Record<string, unknown>> }
}

const fabricHarness = vi.hoisted(() => ({
  canvases: [] as FabricCanvasHarness[],
}))

vi.mock('fabric', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fabric')>()
  const serializationProperties = () => Array.from(new Set([
    ...actual.FabricObject.customProperties,
    'excludeFromExport',
    'selectable',
    'evented',
  ]))

  const enlivenCanvasObject = async (serialized: Record<string, unknown>) => {
    if (serialized.type === 'Image') {
      const width = Math.max(1, Number(serialized.width) || 1)
      const height = Math.max(1, Number(serialized.height) || 1)
      const element = document.createElement('img')
      element.width = width
      element.height = height
      Object.defineProperty(element, 'naturalWidth', { configurable: true, value: width })
      Object.defineProperty(element, 'naturalHeight', { configurable: true, value: height })
      if (typeof serialized.src === 'string') element.setAttribute('src', serialized.src)
      const {
        type: _type,
        src: _src,
        filters: _filters,
        resizeFilter: _resizeFilter,
        ...options
      } = serialized
      return new actual.FabricImage(element, options)
    }
    const [object] = await actual.util.enlivenObjects([structuredClone(serialized)])
    return object
  }

  class JSDOMActiveSelection {
    private objects: unknown[]

    constructor(objects: unknown[]) {
      this.objects = objects
    }

    getObjects() {
      return [...this.objects]
    }
  }

  class JSDOMCanvas {
    backgroundColor: string | undefined
    defaultCursor = 'default'
    freeDrawingBrush: unknown
    isDrawingMode = false
    lowerCanvasEl: HTMLCanvasElement
    lastRenderedObjects: unknown[] = []
    preserveObjectStacking = true
    selection = true
    upperCanvasEl: HTMLCanvasElement
    wrapperEl: HTMLDivElement
    private activeObject: unknown = null
    private height = 1
    private objects: unknown[] = []
    private width = 1
    private listeners = new Map<string, Set<(...args: unknown[]) => void>>()

    constructor(element: HTMLCanvasElement, options: { width?: number; height?: number; backgroundColor?: string } = {}) {
      this.lowerCanvasEl = element
      this.upperCanvasEl = document.createElement('canvas')
      this.wrapperEl = document.createElement('div')
      this.width = options.width ?? 1
      this.height = options.height ?? 1
      this.backgroundColor = options.backgroundColor
      fabricHarness.canvases.push(this)
    }

    add(...objects: unknown[]) {
      this.objects.push(...objects)
      return this
    }

    calcOffset() {}

    discardActiveObject() {
      this.activeObject = null
      return this
    }

    async dispose() {}

    emit(eventName: string, payload?: unknown) {
      this.listeners.get(eventName)?.forEach((listener) => listener(payload))
    }

    getActiveObject() {
      return this.activeObject
    }

    getObjects() {
      return [...this.objects]
    }

    insertAt(index: number, ...objects: unknown[]) {
      this.objects.splice(Math.max(0, Math.min(index, this.objects.length)), 0, ...objects)
      return this
    }

    async loadFromJSON(json: string | Record<string, unknown>) {
      const parsed = typeof json === 'string'
        ? JSON.parse(json) as Record<string, unknown>
        : json
      const serialized = Array.isArray(parsed.objects)
        ? parsed.objects.filter((object): object is Record<string, unknown> => Boolean(object) && typeof object === 'object')
        : []
      this.objects = (await Promise.all(serialized.map(enlivenCanvasObject))).filter(Boolean)
      this.activeObject = null
      if (typeof parsed.background === 'string') this.backgroundColor = parsed.background
      return this
    }

    moveObjectTo(object: unknown, index: number) {
      const currentIndex = this.objects.indexOf(object)
      if (currentIndex < 0) return this
      this.objects.splice(currentIndex, 1)
      this.objects.splice(Math.max(0, Math.min(index, this.objects.length)), 0, object)
      return this
    }

    off(eventName: string, listener: (...args: unknown[]) => void) {
      this.listeners.get(eventName)?.delete(listener)
      return this
    }

    on(eventName: string, listener: (...args: unknown[]) => void) {
      const listeners = this.listeners.get(eventName) ?? new Set()
      listeners.add(listener)
      this.listeners.set(eventName, listeners)
      return this
    }

    remove(...objects: unknown[]) {
      this.objects = this.objects.filter((object) => !objects.includes(object))
      return this
    }

    requestRenderAll() {}

    setActiveObject(object: unknown) {
      this.activeObject = object
      return this
    }

    setDimensions({ width, height }: { width: number; height: number }) {
      this.width = width
      this.height = height
      this.lowerCanvasEl.width = width
      this.lowerCanvasEl.height = height
      this.upperCanvasEl.width = width
      this.upperCanvasEl.height = height
      return this
    }

    toCanvasElement(multiplier = 1, options: { filter?: (object: unknown) => boolean } = {}) {
      this.lastRenderedObjects = options.filter ? this.objects.filter(options.filter) : [...this.objects]
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(this.width * multiplier)
      canvas.height = Math.round(this.height * multiplier)
      return canvas
    }

    toJSON(propertiesToInclude: string[] = []) {
      const properties = Array.from(new Set([...serializationProperties(), ...propertiesToInclude]))
      return {
        version: '6.9.1',
        objects: this.objects.map((object) => {
          if (!object || typeof object !== 'object' || !('toObject' in object)) return structuredClone(object) as Record<string, unknown>
          return (object as { toObject: (properties: string[]) => Record<string, unknown> }).toObject(properties)
        }),
      }
    }
  }

  return { ...actual, ActiveSelection: JSDOMActiveSelection, Canvas: JSDOMCanvas }
})

const initialComposition: ImageEditorComposition = {
  version: 2,
  aspectRatio: '16:9',
  backgroundColor: '#ffffff',
  width: 800,
  height: 450,
  fabricJson: { version: '6.9.1', objects: [] },
  sourceNodeIds: [],
}

const originalScrollTo = HTMLElement.prototype.scrollTo
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe('real image editor workspace wiring', () => {
  beforeEach(() => {
    fabricHarness.canvases.length = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,workspace-cover')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: originalScrollTo })
    else delete (HTMLElement.prototype as { scrollTo?: typeof HTMLElement.prototype.scrollTo }).scrollTo
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: originalScrollIntoView })
    else delete (HTMLElement.prototype as { scrollIntoView?: typeof HTMLElement.prototype.scrollIntoView }).scrollIntoView
  })

  it('keeps canvas pictures separate and filters image-only asset categories', () => {
    render(
      <ImageEditorWorkspace
        assets={[]}
        historyAssets={[{
          id: 'generated-asset', sourceNodeId: 'generated-node', title: '生成图片', src: 'data:image/png;base64,generated', libraryCategory: 'generated',
        }, {
          id: 'favorite-asset', sourceNodeId: 'favorite-node', title: '收藏图片', src: 'data:image/png;base64,favorite', libraryCategory: 'favorite',
        }, {
          id: 'uncategorized-asset', sourceNodeId: 'uncategorized-node', title: '未分类图片', src: 'data:image/png;base64,uncategorized', libraryCategory: 'uncategorized',
        }]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )

    expect(screen.queryByRole('button', { name: '历史素材' })).not.toBeInTheDocument()
    const canvasAssetsButton = screen.getByRole('button', { name: '画布素材' })
    expect(canvasAssetsButton.querySelector('.lucide-image')).toBeInTheDocument()
    fireEvent.click(canvasAssetsButton)
    expect(screen.getByRole('complementary', { name: '画布素材' })).not.toHaveTextContent('关联的图片')
    expect(screen.queryByRole('tablist', { name: '图片来源' })).not.toBeInTheDocument()
    const assetButton = screen.getByRole('button', { name: '资产' })
    expect(assetButton.querySelector('.lucide-folder-open')).toBeInTheDocument()
    fireEvent.click(assetButton)
    const assetsPanel = screen.getByRole('complementary', { name: '资产' })
    expect(within(assetsPanel).getByRole('tab', { name: '全部' })).toHaveAttribute('aria-selected', 'true')
    expect(within(assetsPanel).getByRole('button', { name: '添加资产 生成图片' })).toBeInTheDocument()
    expect(within(assetsPanel).getByRole('button', { name: '添加资产 收藏图片' })).toBeInTheDocument()
    fireEvent.click(within(assetsPanel).getByRole('tab', { name: '全部生成' }))
    expect(within(assetsPanel).getByRole('button', { name: '添加资产 生成图片' })).toBeInTheDocument()
    expect(within(assetsPanel).queryByRole('button', { name: '添加资产 收藏图片' })).not.toBeInTheDocument()
  })

  it('anchors canvas background settings beside the top-left trigger', () => {
    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '画布背景色' }))
    expect(screen.getByRole('dialog', { name: '画布背景色' })).toHaveClass('is-background')
  })

  it('uses TapNow image counts 1/2/4 and cycles from the value button', async () => {
    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )

    const decrease = screen.getByRole('button', { name: '减少生成数量' })
    const increase = screen.getByRole('button', { name: '增加生成数量' })
    const countControl = screen.getByLabelText('生成数量')
    const count = () => within(countControl).getByRole('button', { name: '循环生成数量' })

    expect(count()).toHaveTextContent('4')
    expect(increase).toBeDisabled()

    fireEvent.click(count())
    expect(count()).toHaveTextContent('1')

    fireEvent.click(increase)
    expect(count()).toHaveTextContent('2')
    fireEvent.click(increase)
    expect(count()).toHaveTextContent('4')
    fireEvent.click(decrease)
    expect(count()).toHaveTextContent('2')
    fireEvent.click(decrease)
    expect(count()).toHaveTextContent('1')
    expect(decrease).toBeDisabled()
  })

  it('routes image generation through the real workspace callback', async () => {
    const onGenerate = vi.fn<(request: ImageEditorGenerateRequest) => Promise<void>>().mockResolvedValue()
    const onSave = vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })
    const onClose = vi.fn()

    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={onClose}
        onGenerate={onGenerate}
        onSave={onSave}
      />,
    )

    const prompt = screen.getByRole('textbox', { name: '图片生成提示词' })
    fireEvent.change(prompt, { target: { value: '把白天改成夜景' } })
    fireEvent.click(screen.getByRole('button', { name: '减少生成数量' }))
    fireEvent.click(screen.getByRole('button', { name: '生成' }))

    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1))
    expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({
      mediaType: 'image',
      prompt: '把白天改成夜景',
      count: 2,
      coverDataUrl: 'data:image/png;base64,workspace-cover',
      aspectRatio: '16:9',
      modelId: 'gemini-banana-2',
      sourceNodeIds: ['saved-editor-node'],
      outputNodeId: 'saved-editor-node',
    }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(onSave.mock.invocationCallOrder[0]).toBeLessThan(onGenerate.mock.invocationCallOrder[0])
  })

  it('keeps the editor open when task creation fails', async () => {
    const onGenerate = vi.fn<(request: ImageEditorGenerateRequest) => Promise<void>>()
      .mockRejectedValue(new Error('generation unavailable'))
    const onSave = vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })
    const onClose = vi.fn()

    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={onClose}
        onGenerate={onGenerate}
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: '图片生成提示词' }), { target: { value: '保留当前输入' } })
    fireEvent.click(screen.getByRole('button', { name: '生成' }))

    expect(await screen.findByText('生成任务创建失败，请重试')).toBeInTheDocument()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({
      outputNodeId: 'saved-editor-node',
      sourceNodeIds: ['saved-editor-node'],
    }))
    expect(onClose).not.toHaveBeenCalled()
    expect(onSave.mock.invocationCallOrder[0]).toBeLessThan(onGenerate.mock.invocationCallOrder[0])
  })

  it('switches the TapNow prompt between image and video generation', () => {
    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )

    expect(screen.getByRole('textbox', { name: '图片生成提示词' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '图片生成模式' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '视频生成模式' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '图片生成模式' }))

    expect(screen.getByRole('button', { name: '视频生成模式' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '视频生成提示词' })).toBeInTheDocument()
    expect(screen.getByText('Seedance 2.0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换视频时长' })).toHaveTextContent('5s')
    expect(screen.getByRole('button', { name: '切换视频分辨率' })).toHaveTextContent('720p')
    expect(within(screen.getByLabelText('生成数量')).getByRole('button', { name: '循环生成数量' })).toHaveTextContent('1')
  })

  it('routes video generation with TapNow model parameters and a supported canvas ratio', async () => {
    const onGenerate = vi.fn<(request: ImageEditorGenerateRequest) => Promise<void>>().mockResolvedValue()
    const onSave = vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })
    const customComposition: ImageEditorComposition = {
      ...initialComposition,
      aspectRatio: 'custom',
      width: 1000,
      height: 1000,
    }

    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={customComposition}
        onClose={vi.fn()}
        onGenerate={onGenerate}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '图片生成模式' }))
    expect(screen.getByRole('button', { name: '画布比例' })).toHaveTextContent('16:9')
    fireEvent.change(screen.getByRole('textbox', { name: '视频生成提示词' }), { target: { value: '镜头缓慢向前推进' } })
    fireEvent.click(screen.getByRole('button', { name: '增加生成数量' }))
    fireEvent.click(screen.getByRole('button', { name: '生成' }))

    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1))
    expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({
      mediaType: 'video',
      prompt: '镜头缓慢向前推进',
      count: 2,
      duration: 5,
      resolution: '720p',
      aspectRatio: '16:9',
      modelId: 'seedance-2',
      sourceNodeIds: ['saved-editor-node'],
      outputNodeId: 'saved-editor-node',
    }))
    expect(onSave.mock.invocationCallOrder[0]).toBeLessThan(onGenerate.mock.invocationCallOrder[0])
  })

  it('opens the custom TapNow ratio menu with every supported ratio', () => {
    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )

    const trigger = screen.getByRole('button', { name: '画布比例' })
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu', { name: '选择画布比例' })
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(11)
    expect(within(menu).getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'custom', '16:9', '9:16', '4:3', '3:4', '1:1', '3:2', '2:3', '7:4', '4:7', '21:9',
    ])

    fireEvent.click(within(menu).getByRole('menuitemradio', { name: '1:1' }))
    expect(trigger).toHaveTextContent('1:1')
    expect(screen.queryByRole('menu', { name: '选择画布比例' })).not.toBeInTheDocument()
  })

  it('keeps brush width and the four TapNow presets inside the color popover', async () => {
    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '绘制' }))
    const drawToolbar = screen.getByRole('toolbar', { name: '绘制属性' })
    expect(within(drawToolbar).getByRole('button', { name: '画笔' })).toBeInTheDocument()
    expect(within(drawToolbar).getByRole('button', { name: '橡皮擦' })).toBeInTheDocument()
    expect(within(drawToolbar).queryByRole('button', { name: '笔触宽度' })).not.toBeInTheDocument()

    fireEvent.click(within(drawToolbar).getByRole('button', { name: '绘制颜色' }))
    const popover = screen.getByRole('dialog', { name: '绘制颜色' })
    const width = within(popover).getByRole('slider', { name: '画笔宽度' })
    expect(width).toHaveValue('4')
    for (const swatch of ['#1f4a61', '#5f9fc1', '#fab4c7', '#ffecac']) {
      expect(within(popover).getByRole('button', { name: `绘制颜色 ${swatch}` })).toBeInTheDocument()
    }
    expect(within(popover).getByRole('slider', { name: '绘制颜色 Color' })).toBeInTheDocument()
    expect(within(popover).getByRole('slider', { name: '绘制颜色 Hue' })).toBeInTheDocument()
    expect(within(popover).getByRole('slider', { name: '绘制颜色 Alpha' })).toBeInTheDocument()
    const rgba = within(popover).getByRole('textbox', { name: '绘制颜色 RGBA' })
    fireEvent.change(rgba, { target: { value: 'rgba(12, 34, 56, 0.5)' } })
    await waitFor(() => expect(rgba).toHaveValue('rgba(12, 34, 56, 0.5)'))

    fireEvent.change(width, { target: { value: '23' } })
    await waitFor(() => expect((fabricHarness.canvases.at(-1)!.freeDrawingBrush as { width: number }).width).toBe(23))
  })

  it('switches back to selection when a layer thumbnail is clicked', async () => {
    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '图形库' }))
    fireEvent.click(within(screen.getByRole('complementary', { name: '图形库' })).getByRole('button', { name: '矩形' }))
    const layer = await screen.findByRole('button', { name: '矩形 图层' })

    fireEvent.click(screen.getByRole('button', { name: '绘制' }))
    expect(screen.getByRole('button', { name: '绘制' })).toHaveClass('active')
    fireEvent.click(layer)

    expect(screen.getByRole('button', { name: '选择' })).toHaveClass('active')
    expect(layer).toHaveAttribute('aria-pressed', 'true')
  })

  it('supports Space and arrow-key layer sorting', async () => {
    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '图形库' }))
    const panel = screen.getByRole('complementary', { name: '图形库' })
    fireEvent.click(within(panel).getByRole('button', { name: '矩形' }))
    fireEvent.click(screen.getByRole('button', { name: '图形库' }))
    fireEvent.click(within(screen.getByRole('complementary', { name: '图形库' })).getAllByRole('button', { name: '圆形' })[0])
    const rectangleLayer = await screen.findByRole('button', { name: '矩形 图层' })

    fireEvent.keyDown(rectangleLayer, { key: ' ', code: 'Space' })
    expect(rectangleLayer).toHaveAttribute('aria-grabbed', 'true')
    fireEvent.keyDown(rectangleLayer, { key: 'ArrowUp' })
    await waitFor(() => expect(fabricHarness.canvases.at(-1)!.getObjects().map((object) => (object as { label?: string }).label)).toEqual(['圆形', '矩形']))
    fireEvent.keyDown(rectangleLayer, { key: ' ', code: 'Space' })
    expect(rectangleLayer).toHaveAttribute('aria-grabbed', 'false')
  })

  it('uses Ctrl/Cmd+Z and Ctrl/Cmd+Y while ignoring Shift+Z', async () => {
    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '图形库' }))
    fireEvent.click(within(screen.getByRole('complementary', { name: '图形库' })).getByRole('button', { name: '矩形' }))
    const canvas = fabricHarness.canvases.at(-1)!
    expect(canvas.getObjects()).toHaveLength(1)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(canvas.getObjects()).toHaveLength(1)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(canvas.getObjects()).toHaveLength(0))
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    await waitFor(() => expect(canvas.getObjects()).toHaveLength(1))
  })

  it('opens the TapNow save dialog from the header and saves at the selected scale', async () => {
    const onSave = vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })

    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '保存编辑结果' }))
    const dialog = screen.getByRole('dialog', { name: '保存画布数据' })
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByRole('combobox', { name: '保存倍率' }), { target: { value: '3' } })
    expect(within(dialog).getByText(/导出尺寸/)).toHaveTextContent('2400 × 1350')
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      exportScale: 3,
      media: expect.objectContaining({ width: 2400, height: 1350 }),
      sourceNodeIds: [],
    }))
  })

  it('opens the TapNow save dialog on Ctrl/Cmd+S', async () => {
    const onSave = vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })

    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    const prompt = screen.getByRole('textbox', { name: '图片生成提示词' })
    prompt.focus()
    fireEvent.keyDown(prompt, { key: 's', ctrlKey: true })

    expect(screen.getByRole('dialog', { name: '保存画布数据' })).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('keeps Prompt outside editor snapshots, saves, and dirty state', async () => {
    const saveGate = deferred<{ outputNodeId: string }>()
    const onSave = vi.fn((_payload: ImageEditorCommitPayload) => saveGate.promise)

    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    const prompt = screen.getByRole('textbox', { name: /生成提示词/ })
    fireEvent.change(prompt, { target: { value: '第一版提示词' } })
    fireEvent.click(screen.getByRole('button', { name: '保存编辑结果' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '保存画布数据' })).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].composition.prompt).toBeUndefined()
    const editor = screen.getByRole('dialog', { name: '图片编辑器' })
    expect(editor).toHaveAttribute('aria-busy', 'true')

    fireEvent.change(prompt, { target: { value: '保存期间产生的第二版提示词' } })
    await act(async () => saveGate.resolve({ outputNodeId: 'saved-editor-node' }))
    await waitFor(() => expect(editor).not.toHaveAttribute('aria-busy'))

    expect(prompt).toHaveValue('保存期间产生的第二版提示词')
    fireEvent.click(screen.getByRole('button', { name: '关闭图片编辑器' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog', { name: /有未保存的更改/ })).not.toBeInTheDocument()
  })

  it('closes an unchanged workspace without showing the unsaved dialog', async () => {
    const onClose = vi.fn()

    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={onClose}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: '关闭图片编辑器' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog', { name: /有未保存的更改/ })).not.toBeInTheDocument()
  })

  it('shows the unsaved dialog after the workspace changes', async () => {
    const onClose = vi.fn()

    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={onClose}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '图形库' }))
    fireEvent.click(within(screen.getByRole('complementary', { name: '图形库' })).getByRole('button', { name: '矩形' }))
    fireEvent.click(screen.getByRole('button', { name: '关闭图片编辑器' }))

    expect(onClose).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog', { name: /有未保存的更改/ })).toBeInTheDocument()
  })

  it('keeps crop as one closed transaction and never saves its temporary masks', async () => {
    const { FabricImage } = await import('fabric')
    const onSave = vi.fn().mockResolvedValue({ outputNodeId: 'saved-crop-node' })

    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled())
    const canvas = fabricHarness.canvases.at(-1)
    expect(canvas).toBeDefined()
    const element = document.createElement('img')
    element.width = 400
    element.height = 300
    Object.defineProperty(element, 'naturalWidth', { configurable: true, value: 400 })
    Object.defineProperty(element, 'naturalHeight', { configurable: true, value: 300 })
    element.setAttribute('src', 'data:image/png;base64,crop-source')
    const image = new FabricImage(element, {
      cropX: 40,
      cropY: 30,
      width: 220,
      height: 140,
      left: 320,
      top: 210,
      originX: 'center',
      originY: 'center',
      scaleX: 0.8,
      scaleY: 0.9,
    })
    Object.assign(image, {
      id: 'crop-image',
      objectKind: 'image',
      label: '裁剪测试图片',
      assetSrc: 'data:image/png;base64,crop-source',
      originalLeft: 320,
      originalTop: 210,
      originalScaleX: 0.8,
      originalScaleY: 0.9,
    })
    image.setCoords()
    const before = {
      cropX: image.cropX,
      cropY: image.cropY,
      width: image.width,
      height: image.height,
      left: image.left,
      top: image.top,
      scaleX: image.scaleX,
      scaleY: image.scaleY,
    }

    act(() => {
      canvas!.add(image)
      canvas!.setActiveObject(image)
      canvas!.emit('selection:created')
    })

    fireEvent.click(await screen.findByRole('button', { name: '裁剪图片' }))
    expect(await screen.findByRole('toolbar', { name: '裁剪属性' })).toBeInTheDocument()
    expect(canvas!.toJSON().objects.map((object) => object.id)).toEqual([
      'crop-image',
      'overlay-rect',
      'crop-rect',
    ])

    const blockedSave = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(window, blockedSave)
    expect(blockedSave.defaultPrevented).toBe(true)
    expect(onSave).not.toHaveBeenCalled()

    const firstCropRect = canvas!.getObjects().find((object) => (object as { id?: string }).id === 'crop-rect') as { set: (values: Record<string, unknown>) => void }
    act(() => firstCropRect.set({ left: 260, top: 180, width: 120, height: 90, scaleX: 1, scaleY: 1 }))
    fireEvent.click(screen.getByRole('button', { name: '取消裁剪' }))

    expect(canvas!.getObjects()).toEqual([image])
    expect({
      cropX: image.cropX,
      cropY: image.cropY,
      width: image.width,
      height: image.height,
      left: image.left,
      top: image.top,
      scaleX: image.scaleX,
      scaleY: image.scaleY,
    }).toEqual(before)
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '裁剪图片' }))
    await screen.findByRole('toolbar', { name: '裁剪属性' })
    const finalCropRect = canvas!.getObjects().find((object) => (object as { id?: string }).id === 'crop-rect') as {
      set: (values: Record<string, unknown>) => void
      setCoords: () => void
    }
    act(() => {
      finalCropRect.set({ left: 300, top: 190, width: 120, height: 80, scaleX: 1, scaleY: 1 })
      finalCropRect.setCoords()
    })
    fireEvent.click(screen.getByRole('button', { name: '完成裁剪' }))

    expect(canvas!.getObjects()).toEqual([image])
    expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '保存编辑结果' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '保存画布数据' })).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const savedObjects = onSave.mock.calls[0][0].composition.fabricJson.objects as Array<Record<string, unknown>>
    expect(savedObjects).toHaveLength(1)
    expect(savedObjects[0]).toMatchObject({ id: 'crop-image', objectKind: 'image' })
    expect(savedObjects.some((object) => object.id === 'crop-rect' || object.id === 'overlay-rect')).toBe(false)
    expect(canvas!.lastRenderedObjects).toEqual([image])
  })

  it('materializes image erasing before crop and saves the transparent replacement', async () => {
    const { FabricImage, Path } = await import('fabric')
    const onSave = vi.fn().mockResolvedValue({ outputNodeId: 'saved-erased-image-node' })

    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    const createImageElement = () => {
      const element = document.createElement('img')
      element.width = 400
      element.height = 300
      element.src = 'data:image/png;base64,test-image'
      Object.defineProperty(element, 'naturalWidth', { configurable: true, value: 400 })
      Object.defineProperty(element, 'naturalHeight', { configurable: true, value: 300 })
      return element
    }
    const image = new FabricImage(createImageElement(), { left: 300, top: 220, originX: 'center', originY: 'center' })
    const eraserPath = new Path('M 20 20 L 120 120', { stroke: '#000000', strokeWidth: 20 })
    Object.assign(image, {
      id: 'erased-source-image',
      objectKind: 'image',
      label: '已擦除图片',
      eraserData: [eraserPath.toObject()],
      originalLeft: 300,
      originalTop: 220,
      originalScaleX: 1,
      originalScaleY: 1,
    })
    const rendered = document.createElement('canvas')
    rendered.width = 400
    rendered.height = 300
    vi.spyOn(image, 'toCanvasElement').mockReturnValue(rendered)
    const replacement = new FabricImage(createImageElement(), { left: 300, top: 220, originX: 'center', originY: 'center' })
    vi.spyOn(FabricImage, 'fromURL').mockResolvedValue(replacement)

    const canvas = fabricHarness.canvases.at(-1)!
    act(() => {
      canvas.add(image)
      canvas.setActiveObject(image)
      canvas.emit('selection:created')
    })
    fireEvent.click(await screen.findByRole('button', { name: '裁剪图片' }))
    await screen.findByRole('toolbar', { name: '裁剪属性' })

    expect(canvas.getObjects()[0]).toBe(replacement)
    expect(replacement).toMatchObject({ id: 'erased-source-image', objectKind: 'image', label: '已擦除图片' })
    expect((replacement as typeof replacement & { eraserData?: unknown[] }).eraserData).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: '完成裁剪' }))
    fireEvent.click(screen.getByRole('button', { name: '保存编辑结果' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '保存画布数据' })).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const savedObjects = onSave.mock.calls[0][0].composition.fabricJson.objects as Array<Record<string, unknown>>
    expect(savedObjects).toHaveLength(1)
    expect(savedObjects[0]).toMatchObject({ id: 'erased-source-image', objectKind: 'image' })
    expect(savedObjects[0].eraserData).toBeUndefined()
  })

  it('re-edits a Pen path without changing its layer, identity, style, or original transform', async () => {
    const { Path, Rect } = await import('fabric')
    const onSave = vi.fn().mockResolvedValue({ outputNodeId: 'saved-pen-node' })

    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    const canvas = fabricHarness.canvases.at(-1)
    expect(canvas).toBeDefined()
    const lowerLayer = new Rect({ left: 20, top: 20, width: 40, height: 40, fill: '#dddddd' })
    Object.assign(lowerLayer, { id: 'lower-layer', objectKind: 'shape', label: '底层' })
    const pen = new Path('M 0 0 L 60 20', {
      left: 180,
      top: 120,
      scaleX: 1.4,
      scaleY: 0.75,
      angle: 18,
      fill: 'transparent',
      stroke: '#8b5cf6',
      strokeWidth: 9,
      strokeDashArray: [14, 7],
      opacity: 0.62,
    })
    Object.assign(pen, {
      id: 'pen-layer',
      objectKind: 'pen',
      label: '保留的 Pen',
      originalLeft: 160,
      originalTop: 110,
      originalScaleX: 1.15,
      originalScaleY: 0.85,
      strokeStyle: 'dashed',
      penAnchors: [
        { current: { x: 0, y: 0 }, nextControl: { x: 18, y: 4 } },
        { current: { x: 60, y: 20 }, previousControl: { x: 42, y: 16 } },
      ],
      penClosed: false,
    })
    const upperLayer = new Rect({ left: 300, top: 220, width: 50, height: 50, fill: '#eeeeee' })
    Object.assign(upperLayer, { id: 'upper-layer', objectKind: 'shape', label: '顶层' })

    act(() => {
      canvas!.add(lowerLayer, pen, upperLayer)
      canvas!.setActiveObject(pen)
      canvas!.emit('selection:created')
    })
    const penLayerButton = await screen.findByRole('button', { name: '保留的 Pen 图层' })
    const penLayerIcon = penLayerButton.querySelector('svg')
    expect(penLayerIcon).toHaveClass('image-editor-layer-symbol')
    expect(penLayerIcon).toHaveAttribute('width', '19')
    expect(penLayerIcon).toHaveAttribute('stroke-width', '1.25')
    fireEvent.click(await screen.findByRole('button', { name: 'Pen Tool' }))
    expect(pen.visible).toBe(false)
    expect(canvas!.getObjects().filter((object) => (object as { excludeFromExport?: boolean }).excludeFromExport)).not.toHaveLength(0)

    const blockedSave = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(window, blockedSave)
    expect(blockedSave.defaultPrevented).toBe(true)
    expect(onSave).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '保存编辑结果' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '保存画布数据' })).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))

    const exported = canvas!.getObjects().filter((object) => !(object as { excludeFromExport?: boolean }).excludeFromExport) as Array<FabricPath | FabricRect>
    expect(exported.map((object) => (object as { id?: string }).id)).toEqual(['lower-layer', 'pen-layer', 'upper-layer'])
    const finalizedPen = exported[1] as FabricPath & Record<string, unknown>
    expect(finalizedPen).not.toBe(pen)
    expect(finalizedPen).toMatchObject({
      id: 'pen-layer',
      objectKind: 'pen',
      label: '保留的 Pen',
      stroke: '#8b5cf6',
      strokeWidth: 9,
      opacity: 0.62,
      originalLeft: 160,
      originalTop: 110,
      originalScaleX: 1.15,
      originalScaleY: 0.85,
      strokeStyle: 'dashed',
      penClosed: false,
    })
    expect(finalizedPen.strokeDashArray).toEqual([14, 7])
    expect(finalizedPen.penAnchors).toHaveLength(2)
    const savedObjects = onSave.mock.calls[0][0].composition.fabricJson.objects as Array<Record<string, unknown>>
    expect(savedObjects.map((object) => object.id)).toEqual(['lower-layer', 'pen-layer', 'upper-layer'])

    act(() => {
      canvas!.setActiveObject(finalizedPen)
      canvas!.emit('selection:created')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pen Tool' }))
    expect(finalizedPen.visible).toBe(false)
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.getByRole('button', { name: '选择' })).toHaveClass('active')
    expect(finalizedPen).toMatchObject({
      visible: true,
      id: 'pen-layer',
      stroke: '#8b5cf6',
      strokeWidth: 9,
      originalLeft: 160,
      originalTop: 110,
      originalScaleX: 1.15,
      originalScaleY: 0.85,
    })
    expect(canvas!.getObjects().filter((object) => !(object as { excludeFromExport?: boolean }).excludeFromExport)).toEqual(exported)
  })

  it('resets position from original metadata and preserves those fields through history reloads', async () => {
    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-reset-node' })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '图形库' }))
    fireEvent.click(within(screen.getByRole('complementary', { name: '图形库' })).getByRole('button', { name: '矩形' }))
    const canvas = fabricHarness.canvases.at(-1)
    expect(canvas).toBeDefined()
    const rectangle = canvas!.getObjects()[0] as {
      id?: string
      left?: number
      top?: number
      scaleX?: number
      scaleY?: number
      originalLeft?: number
      originalTop?: number
      originalScaleX?: number
      originalScaleY?: number
      set: (values: Record<string, unknown>) => void
      setCoords: () => void
    }
    const original = {
      id: rectangle.id,
      left: rectangle.originalLeft,
      top: rectangle.originalTop,
      scaleX: rectangle.originalScaleX,
      scaleY: rectangle.originalScaleY,
    }
    const moved = { left: 702, top: 388, scaleX: 1.7, scaleY: 0.55 }

    act(() => {
      rectangle.set(moved)
      rectangle.setCoords()
      canvas!.emit('object:modified', { target: rectangle })
    })
    fireEvent.click(screen.getByRole('button', { name: '重置位置' }))

    expect(rectangle).toMatchObject({
      left: original.left,
      top: original.top,
      scaleX: original.scaleX,
      scaleY: original.scaleY,
    })

    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    await waitFor(() => {
      const restored = canvas!.getObjects()[0] as Record<string, unknown>
      expect(restored).toMatchObject({
        id: original.id,
        ...moved,
        originalLeft: original.left,
        originalTop: original.top,
        originalScaleX: original.scaleX,
        originalScaleY: original.scaleY,
      })
    })

    fireEvent.click(screen.getByRole('button', { name: '恢复' }))
    await waitFor(() => {
      const restored = canvas!.getObjects()[0] as Record<string, unknown>
      expect(restored).toMatchObject({
        id: original.id,
        left: original.left,
        top: original.top,
        scaleX: original.scaleX,
        scaleY: original.scaleY,
        originalLeft: original.left,
        originalTop: original.top,
        originalScaleX: original.scaleX,
        originalScaleY: original.scaleY,
      })
    })
  })

  it('locks editing and shortcuts while an undo snapshot is loading', async () => {
    const onSave = vi.fn().mockResolvedValue({ outputNodeId: 'saved-history-node' })
    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '图形库' }))
    fireEvent.click(within(screen.getByRole('complementary', { name: '图形库' })).getByRole('button', { name: '矩形' }))
    const canvas = fabricHarness.canvases.at(-1)
    expect(canvas?.getObjects()).toHaveLength(1)

    const loadGate = deferred<void>()
    const originalLoad = canvas!.loadFromJSON.bind(canvas)
    vi.spyOn(canvas!, 'loadFromJSON').mockImplementation(async (json) => {
      await loadGate.promise
      return originalLoad(json)
    })

    const editor = screen.getByRole('dialog', { name: '图片编辑器' })
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    await waitFor(() => expect(editor).toHaveAttribute('aria-busy', 'true'))
    expect(editor.querySelector('.image-editor-workspace')).toHaveAttribute('inert')
    expect(editor.querySelector('.image-editor-footer')).toHaveAttribute('inert')

    const blockedSave = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(window, blockedSave)
    expect(blockedSave.defaultPrevented).toBe(true)
    expect(onSave).not.toHaveBeenCalled()

    await act(async () => loadGate.resolve())
    await waitFor(() => expect(editor).not.toHaveAttribute('aria-busy'))
    expect(canvas!.getObjects()).toHaveLength(0)
    expect(screen.getByRole('button', { name: '恢复' })).toBeEnabled()
  })

  it('serializes consecutive asynchronous eraser strokes before saving', async () => {
    const { Path, Rect } = await import('fabric')
    const onSave = vi.fn().mockResolvedValue({ outputNodeId: 'saved-eraser-node' })

    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    const canvas = fabricHarness.canvases.at(-1)
    expect(canvas).toBeDefined()
    const target = new Rect({ left: 120, top: 90, width: 240, height: 180, fill: '#f0453d' })
    Object.assign(target, {
      id: 'eraser-target',
      objectKind: 'rectangle',
      label: '擦除目标',
      originalLeft: 120,
      originalTop: 90,
      originalScaleX: 1,
      originalScaleY: 1,
    })
    vi.spyOn(target, 'intersectsWithObject').mockReturnValue(true)
    act(() => {
      canvas!.add(target)
      canvas!.setActiveObject(target)
      canvas!.emit('selection:created')
    })
    fireEvent.click(screen.getByRole('button', { name: '绘制' }))
    fireEvent.click(screen.getByRole('button', { name: '橡皮擦' }))

    const firstPath = new Path('M 0 0 L 30 30', { stroke: '#000000', strokeWidth: 12 })
    const secondPath = new Path('M 40 0 L 10 35', { stroke: '#000000', strokeWidth: 12 })
    const firstClone = new Path('M 0 0 L 30 30', { stroke: '#000000', strokeWidth: 12 })
    const secondClone = new Path('M 40 0 L 10 35', { stroke: '#000000', strokeWidth: 12 })
    const firstGate = deferred<unknown>()
    const secondGate = deferred<unknown>()
    const firstCloneSpy = vi.spyOn(firstPath, 'clone').mockReturnValue(firstGate.promise as never)
    const secondCloneSpy = vi.spyOn(secondPath, 'clone').mockReturnValue(secondGate.promise as never)

    act(() => {
      canvas!.emit('path:created', { path: firstPath })
      canvas!.emit('path:created', { path: secondPath })
    })
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    fireEvent.click(within(screen.getByRole('dialog', { name: '保存画布数据' })).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(firstCloneSpy).toHaveBeenCalledTimes(1))
    expect(secondCloneSpy).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()

    await act(async () => {
      firstGate.resolve(firstClone)
      await Promise.resolve()
    })
    await waitFor(() => expect(secondCloneSpy).toHaveBeenCalledTimes(1))
    expect((target as typeof target & { eraserData?: unknown[] }).eraserData).toHaveLength(1)
    expect(onSave).not.toHaveBeenCalled()

    await act(async () => {
      secondGate.resolve(secondClone)
      await Promise.resolve()
    })
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))

    expect((target as typeof target & { eraserData?: unknown[] }).eraserData).toHaveLength(2)
    const savedObjects = onSave.mock.calls[0][0].composition.fabricJson.objects as Array<Record<string, unknown>>
    expect(savedObjects).toHaveLength(1)
    expect(savedObjects[0]).toMatchObject({ id: 'eraser-target', objectKind: 'rectangle' })
    expect(savedObjects[0].eraserData).toHaveLength(2)
    expect(canvas!.lastRenderedObjects).toEqual([target])
  })

  it('hides the object property toolbar for a Fabric multi-selection', async () => {
    const { ActiveSelection } = await import('fabric')

    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '图形库' }))
    fireEvent.click(within(screen.getByRole('complementary', { name: '图形库' })).getByRole('button', { name: '矩形' }))
    fireEvent.click(screen.getByRole('button', { name: '图形库' }))
    fireEvent.click(within(screen.getByRole('complementary', { name: '图形库' })).getAllByRole('button', { name: '圆形' })[0])
    expect(screen.getByRole('toolbar', { name: '对象属性' })).toBeInTheDocument()

    const canvas = fabricHarness.canvases.at(-1)
    expect(canvas).toBeDefined()
    act(() => {
      const selection = new ActiveSelection(canvas!.getObjects() as never[])
      canvas!.setActiveObject(selection)
      canvas!.emit('selection:created')
    })

    expect(screen.queryByRole('toolbar', { name: '对象属性' })).not.toBeInTheDocument()
  })

  it('keeps ordinary wheel scrolling native and zooms only with Ctrl/Cmd', async () => {
    const { container } = render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )
    const workspace = container.querySelector<HTMLElement>('.image-editor-workspace')
    const artboard = container.querySelector<HTMLElement>('.image-editor-artboard')
    expect(workspace).not.toBeNull()
    expect(artboard).not.toBeNull()

    const initialTransform = artboard!.style.transform
    const ordinaryWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 })
    fireEvent(workspace!, ordinaryWheel)
    expect(artboard!.style.transform).toBe(initialTransform)

    const zoomWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100, ctrlKey: true })
    fireEvent(workspace!, zoomWheel)
    await waitFor(() => expect(artboard!.style.transform).not.toBe(initialTransform))
  })

  it('uses Space only as a temporary pan modifier and releases it on keyup or blur', () => {
    const { container } = render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )
    const workspace = container.querySelector<HTMLElement>('.image-editor-workspace')!
    Object.assign(workspace, {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
    })

    fireEvent.keyDown(window, { key: ' ', code: 'Space' })
    fireEvent(workspace, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 120, clientY: 100 }))
    expect(workspace).toHaveClass('is-panning')
    fireEvent.keyUp(window, { key: ' ', code: 'Space' })
    expect(workspace).not.toHaveClass('is-panning')

    fireEvent.keyDown(window, { key: ' ', code: 'Space' })
    fireEvent(workspace, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 140, clientY: 120 }))
    expect(workspace).toHaveClass('is-panning')
    fireEvent(window, new Event('blur'))
    expect(workspace).not.toHaveClass('is-panning')
  })

  it('cycles focus in both directions inside the root modal', () => {
    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: '图片编辑器' })
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    expect(first).toBeDefined()
    expect(last).toBeDefined()

    first.focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)

    last.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('box-selects pose joints from the empty stage area', () => {
    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '姿势生成器' }))
    const dialog = screen.getByRole('dialog', { name: '姿势生成器' })
    const stage = dialog.querySelector<HTMLElement>('.image-editor-pose-stage')!
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 602,
      bottom: 442,
      width: 602,
      height: 442,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    Object.defineProperties(stage, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn().mockReturnValue(true) },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    })

    const posePointerEvent = (type: string, clientX: number, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY })
      Object.defineProperty(event, 'pointerId', { configurable: true, value: 7 })
      return event
    }
    fireEvent(stage, posePointerEvent('pointerdown', 210, 44))
    fireEvent(stage, posePointerEvent('pointermove', 391, 186))
    expect(dialog.querySelector('.image-editor-pose-selection')).toBeInTheDocument()
    for (const id of ['head', 'neck', 'left-shoulder', 'right-shoulder']) {
      expect(screen.getByRole('button', { name: `调整 ${id} 关节` })).toHaveClass('selected')
    }
    expect(screen.getByRole('button', { name: '调整 left-hand 关节' })).not.toHaveClass('selected')

    fireEvent(stage, posePointerEvent('pointerup', 391, 186))
    expect(dialog.querySelector('.image-editor-pose-selection')).not.toBeInTheDocument()
  })

  it('cycles focus inside child dialogs and returns focus to the editor after they close', async () => {
    render(
      <>
        <button type="button">底层画布按钮</button>
        <ImageEditorWorkspace
          assets={[]}
          initialComposition={initialComposition}
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
        />
      </>,
    )
    const editor = screen.getByRole('dialog', { name: '图片编辑器' })

    fireEvent.click(screen.getByRole('button', { name: '姿势生成器' }))
    const poseDialog = screen.getByRole('dialog', { name: '姿势生成器' })
    const poseFocusable = Array.from(poseDialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'))
    poseFocusable[0].focus()
    fireEvent.keyDown(poseDialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(poseFocusable.at(-1))
    poseFocusable.at(-1)!.focus()
    fireEvent.keyDown(poseDialog, { key: 'Tab' })
    expect(document.activeElement).toBe(poseFocusable[0])
    fireEvent.click(screen.getByRole('button', { name: '关闭姿势生成器' }))
    await waitFor(() => expect(editor).toContainElement(document.activeElement as HTMLElement))

    fireEvent.click(screen.getByRole('button', { name: '图形库' }))
    fireEvent.click(within(screen.getByRole('complementary', { name: '图形库' })).getByRole('button', { name: '矩形' }))
    fireEvent.click(screen.getByRole('button', { name: '关闭图片编辑器' }))
    const saveDialog = await screen.findByRole('dialog', { name: /有未保存的更改/ })
    const saveFocusable = Array.from(saveDialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'))
    saveFocusable[0].focus()
    fireEvent.keyDown(saveDialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(saveFocusable.at(-1))
    saveFocusable.at(-1)!.focus()
    fireEvent.keyDown(saveDialog, { key: 'Tab' })
    expect(document.activeElement).toBe(saveFocusable[0])
    fireEvent.keyDown(saveDialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /有未保存的更改/ })).not.toBeInTheDocument())
    expect(editor).toContainElement(document.activeElement as HTMLElement)

    screen.getByRole('button', { name: '底层画布按钮' }).focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(editor).toContainElement(document.activeElement as HTMLElement)
  })

  it('returns focus to the launching control when the full-screen editor closes', async () => {
    const launcher = document.createElement('button')
    launcher.textContent = '打开图片编辑器'
    document.body.append(launcher)
    launcher.focus()
    const onClose = vi.fn()
    const view = render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={onClose}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '关闭图片编辑器' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(document.activeElement).toBe(launcher)
    view.unmount()
    launcher.remove()
  })

  it('does not assign undocumented single-letter tool shortcuts', () => {
    render(
      <ImageEditorWorkspace
        assets={[]}
        initialComposition={initialComposition}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ outputNodeId: 'saved-editor-node' })}
      />,
    )
    const canvas = fabricHarness.canvases.at(-1)
    const selectTool = screen.getByRole('button', { name: '选择' })
    expect(selectTool).toHaveClass('active')

    for (const key of ['v', 'b', 'r', 'p', 't']) fireEvent.keyDown(window, { key })

    expect(selectTool).toHaveClass('active')
    expect(canvas?.getObjects()).toHaveLength(0)
    expect(screen.queryByText(/点击画布即可绘制形状/)).not.toBeInTheDocument()
  })
})
