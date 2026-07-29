import { describe, expect, it } from 'vitest'
import { areCanvasShortcutsIsolated, isCanvasDeleteShortcutTargetEditing, isCanvasShortcutTargetInteractive, isPlaylistDeleteShortcutTarget } from '../canvasShortcuts'

describe('canvas shortcut isolation', () => {
  it('isolates global shortcuts whenever a modal surface is mounted', () => {
    expect(areCanvasShortcutsIsolated(document)).toBe(false)
    const dialog = document.createElement('section')
    dialog.dataset.isolateCanvasShortcuts = 'true'
    document.body.appendChild(dialog)
    expect(areCanvasShortcutsIsolated(document)).toBe(true)
    dialog.remove()
    expect(areCanvasShortcutsIsolated(document)).toBe(false)
  })

  it('does not route canvas shortcuts through focused controls', () => {
    const button = document.createElement('button')
    const link = document.createElement('a')
    const canvas = document.createElement('div')
    expect(isCanvasShortcutTargetInteractive(button)).toBe(true)
    expect(isCanvasShortcutTargetInteractive(link)).toBe(true)
    expect(isCanvasShortcutTargetInteractive(canvas)).toBe(false)
  })

  it('keeps text editing protected while allowing node deletion from media controls', () => {
    const prompt = document.createElement('textarea')
    const title = document.createElement('button')
    const waveform = document.createElement('input')
    waveform.type = 'range'

    expect(isCanvasDeleteShortcutTargetEditing(prompt)).toBe(true)
    expect(isCanvasDeleteShortcutTargetEditing(title)).toBe(false)
    expect(isCanvasDeleteShortcutTargetEditing(waveform)).toBe(false)
  })

  it('lets playlist buttons route only Delete and Backspace to the selected playlist item', () => {
    const playlist = document.createElement('section')
    playlist.className = 'canvas-playlist'
    const clipButton = document.createElement('button')
    const input = document.createElement('input')
    playlist.append(clipButton, input)

    expect(isPlaylistDeleteShortcutTarget(clipButton, 'Delete')).toBe(true)
    expect(isPlaylistDeleteShortcutTarget(clipButton, 'Backspace')).toBe(true)
    expect(isPlaylistDeleteShortcutTarget(clipButton, 'Space')).toBe(false)
    expect(isPlaylistDeleteShortcutTarget(input, 'Delete')).toBe(false)
    expect(isPlaylistDeleteShortcutTarget(document.createElement('button'), 'Delete')).toBe(false)
  })
})
