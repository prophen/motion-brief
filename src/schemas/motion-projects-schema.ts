import type { CollectionSchema } from 'deepspace/schema'

export const motionProjectsSchema: CollectionSchema = {
  name: 'motion-projects',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain' },
    { name: 'prompt', storage: 'text', interpretation: 'plain' },
    { name: 'audience', storage: 'text', interpretation: 'plain' },
    { name: 'objective', storage: 'text', interpretation: 'plain' },
    { name: 'visualDirection', storage: 'text', interpretation: 'plain' },
    { name: 'motionDirection', storage: 'text', interpretation: 'plain' },
    { name: 'narration', storage: 'text', interpretation: 'plain' },
    { name: 'headline', storage: 'text', interpretation: 'plain' },
    { name: 'stillPrompt', storage: 'text', interpretation: 'plain' },
    { name: 'motionPrompt', storage: 'text', interpretation: 'plain' },
    { name: 'pipelineVersion', storage: 'number', interpretation: 'plain' },
    // JSON-encoded until the schema layer supports a native JSON storage column.
    { name: 'assetManifest', storage: 'text', interpretation: 'plain' },
    { name: 'imageUrl', storage: 'text', interpretation: 'plain' },
    { name: 'videoUrl', storage: 'text', interpretation: 'plain' },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['draft', 'ready', 'rendering', 'complete'] } },
  ],
  permissions: {
    viewer: { read: 'own', create: true, update: 'own', delete: 'own' },
    member: { read: 'own', create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
