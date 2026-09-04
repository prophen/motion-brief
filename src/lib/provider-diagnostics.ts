const SENSITIVE_KEY =
  /authorization|cookie|secret|token|password|audio(url)?|dataUrl|base64/i

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[redacted]' : sanitizeValue(child),
      ]),
    )
  }
  if (typeof value === 'string' && value.startsWith('data:'))
    return '[redacted data URL]'
  if (typeof value === 'string') {
    try {
      const url = new URL(value)
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        url.search = ''
        url.hash = ''
        return url.toString()
      }
    } catch {
      /* Not a URL. */
    }
  }
  return value
}

export function sanitizeDiagnosticBody(body: string): unknown {
  try {
    return sanitizeValue(JSON.parse(body))
  } catch {
    return body.replace(/data:[^\s]+/g, '[redacted data URL]').slice(0, 32_000)
  }
}
