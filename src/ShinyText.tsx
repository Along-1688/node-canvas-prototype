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

/** A CSS-only equivalent of the React Bits moving text gradient. */
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
  const normalizedSpeed = Math.max(0.45, speed)
  const animationDirection = yoyo
    ? direction === 'left' ? 'alternate' : 'alternate-reverse'
    : direction === 'left' ? 'normal' : 'reverse'
  const style = {
    '--shiny-text-color': color,
    '--shiny-text-highlight': shineColor,
    '--shiny-text-speed': `${normalizedSpeed}s`,
    '--shiny-text-delay': `${Math.max(0, delay)}s`,
    '--shiny-text-spread': `${Math.max(30, Math.min(150, spread))}deg`,
    '--shiny-text-direction': animationDirection,
  } as CSSProperties

  return (
    <span
      className={`shiny-text ${disabled ? 'is-disabled' : ''} ${pauseOnHover ? 'pause-on-hover' : ''} ${className}`.trim()}
      style={style}
    >
      {text}
    </span>
  )
}
