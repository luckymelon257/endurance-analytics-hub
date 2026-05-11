/**
 * Island registry — name → dynamic loader. Vite code-splits each island into
 * its own chunk because the import is dynamic. Add a new island here as a
 * one-liner; the mount runtime in main.ts picks it up automatically.
 */
export const islandRegistry = {
  'activity-charts': () => import('./activity-charts'),
  'training-heatmap': () => import('./training-heatmap'),
  'weekly-volume': () => import('./weekly-volume'),
} as const

export type IslandName = keyof typeof islandRegistry
