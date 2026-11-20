import { useEffect, useRef, useState } from 'react'
import type { ApiClient } from '../../api/client'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { t, type Locale, type MessageKey } from '../../i18n'
import { format } from '../../i18n/format'
import { KEY_HELP } from './keyHelp'
import {
  DataSourceError,
  useDeleteSourceKey,
  useSaveSourceKey,
  type DataSource,
  type ResourceType,
  type SourceErrorKind,
} from './useDataSources'

const ERR_KEYS: Partial<Record<SourceErrorKind, MessageKey>> = {
  offline: 'sources.err.offline',
  source_key_rejected: 'sources.err.source_key_rejected',
  source_key_missing: 'sources.err.source_key_missing',
  source_key_invalid: 'sources.err.source_key_invalid',
  provider_timeout: 'sources.err.provider_timeout',
  provider_error: 'sources.err.provider_error',
  provider_rate_limited: 'sources.err.provider_rate_limited',
  rate_limited: 'sources.err.rate_limited',
  validation: 'sources.err.validation',
}

/**
 * Write-only key entry for one source, in a dialog: the stored key is never shown, only whether one is saved.
 * Save validates against the provider; a failure keeps the dialog open with the reason, success closes it.
 */
export function KeyDialog({
  source,
  type,
  api,
  locale,
  onClose,
}: {
  source: DataSource
  type: ResourceType
  api?: ApiClient
  locale: Locale
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const save = useSaveSourceKey(api)
  const del = useDeleteSourceKey(api)
  const busy = save.isPending || del.isPending
  const error = save.error ?? del.error
  const kind = error instanceof DataSourceError ? error.kind : 'unknown'
  const message = error
    ? format(t(locale, ERR_KEYS[kind] ?? (error === del.error ? 'sources.err.deleteFailed' : 'sources.err.unknown')), {
        source: source.label,
      })
    : undefined
  const trimmed = value.trim()
  const input = useRef<HTMLInputElement>(null)
  // a failed request must not take focus from the field: the user corrects the key right away
  useEffect(() => {
    if (error) input.current?.focus()
  }, [error])
  const help = KEY_HELP[source.id]

  // the mutation keeps its variables (the key) until reset
  function close() {
    save.reset()
    onClose()
  }

  function submit() {
    if (!trimmed || busy) return
    del.reset()
    save.mutate({ resourceType: type, source: source.id, apiKey: trimmed }, { onSuccess: close })
  }

  return (
    <ConfirmDialog
      role="dialog"
      tone="accent"
      initialFocus="content"
      width="max-w-md"
      title={format(t(locale, 'sources.keyTitle'), { source: source.label })}
      body={help ? t(locale, help.message) : format(t(locale, 'sources.keyHint'), { source: source.label })}
      confirmLabel={t(locale, source.tokenSaved ? 'sources.keyReplace' : 'sources.keySave')}
      cancelLabel={t(locale, 'settings.cancel')}
      confirmDisabled={!trimmed}
      pending={busy}
      onConfirm={submit}
      onCancel={close}
    >
      <div className="mt-4 flex items-center gap-2">
        <input
          type="password"
          ref={input}
          autoFocus
          aria-label={format(t(locale, 'sources.keyLabel'), { source: source.label })}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          readOnly={busy}
          placeholder={t(locale, source.tokenSaved ? 'sources.keySavedPlaceholder' : 'sources.keyPlaceholder')}
          onChange={(e) => {
            // editing the key dismisses the previous failure
            save.reset()
            del.reset()
            setValue(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          aria-invalid={message ? true : undefined}
          className={`text-input bg-surface-2 h-11 min-w-0 flex-1 rounded-md px-3 ${message ? 'ring-danger ring-1' : ''}`}
        />
        {source.tokenSaved && (
          <button
            type="button"
            disabled={busy}
            aria-label={t(locale, 'sources.keyRemove')}
            title={t(locale, 'sources.keyRemove')}
            onClick={() => {
              save.reset()
              del.mutate({ resourceType: type, source: source.id })
            }}
            className="text-danger flex size-11 shrink-0 items-center justify-center rounded-md active:opacity-70 disabled:opacity-60"
          >
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6" />
            </svg>
          </button>
        )}
      </div>
      {/* one line is reserved for a failure right under the field, so a typical failure does not resize the dialog */}
      <div className="mt-1.5 min-h-[18px] px-1">
        {message && (
          <p role="alert" className="text-danger text-foot [overflow-wrap:anywhere]">
            {message}
          </p>
        )}
      </div>
      {help && (
        <a
          href={help.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent text-body mt-1 -mb-1 inline-flex min-h-11 items-center font-semibold"
        >
          {format(t(locale, 'sources.keyHelpLink'), { source: source.label })}
        </a>
      )}
    </ConfirmDialog>
  )
}
