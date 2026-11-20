import { useId, useRef, useState } from 'react'
import type { ApiClient } from '../../api/client'
import { Sheet } from '../../components/Sheet'
import { Spinner } from '../../components/Spinner'
import { t, type Locale, type MessageKey } from '../../i18n'
import { isMediaError } from '../media/errors'
import { errorMessage } from '../media/errorMessage'
import { CheckIcon, MinusIcon, PlusIcon } from '../media/icons'
import { daysText, PATTERNS } from './ReminderCard'
import { useCreateReminder, useUpdateReminder } from './hooks'
import type { CreateReminder, UpdateReminder } from './repository'
import type { Reminder, ReminderType, Subscription } from './types'

type Pattern = Subscription['renewalPattern']
type FieldKey = 'name' | 'customDays' | 'expiry'

const PATTERN_ORDER: readonly Pattern[] = ['monthly', 'yearly', 'custom', 'none', 'lifetime']
const MAX_EXPIRY = '2999-12-31'
const MAX_CUSTOM_DAYS = 36500
const REMIND_MIN = 1
const REMIND_MAX = 14
const DEFAULT_REMIND = 3
/** The contract's field names in a 400, as the form calls them. */
const SERVER_FIELDS: Record<string, FieldKey> = { name: 'name', customRenewalDays: 'customDays', expiryDate: 'expiry' }

const TITLES: Record<ReminderType, { create: MessageKey; edit: MessageKey }> = {
  subscriptions: { create: 'reminders.new.subscriptions', edit: 'reminders.edit.subscriptions' },
  licenses: { create: 'reminders.new.licenses', edit: 'reminders.edit.licenses' },
}

interface Form {
  name: string
  pattern: Pattern
  customDays: string
  expiry: string
  remind: number
  cost: string
  description: string
  licenseKey: string
}

function formOf(item?: Reminder): Form {
  return {
    name: item?.name ?? '',
    pattern: item?.renewalPattern ?? 'monthly',
    customDays: item?.customRenewalDays ? String(item.customRenewalDays) : '',
    expiry: item?.expiryDate ?? '',
    remind: item?.remindDays ?? DEFAULT_REMIND,
    cost: item?.cost ?? '',
    description: item?.description ?? '',
    licenseKey: item?.licenseKey ?? '',
  }
}

/** The contract's rules for the fields the chosen pattern shows, checked before a request is made. */
function problems(f: Form): Record<FieldKey, boolean> {
  const days = /^\d+$/.test(f.customDays) ? Number(f.customDays) : 0
  return {
    name: f.name.trim() === '',
    customDays: f.pattern === 'custom' && (days < 1 || days > MAX_CUSTOM_DAYS),
    // a four-digit year keeps the string comparison valid (the date input can produce longer years)
    expiry: f.pattern !== 'lifetime' && !(/^\d{4}-\d{2}-\d{2}$/.test(f.expiry) && f.expiry <= MAX_EXPIRY),
  }
}

/** A lifetime has no date; its hidden remind days stay at their value. */
function createBody(id: string, f: Form, type: ReminderType): CreateReminder<ReminderType> {
  return {
    id,
    name: f.name.trim(),
    renewalPattern: f.pattern,
    remindDays: f.remind,
    ...(f.pattern !== 'lifetime' && { expiryDate: f.expiry }),
    ...(f.pattern === 'custom' && { customRenewalDays: Number(f.customDays) }),
    ...(f.cost.trim() && { cost: f.cost.trim() }),
    ...(f.description.trim() && { description: f.description.trim() }),
    ...(type === 'licenses' && f.licenseKey.trim() && { licenseKey: f.licenseKey }),
  }
}

/** Changed fields only; an emptied cost, description or key is sent as "" (the server clears it). */
function patchOf(item: Reminder, f: Form, type: ReminderType): UpdateReminder<ReminderType> {
  const days = Number(f.customDays)
  return {
    ...(f.name.trim() !== item.name && { name: f.name.trim() }),
    ...(f.pattern !== item.renewalPattern && { renewalPattern: f.pattern }),
    ...(f.pattern === 'custom' && days !== item.customRenewalDays && { customRenewalDays: days }),
    ...(f.pattern !== 'lifetime' && f.expiry !== (item.expiryDate ?? '') && { expiryDate: f.expiry }),
    ...(f.remind !== item.remindDays && { remindDays: f.remind }),
    ...(f.cost.trim() !== (item.cost ?? '') && { cost: f.cost.trim() }),
    ...(f.description.trim() !== (item.description ?? '') && { description: f.description.trim() }),
    ...(type === 'licenses' && f.licenseKey !== (item.licenseKey ?? '') && { licenseKey: f.licenseKey }),
  }
}

const INPUT = 'bg-surface-2 text-ink text-input min-h-11 w-full rounded-md px-3'

function Field({
  label,
  id,
  error,
  hint,
  children,
}: {
  label: string
  id: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="text-foot text-ink-2 mb-1 block">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-note`} className="text-foot text-danger mt-1">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-note`} className="text-foot text-ink-2 mt-1">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

/**
 * Add (no `item`) or edit sheet. A create keeps one client id for the life of the sheet, so a retry after a failure
 * re-sends the same id; an edit sends only what changed. Failures stay in the sheet with the typed values.
 */
export function ReminderSheet({
  type,
  item,
  locale,
  api,
  onClose,
}: {
  type: ReminderType
  item?: Reminder
  locale: Locale
  api?: ApiClient
  onClose: () => void
}) {
  const create = useCreateReminder(type, api)
  const update = useUpdateReminder(type, api)
  const id = useRef(crypto.randomUUID())
  const formId = useId()
  const [form, setForm] = useState(() => formOf(item))
  const [touched, setTouched] = useState<readonly FieldKey[]>([])
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [alert, setAlert] = useState('')
  const pending = create.isPending || update.isPending
  const bad = problems(form)
  const invalid = bad.name || bad.customDays || bad.expiry

  const error = (key: FieldKey): string | undefined =>
    serverErrors[key] ?? (touched.includes(key) && bad[key] ? t(locale, `reminders.form.error.${key}`) : undefined)
  const errors = { name: error('name'), customDays: error('customDays'), expiry: error('expiry') }
  const field = (key: FieldKey, fieldId: string) => ({
    id: fieldId,
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': `${fieldId}-note`,
    onBlur: () => setTouched((seen) => [...seen, key]),
    className: INPUT,
  })

  const nameId = `${formId}-name`
  const daysId = `${formId}-days`
  const expiryId = `${formId}-expiry`
  const remindId = `${formId}-remind`

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm({ ...form, [key]: value })
    setServerErrors({})
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    if (invalid) {
      // Save stays available: it reveals every error and moves to the first bad field
      setTouched(['name', 'customDays', 'expiry'])
      const first = bad.name ? nameId : bad.customDays ? daysId : expiryId
      document.getElementById(first)?.focus()
      return
    }
    setAlert('')
    setServerErrors({})
    try {
      if (!item) {
        await create.mutateAsync(createBody(id.current, form, type))
      } else {
        const patch = patchOf(item, form, type)
        if (Object.keys(patch).length > 0) await update.mutateAsync({ id: item.id, patch })
      }
      onClose()
    } catch (e) {
      const named = isMediaError(e) ? e.fieldErrors.filter((f) => f.field in SERVER_FIELDS) : []
      if (named.length > 0) {
        setServerErrors(Object.fromEntries(named.map((f) => [SERVER_FIELDS[f.field], f.message])))
      } else {
        setAlert(
          errorMessage(
            locale,
            e,
            {},
            { overrides: { network: 'reminders.error.network', timeout: 'reminders.error.network' } },
          ),
        )
      }
    }
  }

  return (
    <Sheet
      title={t(locale, TITLES[type][item ? 'edit' : 'create'])}
      closeLabel={t(locale, 'media.cancel')}
      onClose={onClose}
      footer={
        <>
          {alert && (
            <p role="alert" className="text-danger bg-danger-bg text-body mb-2 rounded-md px-3 py-2">
              {alert}
            </p>
          )}
          <button
            type="submit"
            form={formId}
            disabled={pending}
            aria-busy={pending || undefined}
            className="bg-accent text-on-accent text-input min-h-11 w-full rounded-md font-semibold disabled:opacity-60"
          >
            <span className="inline-flex items-center justify-center gap-2">
              {pending && <Spinner />}
              {t(locale, 'reminders.form.save')}
            </span>
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate>
        <Field label={t(locale, 'reminders.form.name')} id={nameId} error={errors.name}>
          <input
            {...field('name', nameId)}
            data-autofocus={item ? undefined : ''}
            value={form.name}
            maxLength={200}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>

        <fieldset className="mb-3">
          <legend className="text-foot text-ink-2 mb-1">{t(locale, 'reminders.form.renewal')}</legend>
          <div className="flex flex-wrap gap-2">
            {PATTERN_ORDER.map((pattern) => (
              <label key={pattern} className="relative">
                <input
                  type="radio"
                  name={`${formId}-pattern`}
                  checked={form.pattern === pattern}
                  onChange={() => set('pattern', pattern)}
                  className="peer sr-only"
                />
                <span className="bg-surface-2 text-ink text-body peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:ring-accent flex min-h-11 items-center gap-1 rounded-full px-4 peer-focus-visible:ring-2">
                  {form.pattern === pattern && <CheckIcon />}
                  {t(locale, pattern === 'custom' ? 'reminders.pattern.customShort' : PATTERNS[pattern])}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {form.pattern === 'custom' && (
          <Field
            label={t(locale, 'reminders.form.customDays')}
            id={daysId}
            hint={t(locale, 'reminders.form.customDays.hint')}
            error={errors.customDays}
          >
            <input
              {...field('customDays', daysId)}
              inputMode="numeric"
              value={form.customDays}
              onChange={(e) => set('customDays', e.target.value)}
            />
          </Field>
        )}

        {form.pattern !== 'lifetime' && (
          <>
            <Field label={t(locale, 'reminders.form.expiry')} id={expiryId} error={errors.expiry}>
              <input
                {...field('expiry', expiryId)}
                // an empty native date shows its dd/mm/yyyy mask: dim it so it does not read as a value
                className={form.expiry === '' ? INPUT.replace('text-ink', 'text-ink/40') : INPUT}
                type="date"
                max={MAX_EXPIRY}
                value={form.expiry}
                onChange={(e) => set('expiry', e.target.value)}
              />
            </Field>

            <div role="group" aria-labelledby={remindId} className="mb-3">
              <p id={remindId} className="text-foot text-ink-2 mb-1">
                {t(locale, 'reminders.form.remind')}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={t(locale, 'reminders.form.fewer')}
                  disabled={form.remind <= REMIND_MIN}
                  onClick={() => set('remind', form.remind - 1)}
                  className="bg-surface-2 text-ink flex size-11 items-center justify-center rounded-md disabled:opacity-40"
                >
                  <MinusIcon />
                </button>
                <span aria-live="polite" className="text-input min-w-24 text-center font-semibold">
                  {daysText(locale, form.remind)}
                </span>
                <button
                  type="button"
                  aria-label={t(locale, 'reminders.form.more')}
                  disabled={form.remind >= REMIND_MAX}
                  onClick={() => set('remind', form.remind + 1)}
                  className="bg-surface-2 text-ink flex size-11 items-center justify-center rounded-md disabled:opacity-40"
                >
                  <PlusIcon />
                </button>
              </div>
            </div>
          </>
        )}

        <Field label={t(locale, 'reminders.form.cost')} id={`${formId}-cost`}>
          <input
            id={`${formId}-cost`}
            className={INPUT}
            value={form.cost}
            maxLength={100}
            placeholder={t(locale, 'reminders.form.cost.placeholder')}
            onChange={(e) => set('cost', e.target.value)}
          />
        </Field>
        <Field label={t(locale, 'reminders.form.description')} id={`${formId}-description`}>
          <textarea
            id={`${formId}-description`}
            className={`${INPUT} resize-none py-2`}
            rows={3}
            value={form.description}
            maxLength={20000}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
        {type === 'licenses' && (
          <Field label={t(locale, 'reminders.form.licenseKey')} id={`${formId}-key`}>
            <textarea
              id={`${formId}-key`}
              className={`${INPUT} [field-sizing:content] max-h-48 py-2 font-mono [overflow-wrap:anywhere]`}
              rows={3}
              value={form.licenseKey}
              maxLength={10000}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => set('licenseKey', e.target.value)}
            />
          </Field>
        )}
      </form>
    </Sheet>
  )
}
