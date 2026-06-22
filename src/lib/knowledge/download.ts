// Client-side download helpers (Phase U2). Closes the "no download for HTML/
// text Originals" gap — only PDFs had an open-in-tab affordance before.

/** Sanitize a title into a safe download filename with the given extension.
 *  PURE (no DOM) so it's unit-testable. */
export function safeDownloadName(title: string | null | undefined, ext: string): string {
  const base = (title ?? '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|_+$/g, '')
    .slice(0, 80)
  return `${base || 'download'}.${ext}`
}

/** Trigger a browser download of `content` as a file. */
export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Open an HTML string in a new tab (a viewable standalone document). */
export function openHtmlInTab(html: string): void {
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  // Revoke after the tab has had time to load.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
