import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface DismissableLayerOptions {
  open: boolean
  onClose: () => void
  boundaryRefs: ReadonlyArray<RefObject<HTMLElement | null>>
}

export function useDismissableLayer({ open, onClose, boundaryRefs }: DismissableLayerOptions) {
  const onCloseRef = useRef(onClose)
  const boundaryRefsRef = useRef(boundaryRefs)
  onCloseRef.current = onClose
  boundaryRefsRef.current = boundaryRefs

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && boundaryRefsRef.current.some((ref) => ref.current?.contains(target))) return
      onCloseRef.current()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('pointerdown', closeOutside, true)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])
}

interface AnchoredPopoverProps {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  className?: string
  align?: 'start' | 'end'
  placement?: 'auto' | 'top'
  children: React.ReactNode
}

export function AnchoredPopover({ anchorRef, open, onClose, className = '', align = 'start', placement = 'auto', children }: AnchoredPopoverProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0, ready: false })

  useDismissableLayer({ open, onClose, boundaryRefs: [anchorRef, menuRef] })

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    const menu = menuRef.current
    if (!anchor || !menu) return
    const anchorRect = anchor.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    let left = align === 'end' ? anchorRect.right - menuRect.width : anchorRect.left
    left = Math.min(Math.max(8, left), window.innerWidth - menuRect.width - 8)
    let top = placement === 'top' ? anchorRect.top - menuRect.height - 6 : anchorRect.bottom + 6
    if (placement === 'top' && top < 8) top = Math.min(window.innerHeight - menuRect.height - 8, anchorRect.bottom + 6)
    if (placement === 'auto' && top + menuRect.height > window.innerHeight - 8) top = Math.max(8, anchorRect.top - menuRect.height - 6)
    setPosition({ top, left, ready: true })
  }, [align, anchorRef, placement])

  useLayoutEffect(() => {
    if (!open) return
    setPosition((current) => ({ ...current, ready: false }))
    const frame = window.requestAnimationFrame(updatePosition)
    return () => window.cancelAnimationFrame(frame)
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const reposition = () => updatePosition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, updatePosition])

  if (!open) return null
  return createPortal(
    <div
      ref={menuRef}
      className={`floating-popover nodrag nopan nowheel ${className}`}
      style={{ top: position.top, left: position.left, visibility: position.ready ? 'visible' : 'hidden' }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}
