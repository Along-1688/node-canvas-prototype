import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import { useCanvasActions } from './canvasContext'
import type { AudioOperation, CanvasFlowEdge, ImageOperation, VideoOperation } from './types'

const operationLabels: Record<ImageOperation, string> = {
  crop: '裁剪',
  rotate: '旋转',
  'multi-angle': '多角度',
  repaint: '重绘',
  relight: '打光',
  expand: '智能扩图',
  upscale: '图片高清',
  'grid-split': '宫格切分',
  'edit-text': '编辑文字',
  annotate: '标注',
  'prompt-regenerate': '再次生成',
  'image-editor': '图片编辑',
  'image-compose': '图片合成',
}

const videoOperationLabels: Record<VideoOperation, string> = {
  'super-resolution': '视频超分',
  'frame-interpolation': '视频补帧',
  'subtitle-removal': '字幕擦除',
  'lip-sync': '对口型',
  edit: '视频编辑',
}

const audioOperationLabels: Record<AudioOperation, string> = {
  trim: '裁剪音频',
}

function FlowingEdgeStrand({ path, edgeId, sourceX, sourceY, targetX, targetY }: {
  path: string
  edgeId: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
}) {
  const gradientId = `edge-flow-gradient-${edgeId}`
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return <>
    <defs>
      <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
        <stop offset="0%" stopColor="oklch(.82 0 0)" />
        <stop offset="30%" stopColor="oklch(.74 0 0)" />
        <stop offset="64%" stopColor="oklch(.9 0 0)" />
        <stop offset="100%" stopColor="var(--brand-accent)" />
      </linearGradient>
    </defs>
    <path d={path} pathLength={1} className="canvas-edge-flow" stroke={`url(#${gradientId})`} aria-hidden="true">
      {!reduceMotion && <animate attributeName="stroke-dashoffset" from="0" to="-1" dur="1.18s" repeatCount="indefinite" />}
    </path>
  </>
}

export function CanvasEdge(props: EdgeProps<CanvasFlowEdge>) {
  const { deleteEdge, selectedItemCount } = useCanvasActions()
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    curvature: 0.35,
  })
  const state = props.selected ? 'is-selected' : props.data?.hovered ? 'is-hovered' : props.data?.highlighted ? 'is-related' : 'is-default'
  const shouldShowFlow = props.selected || props.data?.hovered || (props.data?.highlighted && selectedItemCount === 1)
  const label = props.data?.relationType === 'image-operation'
    ? operationLabels[props.data.operation ?? 'prompt-regenerate']
    : props.data?.relationType === 'video-operation'
      ? videoOperationLabels[props.data.videoOperation ?? 'edit']
      : props.data?.relationType === 'audio-operation'
        ? audioOperationLabels[props.data.audioOperation ?? 'trim']
      : props.data?.operation === 'prompt-regenerate'
      ? '再次生成'
      : '生成参考'

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        interactionWidth={20}
        className={`canvas-edge-path ${state}`}
      />
      {shouldShowFlow && <FlowingEdgeStrand path={path} edgeId={props.id} sourceX={props.sourceX} sourceY={props.sourceY} targetX={props.targetX} targetY={props.targetY} />}
      {props.selected && selectedItemCount === 1 && (
        <EdgeLabelRenderer>
          <div
            className="edge-action nodrag nopan"
            data-canvas-overlay="true"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            title={`${label}连线`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={(event) => { event.stopPropagation(); deleteEdge(props.id) }} aria-label={`删除${label}连线`} title="删除连线">
              <Trash2 size={13} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const edgeTypes = { canvas: CanvasEdge }
