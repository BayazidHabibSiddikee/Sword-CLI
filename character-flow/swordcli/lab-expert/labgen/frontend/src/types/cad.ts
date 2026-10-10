// CAD Design Types

export interface CADParameter {
  name: string
  label: string
  type: 'number' | 'string' | 'boolean' | 'select'
  defaultValue: number | string | boolean
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
  description?: string
  unit?: string
}

export interface CADTemplate {
  id: string
  name: string
  category: string
  description: string
  preview?: string // SVG or image path
  parameters: CADParameter[]
  script: string // FreeCAD Python script with {param} placeholders
  tags: string[]
  complexity: 'beginner' | 'intermediate' | 'advanced'
  estimatedTime: string // e.g., "2 min"
}

export interface CADDesign {
  id: string
  name: string
  templateId: string
  parameters: Record<string, number | string | boolean>
  createdAt: string
  updatedAt: string
  script?: string
  outputFiles?: string[]
  status: 'draft' | 'generating' | 'generated' | 'error'
  previewUrl?: string
}

export interface CADExportOptions {
  format: 'step' | 'stl' | 'brep' | 'iges' | 'obj' | 'gltf'
  precision: number
  units: 'mm' | 'cm' | 'm' | 'in'
  includeMetadata: boolean
}

export interface FreeCADExecutionResult {
  success: boolean
  output: string
  error: string
  returnCode: number
  outputFiles: string[]
  executionTime: number
}

export const CAD_CATEGORIES = [
  { id: 'primitives', name: 'Primitives', icon: '📦', description: 'Basic geometric shapes' },
  { id: 'mechanical', name: 'Mechanical Parts', icon: '⚙️', description: 'Gears, brackets, fasteners' },
  { id: 'electronics', name: 'Electronics', icon: '🔌', description: 'PCB enclosures, connectors' },
  { id: 'boolean', name: 'Boolean Operations', icon: '⚡', description: 'Cut, fuse, intersect operations' },
  { id: 'parametric', name: 'Parametric Designs', icon: '📐', description: 'Configurable parametric models' },
  { id: 'assembly', name: 'Assemblies', icon: '🔗', description: 'Multi-part assemblies' },
  { id: 'organic', name: 'Organic Shapes', icon: '🌊', description: 'Lofts, sweeps, splines' },
  { id: 'architectural', name: 'Architectural', icon: '🏗️', description: 'Building elements, profiles' },
] as const

export const EXPORT_FORMATS = [
  { value: 'step', label: 'STEP (.step/.stp)', description: 'ISO 10303 - Best for CAD interchange', icon: '📐' },
  { value: 'stl', label: 'STL (.stl)', description: 'Stereolithography - 3D printing', icon: '🖨️' },
  { value: 'brep', label: 'BREP (.brep)', description: 'OpenCASCADE native format', icon: '📦' },
  { value: 'iges', label: 'IGES (.igs)', description: 'Legacy CAD interchange', icon: '📄' },
  { value: 'obj', label: 'OBJ (.obj)', description: 'Wavefront - rendering/games', icon: '🎮' },
  { value: 'gltf', label: 'glTF (.gltf/.glb)', description: 'Web/AR/VR - modern 3D web', icon: '🌐' },
] as const