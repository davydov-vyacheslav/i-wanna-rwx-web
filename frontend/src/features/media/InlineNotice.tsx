import type { ReactNode } from 'react'

/** Failure message inside a sheet (a toast would float above the tab bar, away from the sheet); `children` are its actions. */
export function InlineNotice({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div
      role="alert"
      className="bg-danger-bg text-danger text-body mt-2 flex flex-wrap items-center gap-x-3 rounded-md py-1 pl-4 font-medium"
    >
      <span className="min-w-40 flex-1 py-2 [overflow-wrap:anywhere]">{message}</span>
      {children}
    </div>
  )
}

/** Text action of an `InlineNotice`. */
export function NoticeAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 px-3 font-semibold underline">
      {label}
    </button>
  )
}
