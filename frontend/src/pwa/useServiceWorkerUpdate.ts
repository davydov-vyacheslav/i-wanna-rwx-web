import { useSyncExternalStore } from 'react'
import { getUpdateReady, reloadForUpdate, subscribeUpdateReady } from './register'

export function useServiceWorkerUpdate() {
  const updateReady = useSyncExternalStore(subscribeUpdateReady, getUpdateReady)
  return { updateReady, reload: reloadForUpdate }
}
