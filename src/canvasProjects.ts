import type { CanvasDocument } from './types'

export interface CanvasProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  canvases: CanvasDocument[]
  activeCanvasId: string
  cover?: CanvasProjectCover
}

export interface CanvasProjectCover {
  mode: 'auto' | 'manual'
  imageUrl?: string
  source: 'default' | 'snapshot' | 'upload'
  canvasId?: string
  sourceNodeId?: string
  updatedAt?: number
}

export function canvasProjectActiveCanvas(project: CanvasProject) {
  return project.canvases.find((canvas) => canvas.id === project.activeCanvasId) ?? project.canvases[0]
}

export function createCanvasProject(id: string, name: string, canvas: CanvasDocument, createdAt = Date.now()): CanvasProject {
  return {
    id,
    name,
    createdAt,
    updatedAt: createdAt,
    canvases: [canvas],
    activeCanvasId: canvas.id,
    cover: { mode: 'auto', source: 'default' },
  }
}

export function updateProjectCanvases(
  projects: CanvasProject[],
  projectId: string,
  updater: (canvases: CanvasDocument[]) => CanvasDocument[],
  updatedAt = Date.now(),
) {
  return projects.map((project) => {
    if (project.id !== projectId) return project
    const canvases = updater(project.canvases)
    return canvases === project.canvases ? project : { ...project, canvases, updatedAt }
  })
}
