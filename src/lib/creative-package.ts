export type CreativePackageInput = {
  title: string
  prompt: string
  audience: string
  objective: string
  visualDirection: string
  narration: string
  headline: string
  stillPrompt: string
  motionPreset?: string
  imageUrl?: string
  audioUrl?: string
  renderUrl?: string
}

export function buildCreativePackageMarkdown(
  input: CreativePackageInput,
): string {
  const sections = [
    `# ${input.title.trim() || 'Untitled creative brief'}`,
    `## Creator prompt\n${input.prompt.trim()}`,
    `## Audience\n${input.audience.trim()}`,
    `## Objective\n${input.objective.trim()}`,
    `## Headline\n${input.headline.trim()}`,
    `## Visual direction\n${input.visualDirection.trim()}`,
    `## Image prompt\n${input.stillPrompt.trim()}`,
    `## Motion style\n${input.motionPreset?.trim() || 'Slow push in'}`,
    `## Narration\n${input.narration.trim() || 'Silent concept'}`,
  ]

  if (input.imageUrl || input.audioUrl || input.renderUrl) {
    const assets = [
      '## Shareable generated assets',
      '> Anyone with these media links can view or download them. The editable MotionBrief project remains private to its owner.',
    ]
    if (input.imageUrl)
      assets.push(`![Generated campaign visual](${input.imageUrl})`)
    if (input.audioUrl)
      assets.push(`[Listen to or download the narration](${input.audioUrl})`)
    if (input.renderUrl)
      assets.push(`[Watch or download the final MP4](${input.renderUrl})`)
    sections.push(assets.join('\n\n'))
  }
  sections.push('---\nCreated with MotionBrief')
  return `${sections.join('\n\n')}\n`
}

export function safePackageFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'motionbrief'}-creative-package.md`
}
