import { client as defaultClient, type ApiClient } from '../../api/client'
import type { components } from '../../api/schema'
import { call, callApi, errorFromResponse } from '../media/errors'
import type { ReminderType } from './types'

type Schemas = components['schemas']

/** Request and response shapes per type, taken from the generated contract. */
interface Shapes {
  subscriptions: {
    item: Schemas['Subscription']
    create: Schemas['CreateSubscriptionRequest']
    update: Schemas['UpdateSubscriptionRequest']
  }
  licenses: {
    item: Schemas['License']
    create: Schemas['CreateLicenseRequest']
    update: Schemas['UpdateLicenseRequest']
  }
}
export type ReminderItemOf<T extends ReminderType> = Shapes[T]['item']
export type CreateReminder<T extends ReminderType> = Shapes[T]['create']
export type UpdateReminder<T extends ReminderType> = Shapes[T]['update']

/** Client-side limit for a create: the sheet stays open, the same id is retried. */
const CREATE_TIMEOUT_MS = 15_000

/**
 * The data seam for subscriptions and licenses: online only, every call goes through the shared client; failures throw
 * `MediaError` (the shared typed API error); nothing is queued or cached here. The two resources have identical paths and
 * bodies apart from the license key, so one implementation serves both: the path is built from the type and narrowed
 * once to the subscription path for the client's typing.
 */
export function createRemindersRepository(api: ApiClient = defaultClient) {
  const base = <T extends ReminderType>(type: T) => `/api/v1/${type}` as '/api/v1/subscriptions'
  const item = <T extends ReminderType>(type: T) => `${base(type)}/{id}` as '/api/v1/subscriptions/{id}'
  const answer = <R>(r: Promise<unknown>) => r as Promise<{ data?: R; error?: unknown; response: Response }>

  return {
    list: <T extends ReminderType>(type: T) => callApi(() => answer<ReminderItemOf<T>[]>(api.GET(base(type)))),
    /** Resolves with the stored record for both 201 (created) and 200 (same id re-POSTed). */
    create: <T extends ReminderType>(type: T, body: CreateReminder<T>) =>
      callApi(() =>
        answer<ReminderItemOf<T>>(
          api.POST(base(type), {
            body: body as Schemas['CreateSubscriptionRequest'],
            signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
          }),
        ),
      ),
    update: <T extends ReminderType>(type: T, id: string, body: UpdateReminder<T>) =>
      callApi(() =>
        answer<ReminderItemOf<T>>(
          api.PATCH(item(type), { params: { path: { id } }, body: body as Schemas['UpdateSubscriptionRequest'] }),
        ),
      ),
    delete: <T extends ReminderType>(type: T, id: string) =>
      call(async () => {
        const { error, response } = await api.DELETE(item(type), { params: { path: { id } } })
        if (!response.ok) throw errorFromResponse(response.status, error, response.headers)
      }),
    /** Waits for the server; `expectedExpiryDate` is the date the client shows, so a stale repeat does not renew twice. */
    renew: <T extends ReminderType>(type: T, id: string, expectedExpiryDate: string) =>
      callApi(() =>
        answer<ReminderItemOf<T>>(
          api.POST(`${item(type)}/renew` as '/api/v1/subscriptions/{id}/renew', {
            params: { path: { id } },
            body: { expectedExpiryDate },
          }),
        ),
      ),
  }
}
