import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlay,
  Clock3,
  Copy,
  Download,
  Ellipsis,
  Folder,
  FolderPlus,
  Grid3X3,
  Heart,
  Image as ImageIcon,
  List,
  LoaderCircle,
  Plus,
  Pencil,
  Search,
  Send,
  Sparkles,
  Upload,
  X,
  Trash2,
  Ungroup,
} from 'lucide-react'
import { allowedContextSourcesForTarget, allowedTargetsForSource, labelForType } from './domain'
import { AnchoredPopover } from './floating'
import { MediaTypeIcon, mediaNodeTypes, mediaTypeLabels } from './mediaTypes'
import type { AssetFolder, CanvasFlowNode, CanvasGroup, CanvasPlaylist, DrawerKey, GenerationTask, MediaNodeType, SessionAsset } from './types'

export type AuxiliaryTool = '播放列表' | '图片编辑器'

interface DrawerProps {
  active: DrawerKey
  nodes: CanvasFlowNode[]
  tasks: GenerationTask[]
  onClose: () => void
  onAddNode: (type: MediaNodeType, source?: 'created' | 'upload' | 'asset' | 'virtual-ip') => void
  onUploadFiles: (files: File[]) => void
  onAuxiliaryTool: (tool: AuxiliaryTool) => void
  onAddSessionAsset: (asset: SessionAsset) => void
  onLocateNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
  onRenameNode: (nodeId: string, title: string) => void
  onDuplicateNode: (nodeId: string) => void
  onDownloadNodes: (nodeIds: string[]) => void
  groups: CanvasGroup[]
  playlists: CanvasPlaylist[]
  onLocateGroup: (groupId: string) => void
  onRenameGroup: (groupId: string, title: string) => void
  onDuplicateGroup: (groupId: string) => void
  onUngroup: (groupId: string) => void
  onLocatePlaylist: (playlistId: string) => void
  onRenamePlaylist: (playlistId: string, title: string) => void
  onDuplicatePlaylist: (playlistId: string) => void
  onDeletePlaylist: (playlistId: string) => void
  onToggleNodeFavorite: (nodeId: string, favorite: boolean) => void
  sessionAssets: SessionAsset[]
  assetFolders: AssetFolder[]
}

const drawerTitles: Record<Exclude<DrawerKey, null>, string> = {
  add: '添加', assets: '资产', content: '画布内容', shortcuts: '快捷键', tutorial: '画布教程',
}

function DrawerShell({ active, onClose, children }: { active: Exclude<DrawerKey, null>; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside className={`left-drawer drawer-${active}`} aria-label={drawerTitles[active]}>
      <header className="drawer-header"><h2>{drawerTitles[active]}</h2><button type="button" onClick={onClose} aria-label={`关闭${drawerTitles[active]}`}><X size={18} /></button></header>
      {children}
    </aside>
  )
}

const addNodeDescriptions: Record<MediaNodeType, string> = {
  text: '脚本、广告词与品牌文案',
  image: '生成图片或继续编辑画面',
  video: '从文字、首帧或参考生成',
  audio: '生成配音、音效与背景音乐',
}

interface AddMenuContentProps {
  onAddNode: DrawerProps['onAddNode']
  onUploadFiles: DrawerProps['onUploadFiles']
  onAuxiliaryTool: DrawerProps['onAuxiliaryTool']
}

function AddMenuContent({ onAddNode, onUploadFiles, onAuxiliaryTool }: AddMenuContentProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="add-menu-content">
      <p className="drawer-section-label">添加节点</p>
      <div className="add-list">{mediaNodeTypes.map((type) => (
        <button type="button" key={type} onClick={() => onAddNode(type)}>
          <span className={`add-icon icon-${type}`}><MediaTypeIcon type={type} /></span><span><strong>{mediaTypeLabels[type]}</strong><small>{addNodeDescriptions[type]}</small></span>
        </button>
      ))}</div>
      <p className="drawer-section-label tools-label">辅助工具</p>
      <div className="add-list auxiliary-list">
        <button type="button" onClick={() => onAuxiliaryTool('播放列表')}><span className="add-icon icon-playlist"><CirclePlay size={17} /></span><span><strong>播放列表</strong><small>按顺序组织多个视频片段</small></span></button>
        <button type="button" onClick={() => onAuxiliaryTool('图片编辑器')}><span className="add-icon icon-image-editor"><ImageIcon size={17} /></span><span><strong>图片编辑器</strong><small>集中处理画布中的图片素材</small></span></button>
      </div>
      <p className="drawer-section-label resources-label">添加资源</p>
      <button type="button" className="upload-resource-action" onClick={() => uploadInputRef.current?.click()}><Upload size={18} /><span><strong>上传文件</strong><small>图片、视频或音频</small></span></button>
      <input ref={uploadInputRef} className="sr-only" type="file" accept="image/*,video/*,audio/*" multiple aria-label="选择上传文件" onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) onUploadFiles(files); event.currentTarget.value = '' }} />
    </div>
  )
}

function AddDrawer(props: Pick<DrawerProps, 'onAddNode' | 'onUploadFiles' | 'onAuxiliaryTool'>) {
  return <div className="drawer-content add-drawer-content"><AddMenuContent {...props} /></div>
}

function resolveMenuPosition(position: { x: number; y: number }, estimatedHeight: number) {
  return {
    left: Math.min(Math.max(12, position.x), Math.max(12, window.innerWidth - 320)),
    top: Math.min(Math.max(72, position.y), Math.max(72, window.innerHeight - estimatedHeight)),
  }
}

export function QuickAddMenu({ position, onAddNode, onUploadFiles, onAuxiliaryTool, onClose, ariaLabel = '添加' }: {
  position: { x: number; y: number }
  onAddNode: DrawerProps['onAddNode']
  onUploadFiles: (files: File[]) => void
  onAuxiliaryTool: (tool: AuxiliaryTool) => void
  onClose: () => void
  ariaLabel?: string
}) {
  const menuPosition = resolveMenuPosition(position, 540)
  return (
    <aside className="quick-add-menu unified-add-menu" style={menuPosition} aria-label={ariaLabel}>
      <header><strong>添加</strong><button type="button" onClick={onClose} aria-label={`关闭${ariaLabel}`}><X size={16} /></button></header>
      <AddMenuContent onAddNode={onAddNode} onUploadFiles={onUploadFiles} onAuxiliaryTool={onAuxiliaryTool} />
    </aside>
  )
}

type ContinuationItem =
  | { kind: 'node'; type: MediaNodeType }
  | { kind: 'tool'; tool: AuxiliaryTool }

const continuationAuxiliaryTools: Partial<Record<MediaNodeType, AuxiliaryTool[]>> = {
  image: ['图片编辑器'],
  video: ['播放列表'],
}

export function continuationItemsForSource(sourceType: MediaNodeType): ContinuationItem[] {
  return [
    ...allowedTargetsForSource(sourceType).map((type): ContinuationItem => ({ kind: 'node', type })),
    ...(continuationAuxiliaryTools[sourceType] ?? []).map((tool): ContinuationItem => ({ kind: 'tool', tool })),
  ]
}

const auxiliaryToolDetails: Record<AuxiliaryTool, { description: string; icon: React.ReactNode; iconClassName: string }> = {
  '播放列表': { description: '按顺序组织多个视频片段', icon: <CirclePlay size={17} />, iconClassName: 'icon-playlist' },
  '图片编辑器': { description: '集中处理画布中的图片素材', icon: <ImageIcon size={17} />, iconClassName: 'icon-image-editor' },
}

export function ContinuationMenu({ position, sourceType, onAddNode, onAuxiliaryTool, onClose, ariaLabel = '引用该节点生成' }: {
  position: { x: number; y: number }
  sourceType: MediaNodeType
  onAddNode: (type: MediaNodeType) => void
  onAuxiliaryTool: (tool: AuxiliaryTool) => void
  onClose: () => void
  ariaLabel?: string
}) {
  const items = continuationItemsForSource(sourceType)
  const menuPosition = resolveMenuPosition(position, 74 + items.length * 47)
  const firstItemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstItemRef.current?.focus()
  }, [])

  return (
    <aside className="quick-add-menu unified-add-menu continuation-add-menu" style={menuPosition} aria-label={ariaLabel}>
      <header><strong>引用该节点生成</strong><button type="button" onClick={onClose} aria-label={`关闭${ariaLabel}`}><X size={16} /></button></header>
      <div className="add-menu-content continuation-menu-content">
        <div className="add-list">
          {items.map((item, index) => {
            if (item.kind === 'node') {
              return (
                <button ref={index === 0 ? firstItemRef : undefined} type="button" key={item.type} onClick={() => onAddNode(item.type)}>
                  <span className={`add-icon icon-${item.type}`}><MediaTypeIcon type={item.type} /></span>
                  <span><strong>{mediaTypeLabels[item.type]}</strong><small>{addNodeDescriptions[item.type]}</small></span>
                </button>
              )
            }
            const details = auxiliaryToolDetails[item.tool]
            return (
              <button ref={index === 0 ? firstItemRef : undefined} type="button" key={item.tool} onClick={() => onAuxiliaryTool(item.tool)}>
                <span className={`add-icon ${details.iconClassName}`}>{details.icon}</span>
                <span><strong>{item.tool}</strong><small>{details.description}</small></span>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

export function ContextMenu({ position, target, onAddNode, onClose, ariaLabel = '添加上下文' }: {
  position: { x: number; y: number }
  target: CanvasFlowNode
  onAddNode: (type: MediaNodeType) => void
  onClose: () => void
  ariaLabel?: string
}) {
  const sourceTypes = allowedContextSourcesForTarget(target)
  const menuPosition = resolveMenuPosition(position, 74 + sourceTypes.length * 47)
  const firstItemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstItemRef.current?.focus()
  }, [])

  return (
    <aside className="quick-add-menu unified-add-menu context-add-menu" style={menuPosition} aria-label={ariaLabel}>
      <header><strong>添加上下文</strong><button type="button" onClick={onClose} aria-label={`关闭${ariaLabel}`}><X size={16} /></button></header>
      <div className="add-menu-content">
        <div className="add-list">
          {sourceTypes.map((type, index) => (
            <button ref={index === 0 ? firstItemRef : undefined} type="button" key={type} onClick={() => onAddNode(type)}>
              <span className={`add-icon icon-${type}`}><MediaTypeIcon type={type} /></span>
              <span><strong>{mediaTypeLabels[type]}</strong><small>{addNodeDescriptions[type]}</small></span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="drawer-search"><Search size={16} /><span className="sr-only">{placeholder}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>
}

type AssetEntry = { id: string; title: string; type: '文本' | '图片' | '视频' | '音频'; nodeType: MediaNodeType; className: string; category: string; scope: 'personal' | 'project'; posterUrl?: string; nodeId?: string; canvasFavorite?: boolean; savedAsset?: boolean; sessionAsset?: SessionAsset }

const assetEntries: AssetEntry[] = [
  { id: 'dog', title: '柴犬棚拍首帧', type: '图片', nodeType: 'image', className: 'asset-poster dog-poster', category: 'uncategorized', scope: 'personal' },
  { id: 'anime', title: '主播探店视频', type: '视频', nodeType: 'video', className: 'asset-poster video-poster', posterUrl: '/node-canvas-prototype/assets/virtual-ip-host-video-poster.jpg', category: 'campaign', scope: 'project' },
  { id: 'audio', title: '环境氛围音', type: '音频', nodeType: 'audio', className: 'asset-poster audio-poster', category: 'campaign', scope: 'personal' },
]

function AssetsDrawer({ onAddNode, onAddSessionAsset, nodes, onToggleNodeFavorite, sessionAssets, assetFolders }: Pick<DrawerProps, 'onAddNode' | 'onAddSessionAsset' | 'nodes' | 'onToggleNodeFavorite' | 'sessionAssets' | 'assetFolders'>) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'personal' | 'project'>('all')
  const [type, setType] = useState<'all' | '文本' | '图片' | '视频' | '音频'>('all')
  const [category, setCategory] = useState('all')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [favorites, setFavorites] = useState(() => new Set(['anime']))
  const [localFolders, setLocalFolders] = useState<string[]>([])
  const [newFolder, setNewFolder] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)

  const canvasFavorites = nodes
    .filter((node) => (node.data.nodeType === 'image' || node.data.nodeType === 'video') && node.data.favorite)
    .map((node): AssetEntry => {
      const isVideo = node.data.nodeType === 'video'
      return {
        id: `canvas-${node.id}`,
        nodeId: node.id,
        title: node.data.title,
        type: isVideo ? '视频' : '图片',
        nodeType: isVideo ? 'video' : 'image',
        className: isVideo ? 'asset-poster saved-video' : `asset-poster ${node.data.mediaVariant === 'anime' ? 'anime-poster' : node.data.mediaVariant === 'ip' ? 'ip-one' : node.data.mediaVariant === 'poster' ? 'text-poster' : 'dog-poster'}`,
        category: 'uncategorized',
        scope: 'personal',
        posterUrl: isVideo ? node.data.media?.posterUrl : undefined,
        canvasFavorite: true,
      }
    })
  const savedEntries: AssetEntry[] = sessionAssets.map((asset) => ({
    id: asset.id,
    title: asset.title,
    type: ({ text: '文本', image: '图片', video: '视频', audio: '音频' } as const)[asset.nodeType],
    nodeType: asset.nodeType,
    className: `asset-poster saved-${asset.nodeType} ${asset.mediaVariant === 'anime' ? 'anime-poster' : asset.mediaVariant === 'ip' ? 'ip-one' : asset.mediaVariant === 'poster' ? 'text-poster' : asset.nodeType === 'image' ? 'dog-poster' : ''}`,
    category: asset.folderId,
    scope: 'personal',
    savedAsset: true,
    sessionAsset: asset,
    posterUrl: asset.media?.posterUrl,
  }))
  const availableEntries: AssetEntry[] = [...assetEntries, ...canvasFavorites, ...savedEntries]
  const entries = availableEntries.filter((entry) => {
    if (!entry.title.includes(query)) return false
    if (scope !== 'all' && entry.scope !== scope) return false
    if (type !== 'all' && entry.type !== type) return false
    if (category === 'favorites' && !favorites.has(entry.id) && !entry.canvasFavorite) return false
    if (category === 'uncategorized' && entry.category !== 'uncategorized') return false
    if (!['all', 'favorites', 'uncategorized'].includes(category) && entry.category !== category) return false
    return true
  })

  const toggleFavorite = (id: string, nodeId?: string) => {
    if (nodeId) {
      onToggleNodeFavorite(nodeId, false)
      return
    }
    setFavorites((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
    })
  }

  const saveFolder = () => {
    const name = newFolder.trim()
    if (name) setLocalFolders((current) => [...current, name])
    setNewFolder('')
    setCreatingFolder(false)
  }

  return (
    <div className="drawer-content assets-drawer-content">
      <SearchBox value={query} onChange={setQuery} placeholder="搜索资产 / 文件夹" />
      <div className="asset-filter-row">
        <label><span className="sr-only">资产范围</span><select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="all">全部资产</option><option value="personal">个人资产</option><option value="project">项目资产</option></select></label>
        <label><span className="sr-only">资产类型</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="all">全部类型</option><option value="文本">文本</option><option value="图片">图片</option><option value="视频">视频</option><option value="音频">音频</option></select></label>
      </div>
      <nav className="asset-categories" aria-label="资产分类">
        <button type="button" className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}><Sparkles size={16} /><span><strong>全部生成</strong><small>{availableEntries.length} 个资产</small></span></button>
        <button type="button" className={category === 'favorites' ? 'active' : ''} onClick={() => setCategory('favorites')}><Heart size={16} /><span><strong>收藏夹</strong><small>{favorites.size + canvasFavorites.length} 个已收藏资产</small></span></button>
        <button type="button" className={category === 'uncategorized' ? 'active' : ''} onClick={() => setCategory('uncategorized')}><Folder size={16} /><span><strong>未分类</strong><small>尚未加入文件夹</small></span></button>
      </nav>
      <div className="drawer-subhead"><span>我的文件夹</span><button type="button" onClick={() => setCreatingFolder(true)} title="新建文件夹" aria-label="新建文件夹"><FolderPlus size={16} /></button></div>
      {creatingFolder && <div className="new-folder-row"><input aria-label="新文件夹名称" autoFocus value={newFolder} placeholder="文件夹名称" onChange={(event) => setNewFolder(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveFolder(); if (event.key === 'Escape') setCreatingFolder(false) }} /><button type="button" onClick={saveFolder} aria-label="保存文件夹"><Check size={15} /></button><button type="button" onClick={() => setCreatingFolder(false)} aria-label="取消新建文件夹"><X size={15} /></button></div>}
      <div className="asset-folder-list">{[...assetFolders, ...localFolders.map((name) => ({ id: `local-${name}`, name }))].filter((folder) => folder.id !== 'uncategorized').map((folder) => <button type="button" className={category === folder.id ? 'active' : ''} key={folder.id} onClick={() => setCategory(folder.id)}><Folder size={15} /><span>{folder.name}</span><small>{availableEntries.filter((entry) => entry.category === folder.id).length}</small></button>)}</div>
      <div className="asset-results-head"><span>{category === 'all' ? '最近使用' : category === 'favorites' ? '已收藏' : category === 'uncategorized' ? '未分类' : assetFolders.find((folder) => folder.id === category)?.name ?? '我的文件夹'}</span><div role="group" aria-label="资产布局"><button type="button" className={layout === 'grid' ? 'active' : ''} onClick={() => setLayout('grid')} aria-label="网格视图"><Grid3X3 size={15} /></button><button type="button" className={layout === 'list' ? 'active' : ''} onClick={() => setLayout('list')} aria-label="列表视图"><List size={15} /></button></div></div>
      {entries.length ? <div className={`asset-grid asset-layout-${layout}`}>{entries.map((entry) => { const isFavorite = favorites.has(entry.id) || entry.canvasFavorite; return <article key={entry.id} className="asset-card"><button type="button" className="asset-card-main" onClick={() => entry.sessionAsset ? onAddSessionAsset(entry.sessionAsset) : onAddNode(entry.nodeType, 'asset')}><span className={entry.className} style={entry.posterUrl ? { backgroundImage: `url(${entry.posterUrl})` } : undefined}><em>{entry.type}</em></span><strong>{entry.title}</strong><small>{entry.savedAsset ? '会话资产 · 点击加入画布' : entry.nodeId ? '画布收藏' : '点击加入画布'}</small></button><button type="button" className={`asset-favorite ${isFavorite ? 'active' : ''}`} onClick={() => toggleFavorite(entry.id, entry.nodeId)} aria-label={isFavorite ? `取消收藏${entry.title}` : `收藏${entry.title}`}><Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} /></button></article> })}</div> : <EmptySearch copy="没有匹配的资产" />}
    </div>
  )
}

const taskStatusIcon = {
  queued: <Clock3 size={16} />, running: <LoaderCircle size={16} className="spin" />, success: <Check size={16} />, failed: <AlertCircle size={16} />, idle: <Clock3 size={16} />, ready: <Clock3 size={16} />, cancelled: <X size={16} />, stale: <AlertCircle size={16} />,
}

function IpDrawer({ onAddNode }: Pick<DrawerProps, 'onAddNode'>) {
  const [query, setQuery] = useState('')
  const cards = [{ title: '街头少年 01', status: '可用', media: 'ip-one' }].filter((card) => card.title.includes(query))
  return (
    <div className="drawer-content">
      <SearchBox value={query} onChange={setQuery} placeholder="搜索资产名称" />
      <div className="inline-filters"><button type="button">全部类型 <ChevronDown size={13} /></button><button type="button">全部状态 <ChevronDown size={13} /></button></div>
      <div className="ip-grid">
        <button type="button" className="upload-ip" onClick={() => onAddNode('image', 'virtual-ip')}><Plus size={23} /><span>上传虚拟 IP</span></button>
        {cards.map((card) => <button type="button" className="ip-card" key={card.title} onClick={() => onAddNode('image', 'virtual-ip')}><span className={`ip-media ${card.media}`}><em className={card.status === '可用' ? 'available' : 'failed'}>{card.status}</em><i>预览</i></span><strong>{card.title}</strong><small>点击加入画布</small></button>)}
      </div>
    </div>
  )
}

const nodeIcon: Record<MediaNodeType, React.ReactNode> = {
  text: <MediaTypeIcon type="text" size={15} />,
  image: <MediaTypeIcon type="image" size={15} />,
  video: <MediaTypeIcon type="video" size={15} />,
  audio: <MediaTypeIcon type="audio" size={15} />,
}

const statusCopy = {
  queued: '等待执行', running: '生成中', success: '已完成', failed: '失败', idle: '未生成', ready: '可执行', cancelled: '已取消', stale: '输入已更新',
}

function ContentPreview({ node }: { node: CanvasFlowNode }) {
  const isImage = node.data.nodeType === 'image'
  const isVideo = node.data.nodeType === 'video'
  const source = isImage ? node.data.media?.url : isVideo ? node.data.media?.posterUrl : undefined
  if (!source) return <span className="content-type-icon" aria-hidden="true">{nodeIcon[node.data.nodeType]}</span>
  return <span className={`content-media-thumbnail ${isVideo ? 'is-video' : ''}`} role="img" aria-label={`${node.data.title}缩略图`}><img src={source} alt="" />{isVideo && <span aria-hidden="true"><CirclePlay size={13} fill="currentColor" /></span>}</span>
}

type ContentFilter = 'all' | MediaNodeType | 'group' | 'playlist'

const contentFilterLabels: Record<ContentFilter, string> = {
  all: '全部', text: '文本', image: '图片', video: '视频', audio: '音频', group: '分组', playlist: '播放列表',
}

interface DirectoryMenuItem {
  label: string
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
}

function ContentItemActions({ title, onLocate, items }: { title: string; onLocate: () => void; items: DirectoryMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="content-item-actions">
      <button type="button" className="content-locate" title="定位到画布" aria-label={`定位${title}`} onClick={onLocate}><Send size={14} /></button>
      <button ref={moreButtonRef} type="button" className="content-more" title="更多操作" aria-label={`打开${title}更多操作`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}><Ellipsis size={17} /></button>
      <AnchoredPopover anchorRef={moreButtonRef} open={open} onClose={() => setOpen(false)} className="content-item-menu" align="end">
        <div role="menu" aria-label={`${title}操作`}>
          {items.map((item) => <button type="button" role="menuitem" className={item.danger ? 'danger' : ''} key={item.label} onClick={() => { setOpen(false); item.onClick() }}>{item.icon}<span>{item.label}</span></button>)}
        </div>
      </AnchoredPopover>
    </div>
  )
}

function NodeDirectoryItem({ node, status, latestTask, nested = false, onLocateNode, onDeleteNode, onRenameNode, onDuplicateNode, onDownloadNodes }: {
  node: CanvasFlowNode
  status: keyof typeof statusCopy
  latestTask?: GenerationTask
  nested?: boolean
  onLocateNode: DrawerProps['onLocateNode']
  onDeleteNode: DrawerProps['onDeleteNode']
  onRenameNode: DrawerProps['onRenameNode']
  onDuplicateNode: DrawerProps['onDuplicateNode']
  onDownloadNodes: DrawerProps['onDownloadNodes']
}) {
  const title = node.data.title
  const menuItems: DirectoryMenuItem[] = [
    { label: '重命名', icon: <Pencil size={15} />, onClick: () => { const next = window.prompt('重命名节点', title); if (next?.trim()) onRenameNode(node.id, next.trim()) } },
    { label: '复制', icon: <Copy size={15} />, onClick: () => onDuplicateNode(node.id) },
    { label: '下载', icon: <Download size={15} />, onClick: () => onDownloadNodes([node.id]) },
    { label: '删除', icon: <Trash2 size={15} />, danger: true, onClick: () => onDeleteNode(node.id) },
  ]
  return (
    <article className={`content-item content-node content-${node.data.nodeType} content-${status} ${nested ? 'is-nested' : ''} ${node.selected ? 'active' : ''}`}>
      <div className="content-item-row">
        <button type="button" className="content-main" aria-label={`${title} ${labelForType(node.data.nodeType)} · ${statusCopy[status]}`} onClick={() => onLocateNode(node.id)}><ContentPreview node={node} /><span><strong>{title}</strong></span></button>
        <span className="content-status" title={statusCopy[status]}>{taskStatusIcon[status]}</span>
        <ContentItemActions title={title} onLocate={() => onLocateNode(node.id)} items={menuItems} />
      </div>
      {(status === 'running' || status === 'queued') && <div className="content-progress"><span style={{ width: `${latestTask?.progress ?? node.data.progress ?? 0}%` }} /></div>}
    </article>
  )
}

function GroupDirectoryItem({ group, nodes, tasksByNode, forceExpanded, onLocateGroup, onLocateNode, onDeleteNode, onRenameNode, onDuplicateNode, onDownloadNodes, onRenameGroup, onDuplicateGroup, onUngroup }: {
  group: CanvasGroup
  nodes: CanvasFlowNode[]
  tasksByNode: Map<string, GenerationTask[]>
  forceExpanded: boolean
  onLocateGroup: DrawerProps['onLocateGroup']
  onLocateNode: DrawerProps['onLocateNode']
  onDeleteNode: DrawerProps['onDeleteNode']
  onRenameNode: DrawerProps['onRenameNode']
  onDuplicateNode: DrawerProps['onDuplicateNode']
  onDownloadNodes: DrawerProps['onDownloadNodes']
  onRenameGroup: DrawerProps['onRenameGroup']
  onDuplicateGroup: DrawerProps['onDuplicateGroup']
  onUngroup: DrawerProps['onUngroup']
}) {
  const [expanded, setExpanded] = useState(false)
  const memberNodes = group.nodeIds.map((id) => nodes.find((node) => node.id === id)).filter((node): node is CanvasFlowNode => Boolean(node))
  const isExpanded = expanded || forceExpanded
  const active = memberNodes.length > 0 && memberNodes.every((node) => node.selected)
  const title = `${group.name}（${memberNodes.length} 个节点）`
  const menuItems: DirectoryMenuItem[] = [
    { label: '重命名', icon: <Pencil size={15} />, onClick: () => { const next = window.prompt('重命名分组', group.name); if (next?.trim()) onRenameGroup(group.id, next.trim()) } },
    { label: '复制', icon: <Copy size={15} />, onClick: () => onDuplicateGroup(group.id) },
    { label: '下载', icon: <Download size={15} />, onClick: () => onDownloadNodes(group.nodeIds) },
    { label: '解组', icon: <Ungroup size={15} />, danger: true, onClick: () => onUngroup(group.id) },
  ]
  return (
    <section className={`content-group ${active ? 'active' : ''}`}>
      <div className="content-item-row content-group-row">
        <button type="button" className={`content-expand ${isExpanded ? 'open' : ''}`} aria-label={`${isExpanded ? '收起' : '展开'}${group.name}`} aria-expanded={isExpanded} onClick={() => setExpanded((current) => !current)}><ChevronRight size={15} /></button>
        <button type="button" className="content-main" onClick={() => onLocateGroup(group.id)}><span className="content-type-icon content-group-icon" aria-hidden="true"><Folder size={20} /></span><span><strong>{title}</strong></span></button>
        <ContentItemActions title={group.name} onLocate={() => onLocateGroup(group.id)} items={menuItems} />
      </div>
      {isExpanded && <div className="content-group-children">{memberNodes.map((node) => {
        const latestTask = tasksByNode.get(node.id)?.[0]
        const status = latestTask?.status ?? node.data.status
        return <NodeDirectoryItem key={node.id} node={node} status={status} latestTask={latestTask} nested onLocateNode={onLocateNode} onDeleteNode={onDeleteNode} onRenameNode={onRenameNode} onDuplicateNode={onDuplicateNode} onDownloadNodes={onDownloadNodes} />
      })}</div>}
    </section>
  )
}

function PlaylistDirectoryItem({ playlist, nodes, onLocatePlaylist, onRenamePlaylist, onDuplicatePlaylist, onDeletePlaylist, onDownloadNodes }: {
  playlist: CanvasPlaylist
  nodes: CanvasFlowNode[]
  onLocatePlaylist: DrawerProps['onLocatePlaylist']
  onRenamePlaylist: DrawerProps['onRenamePlaylist']
  onDuplicatePlaylist: DrawerProps['onDuplicatePlaylist']
  onDeletePlaylist: DrawerProps['onDeletePlaylist']
  onDownloadNodes: DrawerProps['onDownloadNodes']
}) {
  const clipNodeIds = playlist.clips.map((clip) => clip.nodeId)
  const previewNode = clipNodeIds.map((id) => nodes.find((node) => node.id === id)).find((node): node is CanvasFlowNode => Boolean(node))
  const title = `${playlist.name}（${playlist.clips.length} 个片段）`
  const menuItems: DirectoryMenuItem[] = [
    { label: '重命名', icon: <Pencil size={15} />, onClick: () => { const next = window.prompt('重命名播放列表', playlist.name); if (next?.trim()) onRenamePlaylist(playlist.id, next.trim()) } },
    { label: '复制', icon: <Copy size={15} />, onClick: () => onDuplicatePlaylist(playlist.id) },
    { label: '下载', icon: <Download size={15} />, onClick: () => onDownloadNodes(clipNodeIds) },
    { label: '删除', icon: <Trash2 size={15} />, danger: true, onClick: () => onDeletePlaylist(playlist.id) },
  ]
  return (
    <article className="content-item content-playlist">
      <div className="content-item-row">
        <button type="button" className="content-main" onClick={() => onLocatePlaylist(playlist.id)}>{previewNode ? <ContentPreview node={previewNode} /> : <span className="content-type-icon" aria-hidden="true"><CirclePlay size={19} /></span>}<span><strong>{title}</strong></span></button>
        <ContentItemActions title={playlist.name} onLocate={() => onLocatePlaylist(playlist.id)} items={menuItems} />
      </div>
    </article>
  )
}

function ContentDrawer({ nodes, tasks, groups, playlists, onLocateNode, onDeleteNode, onRenameNode, onDuplicateNode, onDownloadNodes, onLocateGroup, onRenameGroup, onDuplicateGroup, onUngroup, onLocatePlaylist, onRenamePlaylist, onDuplicatePlaylist, onDeletePlaylist }: Pick<DrawerProps, 'nodes' | 'tasks' | 'groups' | 'playlists' | 'onLocateNode' | 'onDeleteNode' | 'onRenameNode' | 'onDuplicateNode' | 'onDownloadNodes' | 'onLocateGroup' | 'onRenameGroup' | 'onDuplicateGroup' | 'onUngroup' | 'onLocatePlaylist' | 'onRenamePlaylist' | 'onDuplicatePlaylist' | 'onDeletePlaylist'>) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ContentFilter>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const tasksByNode = useMemo(() => {
    const grouped = new Map<string, GenerationTask[]>()
    tasks.forEach((task) => grouped.set(task.nodeId, [...(grouped.get(task.nodeId) ?? []), task]))
    return grouped
  }, [tasks])
  const groupedNodeIds = useMemo(() => new Set(groups.flatMap((group) => group.nodeIds)), [groups])
  const normalizedQuery = query.trim()
  const visibleNodes = useMemo(() => {
    if (filter === 'group' || filter === 'playlist') return []
    return nodes.filter((node) => {
      const matchesQuery = !normalizedQuery || node.data.title.includes(normalizedQuery)
      const matchesType = filter === 'all'
        ? !groupedNodeIds.has(node.id)
        : node.data.nodeType === filter
      return matchesQuery && matchesType
    })
  }, [filter, groupedNodeIds, nodes, normalizedQuery])
  const visibleGroups = useMemo(() => {
    if (filter !== 'all' && filter !== 'group') return []
    return groups.filter((group) => !normalizedQuery || group.name.includes(normalizedQuery) || group.nodeIds.some((id) => nodes.find((node) => node.id === id)?.data.title.includes(normalizedQuery)))
  }, [filter, groups, nodes, normalizedQuery])
  const visiblePlaylists = useMemo(() => {
    if (filter !== 'all' && filter !== 'playlist') return []
    return playlists.filter((playlist) => !normalizedQuery || playlist.name.includes(normalizedQuery))
  }, [filter, normalizedQuery, playlists])
  const hasResults = visibleNodes.length + visibleGroups.length + visiblePlaylists.length > 0
  return (
    <div className="drawer-content content-drawer-content">
      <div className="content-directory-toolbar">
        <button ref={filterButtonRef} type="button" className="content-filter-trigger" aria-label="筛选画布内容" aria-haspopup="menu" aria-expanded={filterOpen} onClick={() => setFilterOpen((current) => !current)}>{contentFilterLabels[filter]}<ChevronDown size={14} /></button>
        <button type="button" className="content-toolbar-icon" title="搜索画布内容" aria-label="搜索画布内容" onClick={() => setSearchOpen((current) => !current)}><Search size={20} /></button>
      </div>
      <AnchoredPopover anchorRef={filterButtonRef} open={filterOpen} onClose={() => setFilterOpen(false)} className="content-filter-menu" align="start">
        <div role="menu" aria-label="画布内容筛选">{(Object.keys(contentFilterLabels) as ContentFilter[]).map((item) => <button type="button" role="menuitem" className={filter === item ? 'active' : ''} key={item} onClick={() => { setFilter(item); setFilterOpen(false) }}>{contentFilterLabels[item]}{filter === item && <Check size={17} />}</button>)}</div>
      </AnchoredPopover>
      {searchOpen && <SearchBox value={query} onChange={setQuery} placeholder="搜索画布内容" />}
      <div className="content-list">
        {visibleNodes.map((node) => {
          const latestTask = tasksByNode.get(node.id)?.[0]
          const status = latestTask?.status ?? node.data.status
          return <NodeDirectoryItem key={node.id} node={node} status={status} latestTask={latestTask} onLocateNode={onLocateNode} onDeleteNode={onDeleteNode} onRenameNode={onRenameNode} onDuplicateNode={onDuplicateNode} onDownloadNodes={onDownloadNodes} />
        })}
        {visibleGroups.map((group) => <GroupDirectoryItem key={group.id} group={group} nodes={nodes} tasksByNode={tasksByNode} forceExpanded={Boolean(normalizedQuery)} onLocateGroup={onLocateGroup} onLocateNode={onLocateNode} onDeleteNode={onDeleteNode} onRenameNode={onRenameNode} onDuplicateNode={onDuplicateNode} onDownloadNodes={onDownloadNodes} onRenameGroup={onRenameGroup} onDuplicateGroup={onDuplicateGroup} onUngroup={onUngroup} />)}
        {visiblePlaylists.map((playlist) => <PlaylistDirectoryItem key={playlist.id} playlist={playlist} nodes={nodes} onLocatePlaylist={onLocatePlaylist} onRenamePlaylist={onRenamePlaylist} onDuplicatePlaylist={onDuplicatePlaylist} onDeletePlaylist={onDeletePlaylist} onDownloadNodes={onDownloadNodes} />)}
      </div>
      {!hasResults && <EmptySearch copy="当前画布没有匹配的元素" />}
    </div>
  )
}

function ShortcutsDrawer() {
  const canvasRows = [['V', '移动工具'], ['H', '抓手工具'], ['单指 / 左键拖动', '框选节点'], ['Shift + 拖动', '追加框选'], ['双指滑动 / 滚轮', '平移画布'], ['Space + 拖动', '临时平移画布'], ['右键拖动', '鼠标框选兼容'], ['Cmd / Ctrl + D', '复制节点'], ['Delete / Backspace', '删除节点 / 连线 / 当前片段 / 播放列表'], ['Cmd / Ctrl + Z', '撤销'], ['Cmd / Ctrl + Shift + Z', '重做'], ['F', '适应画布'], ['Esc', '取消选择 / 关闭面板']]
  const playlistRows = [['← / →', '锁定 / 调整切割点（0.1 秒）'], ['Home / End', '锁定到片段起点 / 终点'], ['Shift + ← / →', '调整切割点（1 秒）'], ['Alt + ← / →', '调整片段顺序']]
  const renderRow = ([keys, action]: string[]) => <div key={keys}><kbd>{keys}</kbd><span>{action}</span></div>
  return <div className="drawer-content shortcut-list">
    <p className="drawer-section-label">画布</p>
    {canvasRows.map(renderRow)}
    <p className="drawer-section-label resources-label">播放列表</p>
    {playlistRows.map(renderRow)}
  </div>
}

function TutorialDrawer() {
  return <div className="drawer-content tutorial-content"><div className="tutorial-hero"><CirclePlay size={28} /><strong>从内容继续生成</strong><p>四步理解节点、参考与生成结果。</p></div>{['添加文本或媒体节点', '用端口连接生成参考', '在目标节点补充 Prompt 与参数', '生成后保留配置并继续向下创作'].map((step, index) => <div className="tutorial-step" key={step}><span>{index + 1}</span><p>{step}</p></div>)}</div>
}

function EmptySearch({ copy }: { copy: string }) { return <div className="drawer-empty"><Search size={22} /><p>{copy}</p><span>修改关键词后再试</span></div> }

export function DrawerPanel(props: DrawerProps) {
  if (!props.active) return null
  const content = {
    add: <AddDrawer onAddNode={props.onAddNode} onUploadFiles={props.onUploadFiles} onAuxiliaryTool={props.onAuxiliaryTool} />,
    assets: <AssetsDrawer onAddNode={props.onAddNode} onAddSessionAsset={props.onAddSessionAsset} nodes={props.nodes} onToggleNodeFavorite={props.onToggleNodeFavorite} sessionAssets={props.sessionAssets} assetFolders={props.assetFolders} />,
    content: <ContentDrawer
      nodes={props.nodes}
      tasks={props.tasks}
      groups={props.groups}
      playlists={props.playlists}
      onLocateNode={props.onLocateNode}
      onDeleteNode={props.onDeleteNode}
      onRenameNode={props.onRenameNode}
      onDuplicateNode={props.onDuplicateNode}
      onDownloadNodes={props.onDownloadNodes}
      onLocateGroup={props.onLocateGroup}
      onRenameGroup={props.onRenameGroup}
      onDuplicateGroup={props.onDuplicateGroup}
      onUngroup={props.onUngroup}
      onLocatePlaylist={props.onLocatePlaylist}
      onRenamePlaylist={props.onRenamePlaylist}
      onDuplicatePlaylist={props.onDuplicatePlaylist}
      onDeletePlaylist={props.onDeletePlaylist}
    />,
    shortcuts: <ShortcutsDrawer />,
    tutorial: <TutorialDrawer />,
  }[props.active]
  return <DrawerShell active={props.active} onClose={props.onClose}>{content}</DrawerShell>
}
