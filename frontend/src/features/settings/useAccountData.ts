import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authSignal, client as defaultClient, type ApiClient } from '../../api/client'

/** File name from a `Content-Disposition` header (`filename*` first), or null when absent or unusable. */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null
  let name: string | null = null
  const star = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header)
  if (star?.[1]) {
    try {
      name = decodeURIComponent(star[1].trim())
    } catch {
      name = null
    }
  }
  if (!name) {
    const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header)
    name = (plain?.[1] ?? plain?.[2] ?? '').trim() || null
  }
  if (!name) return null
  // keep a bare file name only: no path, no control characters
  // eslint-disable-next-line no-control-regex
  const clean = name.replace(/[\\/\u0000-\u001f]/g, '_').trim()
  return clean && clean !== '.' && clean !== '..' ? clean : null
}

export function fallbackExportName(now: Date = new Date()): string {
  return `rwx-export-${now.toISOString().slice(0, 10)}.json`
}

const REVOKE_DELAY_MS = 5000

/** Saves a blob through a temporary object URL and `<a download>`; the URL is revoked a few seconds after the click. */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.hidden = true
  document.body.appendChild(a)
  try {
    a.click()
  } finally {
    a.remove()
    // iOS Safari may read the blob late (preview/share sheet), so keep the URL alive a few seconds
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
  }
}

/** `GET /me/export` and download the JSON. The body may contain license keys: never stored, never logged. */
export function useExportData(api: ApiClient = defaultClient) {
  return useMutation({
    mutationFn: async () => {
      const { data, response } = await api.GET('/api/v1/me/export', {
        parseAs: 'blob',
      })
      if (!response.ok || !(data instanceof Blob)) throw new Error(`export ${response.status}`)
      saveBlob(data, fileNameFromDisposition(response.headers.get('Content-Disposition')) ?? fallbackExportName())
    },
  })
}

function clearDeviceState() {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('rwx.')) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    // storage unavailable: nothing to clear
  }
}

/** `DELETE /me`; on 204 (or 401: already signed out) clear device-local state and show the landing page. */
export function useDeleteAccount(api: ApiClient = defaultClient) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { response } = await api.DELETE('/api/v1/me')
      if (!response.ok && response.status !== 401) throw new Error(`deleteMe ${response.status}`)
    },
    onSuccess: () => {
      qc.clear()
      clearDeviceState()
      authSignal.raise()
    },
  })
}
