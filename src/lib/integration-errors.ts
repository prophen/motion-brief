function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function collectMessages(value: unknown, messages: string[], requestIds: string[]): void {
  if (Array.isArray(value)) return value.forEach(child => collectMessages(child, messages, requestIds))
  const object = asObject(value)
  if (!object) return
  for (const [key, child] of Object.entries(object)) {
    if (['request_id', 'requestId', 'correlation_id'].includes(key) && typeof child === 'string') requestIds.push(child)
    if (['error', 'message', 'detail'].includes(key) && typeof child === 'string') {
      messages.push(child)
      const jsonStart = child.indexOf('{')
      if (jsonStart >= 0) {
        try { collectMessages(JSON.parse(child.slice(jsonStart)), messages, requestIds) } catch { /* Plain provider message. */ }
      }
    }
    if (typeof child === 'object') collectMessages(child, messages, requestIds)
  }
}

export function formatIntegrationError(endpoint: string, status: number, responseText: string, correlation?: string): string {
  let parsed: unknown = responseText
  try { parsed = JSON.parse(responseText) } catch { /* Keep plain text. */ }
  const messages: string[] = [], requestIds: string[] = []
  collectMessages(parsed, messages, requestIds)
  const uniqueMessages = [...new Set(messages)]
  const useful = [...uniqueMessages].reverse().find(message => !/^.+ API error \d+:/.test(message))
    ?? uniqueMessages.at(-1)
    ?? (typeof parsed === 'string' ? parsed : '')
  const detail = useful.replace(/\s+/g, ' ').slice(0, 360)
  const request = [...new Set(requestIds)].at(-1) ?? correlation
  return `${endpoint.replaceAll('/', '_')}_failed_${status}${detail ? `: ${detail}` : ''}${request ? ` (request ${request})` : ''}`
}
