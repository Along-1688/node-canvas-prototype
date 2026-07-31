import type { ComponentProps } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { initialNodes, initialTasks } from '../mockData'
import { CanvasBlankContextMenu, ContextMenu, ContinuationMenu, DrawerPanel, QuickAddMenu, continuationItemsForSource } from '../panels'
import type { CanvasGroup, MediaNodeType } from '../types'

function drawerProps(overrides: Partial<ComponentProps<typeof DrawerPanel>> = {}): ComponentProps<typeof DrawerPanel> {
  return {
    active: 'content',
    nodes: initialNodes,
    tasks: initialTasks,
    onClose: vi.fn(),
    onAddNode: vi.fn(),
    onUploadFiles: vi.fn(),
    onAuxiliaryTool: vi.fn(),
    onAddSessionAsset: vi.fn(),
    onLocateNode: vi.fn(),
    onDeleteNode: vi.fn(),
    onRenameNode: vi.fn(),
    onDuplicateNode: vi.fn(),
    onDownloadNodes: vi.fn(),
    groups: [],
    playlists: [],
    onLocateGroup: vi.fn(),
    onRenameGroup: vi.fn(),
    onDuplicateGroup: vi.fn(),
    onUngroup: vi.fn(),
    onLocatePlaylist: vi.fn(),
    onRenamePlaylist: vi.fn(),
    onDuplicatePlaylist: vi.fn(),
    onDeletePlaylist: vi.fn(),
    onToggleNodeFavorite: vi.fn(),
    sessionAssets: [],
    assetFolders: [],
    ...overrides,
  }
}

describe('unified add menu', () => {
  it('exposes the same nodes, auxiliary tools and mixed-media batch upload', () => {
    const onAddNode = vi.fn()
    const onUploadFiles = vi.fn()
    const onAuxiliaryTool = vi.fn()

    render(<QuickAddMenu
      position={{ x: 200, y: 160 }}
      onAddNode={onAddNode}
      onUploadFiles={onUploadFiles}
      onAuxiliaryTool={onAuxiliaryTool}
      onClose={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: /^视频 / }))
    fireEvent.click(screen.getByRole('button', { name: /播放列表/ }))
    expect(onAddNode).toHaveBeenCalledWith('video')
    expect(onAuxiliaryTool).toHaveBeenCalledWith('播放列表')

    const input = screen.getByLabelText('选择上传文件') as HTMLInputElement
    expect(input.multiple).toBe(true)
    expect(input.accept).toBe('image/*,video/*,audio/*')
    const files = [
      new File(['image'], 'frame.png', { type: 'image/png' }),
      new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
      new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' }),
    ]
    fireEvent.change(input, { target: { files } })
    expect(onUploadFiles).toHaveBeenCalledWith(files)
  })

  it('always keeps the complete structure for canvas and double-click adding', () => {
    render(<QuickAddMenu position={{ x: 200, y: 160 }} onAddNode={vi.fn()} onUploadFiles={vi.fn()} onAuxiliaryTool={vi.fn()} onClose={vi.fn()} />)

    for (const label of ['文本', '图片', '视频', '音频', '播放列表', '图片编辑器']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label} `) })).toBeEnabled()
    }
    expect(screen.getByLabelText('选择上传文件')).toBeInTheDocument()
  })
})

describe('blank canvas context menu', () => {
  it('keeps the requested dividers, local upload and node submenu in place', () => {
    const onOpenAssets = vi.fn()
    const onAddNode = vi.fn()
    const onAuxiliaryTool = vi.fn()
    const onUploadFiles = vi.fn()
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    const onPaste = vi.fn()
    const onClose = vi.fn()

    render(<CanvasBlankContextMenu
      position={{ x: 200, y: 160 }}
      onUploadFiles={onUploadFiles}
      onOpenAssets={onOpenAssets}
      onAddNode={onAddNode}
      onAuxiliaryTool={onAuxiliaryTool}
      onUndo={onUndo}
      onRedo={onRedo}
      onPaste={onPaste}
      onClose={onClose}
    />)

    const menu = screen.getByRole('menu', { name: '画布操作' })
    expect(within(menu).getAllByRole('separator')).toHaveLength(2)
    expect(within(menu).getByRole('menuitem', { name: '撤销 ⌘Z' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: '重做 ⇧⌘Z' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: '粘贴 ⌘V' })).toBeInTheDocument()

    const files = [new File(['image'], 'frame.png', { type: 'image/png' })]
    fireEvent.change(within(menu).getByLabelText('选择上传文件'), { target: { files } })
    expect(onUploadFiles).toHaveBeenCalledWith(files)
    fireEvent.click(within(menu).getByRole('menuitem', { name: '添加资产' }))
    fireEvent.click(within(menu).getByRole('menuitem', { name: '添加节点' }))

    const nodeMenu = screen.getByRole('menu', { name: '添加节点' })
    expect(within(nodeMenu).getByRole('menuitem', { name: /文本 脚本、广告词、品牌文案/ })).toBeInTheDocument()
    expect(within(nodeMenu).getAllByRole('menuitem')).toHaveLength(4)
    fireEvent.click(within(nodeMenu).getByRole('menuitem', { name: /视频/ }))

    expect(onOpenAssets).toHaveBeenCalledOnce()
    expect(onAddNode).toHaveBeenCalledWith('video')
    expect(onAuxiliaryTool).not.toHaveBeenCalled()
    expect(onUndo).not.toHaveBeenCalled()
    expect(onRedo).not.toHaveBeenCalled()
    expect(onPaste).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('opens the auxiliary tools submenu at the same menu surface', () => {
    const onAuxiliaryTool = vi.fn()
    render(<CanvasBlankContextMenu
      position={{ x: 200, y: 160 }}
      onUploadFiles={vi.fn()}
      onOpenAssets={vi.fn()}
      onAddNode={vi.fn()}
      onAuxiliaryTool={onAuxiliaryTool}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onPaste={vi.fn()}
      onClose={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('menuitem', { name: '添加辅助工具' }))
    const toolMenu = screen.getByRole('menu', { name: '辅助工具' })
    expect(within(toolMenu).getByRole('menuitem', { name: /播放列表 时间轴串联多段素材/ })).toBeInTheDocument()
    fireEvent.click(within(toolMenu).getByRole('menuitem', { name: /图片编辑器/ }))
    expect(onAuxiliaryTool).toHaveBeenCalledWith('图片编辑器')
  })
})

describe('contextual continuation menu', () => {
  const expectedBySource: Record<MediaNodeType, string[]> = {
    text: ['文本', '图片', '视频', '音频'],
    image: ['文本', '图片', '视频', '图片编辑器'],
    video: ['文本', '视频', '音频', '播放列表'],
    audio: ['音频', '视频'],
  }

  it.each(Object.entries(expectedBySource) as [MediaNodeType, string[]][])(
    'shows only valid continuation actions for a %s source',
    (sourceType, expectedLabels) => {
      const { unmount } = render(<ContinuationMenu
        position={{ x: 200, y: 160 }}
        sourceType={sourceType}
        onAddNode={vi.fn()}
        onAuxiliaryTool={vi.fn()}
        onClose={vi.fn()}
      />)

      const menu = screen.getByRole('complementary', { name: '引用该节点生成' })
      const actionLabels = within(menu).getAllByRole('button')
        .filter((button) => !button.getAttribute('aria-label'))
        .map((button) => button.querySelector('strong')?.textContent)

      expect(actionLabels).toEqual(expectedLabels)
      expect(within(menu).queryByLabelText('选择上传文件')).not.toBeInTheDocument()
      expect(within(menu).queryByText('添加资源')).not.toBeInTheDocument()
      expect(within(menu).getAllByRole('button').some((button) => button.hasAttribute('disabled'))).toBe(false)
      unmount()
    },
  )

  it('routes node and auxiliary actions through separate callbacks', () => {
    const onAddNode = vi.fn()
    const onAuxiliaryTool = vi.fn()
    render(<ContinuationMenu position={{ x: 200, y: 160 }} sourceType="image" onAddNode={onAddNode} onAuxiliaryTool={onAuxiliaryTool} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /^视频 / }))
    fireEvent.click(screen.getByRole('button', { name: /^图片编辑器 / }))

    expect(onAddNode).toHaveBeenCalledWith('video')
    expect(onAuxiliaryTool).toHaveBeenCalledWith('图片编辑器')
  })

  it('derives node actions from the shared connection compatibility rule', () => {
    expect(continuationItemsForSource('video')).toEqual([
      { kind: 'node', type: 'text' },
      { kind: 'node', type: 'video' },
      { kind: 'node', type: 'audio' },
      { kind: 'tool', tool: '播放列表' },
    ])
  })
})

describe('node context menu', () => {
  it('shows only text, image and audio inputs that the target can accept', () => {
    const target = initialNodes.find((node) => node.id === 'video-host-demo')!
    render(<ContextMenu position={{ x: 200, y: 160 }} target={target} onAddNode={vi.fn()} onClose={vi.fn()} />)

    const menu = screen.getByRole('complementary', { name: '添加上下文' })
    const actionLabels = within(menu).getAllByRole('button')
      .filter((button) => !button.getAttribute('aria-label'))
      .map((button) => button.querySelector('strong')?.textContent)

    expect(actionLabels).toEqual(['文本', '图片', '音频'])
  })

  it('routes the selected context type to the add callback', () => {
    const onAddNode = vi.fn()
    const target = initialNodes.find((node) => node.id === 'text-prompt')!
    render(<ContextMenu position={{ x: 200, y: 160 }} target={target} onAddNode={onAddNode} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /^图片 / }))
    expect(onAddNode).toHaveBeenCalledWith('image')
  })
})

describe('canvas drawers', () => {
  it('includes favorited video nodes in the asset favorites alongside images', () => {
    const video = initialNodes.find((node) => node.type === 'video')!
    const nodes = initialNodes.map((node) => node.id === video.id
      ? { ...node, data: { ...node.data, title: '收藏视频示例', favorite: true } }
      : node)
    render(<DrawerPanel {...drawerProps({ active: 'assets', nodes })} />)

    fireEvent.click(screen.getByRole('button', { name: /收藏夹/ }))

    const card = screen.getByText('收藏视频示例').closest('article')!
    expect(within(card).getByText('视频')).toBeVisible()
    expect(within(card).getByText('画布收藏')).toBeVisible()
  })

  it('keeps failed content as compact canvas objects without retrying tasks or exposing task details', () => {
    const onLocateNode = vi.fn()
    render(<DrawerPanel {...drawerProps({ onLocateNode })} />)

    fireEvent.click(screen.getByRole('button', { name: '搜索画布内容' }))
    fireEvent.change(screen.getByPlaceholderText('搜索画布内容'), { target: { value: '电影海报方案 02' } })

    const failedItem = screen.getByText('电影海报方案 02').closest('article')!
    expect(within(failedItem).getByTitle('失败')).toBeVisible()
    expect(within(failedItem).queryByText('失败原因')).not.toBeInTheDocument()
    expect(within(failedItem).queryByRole('button', { name: '重试电影海报方案 02' })).not.toBeInTheDocument()

    fireEvent.click(within(failedItem).getByRole('button', { name: '电影海报方案 02 图片 · 失败' }))
    expect(onLocateNode).toHaveBeenCalledWith('image-review-failed')
  })

  it('uses media thumbnails while keeping text rows compact', () => {
    const image = initialNodes.find((node) => node.type === 'image' && node.data.media?.url)!
    const video = initialNodes.find((node) => node.type === 'video' && node.data.media?.posterUrl)!
    const text = initialNodes.find((node) => node.type === 'text')!
    render(<DrawerPanel {...drawerProps()} />)

    expect(screen.getByRole('img', { name: `${image.data.title}缩略图` })).toBeVisible()
    expect(screen.getByRole('img', { name: `${video.data.title}缩略图` })).toBeVisible()
    expect(screen.queryByRole('img', { name: `${text.data.title}缩略图` })).not.toBeInTheDocument()
  })

  it('uses a compact anchored filter menu and removes name sorting', () => {
    render(<DrawerPanel {...drawerProps()} />)

    expect(screen.queryByRole('button', { name: '按名称排序' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '筛选画布内容' }))

    const drawer = screen.getByLabelText('画布内容')
    const filterMenu = document.querySelector('[aria-label="画布内容筛选"]') as HTMLElement
    expect(filterMenu).toBeInTheDocument()
    expect(drawer.contains(filterMenu)).toBe(false)
    expect(filterMenu.parentElement).toHaveClass('content-filter-menu')
  })

  it('synchronizes canvas groups into the element directory and exposes group actions', () => {
    const onLocateGroup = vi.fn()
    const onUngroup = vi.fn()
    const group: CanvasGroup = {
      id: 'storyboard-group',
      name: '宫格分镜组',
      nodeIds: [initialNodes[0].id, initialNodes[1].id],
      bounds: { x: 0, y: 0, width: 720, height: 360 },
    }
    render(<DrawerPanel {...drawerProps({ groups: [group], onLocateGroup, onUngroup })} />)

    const groupTitle = '宫格分镜组（2 个节点）'
    fireEvent.click(screen.getByRole('button', { name: groupTitle }))
    expect(onLocateGroup).toHaveBeenCalledWith('storyboard-group')

    fireEvent.click(screen.getByRole('button', { name: '展开宫格分镜组' }))
    expect(screen.getByText(initialNodes[0].data.title)).toBeVisible()
    expect(screen.getByText(initialNodes[1].data.title)).toBeVisible()

    fireEvent.click(screen.getByLabelText('打开宫格分镜组更多操作'))
    const groupMenu = document.querySelector('[aria-label="宫格分镜组操作"]') as HTMLElement
    const actions = within(groupMenu).getAllByRole('menuitem', { hidden: true })
    expect(actions).toHaveLength(4)
    fireEvent.click(actions[3])
    expect(onUngroup).toHaveBeenCalledWith('storyboard-group')
  })

  it('groups canvas and playlist shortcuts with their real key behavior', () => {
    render(<DrawerPanel {...drawerProps({ active: 'shortcuts' })} />)

    const drawer = screen.getByLabelText('快捷键')
    expect(within(drawer).getByText('画布')).toBeVisible()
    expect(within(drawer).getByText('V')).toBeVisible()
    expect(within(drawer).getByText('移动工具')).toBeVisible()
    expect(within(drawer).getByText('H')).toBeVisible()
    expect(within(drawer).getByText('抓手工具')).toBeVisible()
    expect(within(drawer).getByText('删除节点 / 连线 / 当前片段 / 播放列表')).toBeVisible()
    expect(within(drawer).getByText('播放列表')).toBeVisible()
    for (const keys of ['← / →', 'Home / End', 'Shift + ← / →', 'Alt + ← / →']) {
      expect(within(drawer).getByText(keys)).toBeVisible()
    }
  })
})
