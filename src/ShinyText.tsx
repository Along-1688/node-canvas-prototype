import type { CSSProperties } from 'react'

type ShinyTextProps = {
  text: string
  disabled?: boolean
  speed?: number
  delay?: number
  color?: string
  shineColor?: string
  spread?: number
  yoyo?: boolean
  pauseOnHover?: boolean
  direction?: 'left' | 'right'
  className?: string
}

/**
 * A lightweight loading-text sheen.  The highlight is a clipped solid-text
 * overlay, so the effect stays legible and does not need an animation runtime.
 */
export function ShinyText({
  text,
  disabled = false,
  speed = 2,
  delay = 0,
  color = '#b5b5b5',
  shineColor = '#ffffff',
  spread = 120,
  yoyo = false,
  pauseOnHover = false,
  direction = 'left',
  className = '',
}: ShinyTextProps) {
  const normalizedSpeed = Math.max(0.8, speed)
  const bandWidth = Math.max(12, Math.min(32, spread / 6))
  const style = {
    '--shiny-text-color': color,
    '--shiny-text-highlight': shineColor,
    '--shiny-text-speed': `${normalizedSpeed}s`,
    '--shiny-text-delay': `${Math.max(0, delay)}s`,
    '--shiny-text-band': `${bandWidth}%`,
    '--shiny-text-direction': direction === 'left' ? 'normal' : 'reverse',
    '--shiny-text-cycle': yoyo ? 'alternate' : 'normal',
  } as CSSProperties

  return (
    <span
      className={`shiny-text ${disabled ? 'is-disabled' : ''} ${pauseOnHover ? 'pause-on-hover' : ''} ${className}`.trim()}
      style={style}
    >
      <span className="shiny-text-base">{text}</span>
      {!disabled && <span className="shiny-text-highlight" aria-hidden="true">{text}</span>}
    </span>
  )
}
