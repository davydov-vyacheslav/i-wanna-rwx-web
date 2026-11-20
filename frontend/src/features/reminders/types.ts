import type { components } from '../../api/schema'

export type Subscription = components['schemas']['Subscription']
export type License = components['schemas']['License']

/** The fields the pure list logic reads; both Subscription and License satisfy it. */
export type ReminderItem = Pick<Subscription, 'id' | 'name' | 'expiryDate' | 'renewalPattern'>

export type ReminderType = 'subscriptions' | 'licenses'

/** A subscription or a license: only a license carries a key. */
export type Reminder = Subscription & Partial<Pick<License, 'licenseKey'>>
