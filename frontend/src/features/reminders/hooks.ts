import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '../../api/client'
import { mutationMode, refetchIfStale, upsert, useCreate, useDelete, useList } from '../media/hooks'
import { createRemindersRepository, type CreateReminder, type ReminderItemOf, type UpdateReminder } from './repository'
import type { ReminderType } from './types'

export const remindersKey = (type: ReminderType) => ['reminders', type] as const

/**
 * One set of hooks for both types. The list, create and delete mechanics are the media ones (same cache rules: a stored
 * row replaces the cached one, a 404/410 refetches the list, a failure leaves the cache as it was); update and renew wait
 * for the server (no optimistic change) and then write the returned record.
 */
function useRepo(api?: ApiClient) {
  return useMemo(() => createRemindersRepository(api), [api])
}

function useWrite<T extends ReminderType, V>(type: T, write: (vars: V) => Promise<ReminderItemOf<T>>) {
  const qc = useQueryClient()
  return useMutation({
    ...mutationMode,
    mutationFn: write,
    onSuccess: (item) => upsert(qc, remindersKey(type), item),
    onError: (error) => refetchIfStale(qc, remindersKey(type), error),
  })
}

export function useReminders(type: ReminderType, api?: ApiClient) {
  const repo = useRepo(api)
  return useList(remindersKey(type), () => repo.list(type))
}

/** The caller supplies the client UUID in the body and sends the same one on retry. */
export function useCreateReminder<T extends ReminderType>(type: T, api?: ApiClient) {
  const repo = useRepo(api)
  return useCreate(remindersKey(type), (body: CreateReminder<T>) => repo.create(type, body))
}

export function useUpdateReminder<T extends ReminderType>(type: T, api?: ApiClient) {
  const repo = useRepo(api)
  return useWrite(type, ({ id, patch }: { id: string; patch: UpdateReminder<T> }) => repo.update(type, id, patch))
}

export function useDeleteReminder(type: ReminderType, api?: ApiClient) {
  const repo = useRepo(api)
  return useDelete(remindersKey(type), (id) => repo.delete(type, id))
}

export function useRenewReminder<T extends ReminderType>(type: T, api?: ApiClient) {
  const repo = useRepo(api)
  return useWrite(type, ({ id, expectedExpiryDate }: { id: string; expectedExpiryDate: string }) =>
    repo.renew(type, id, expectedExpiryDate),
  )
}
