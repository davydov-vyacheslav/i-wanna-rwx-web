import type { ReactNode } from 'react'

function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

const fill = (on: boolean) => (on ? 'currentColor' : 'none')

export const BookIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 21V5" />
  </Svg>
)
export const HeartIcon = ({ on }: { on: boolean }) => (
  <Svg size={24}>
    <path fill={fill(on)} d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.600-7 10-7 10z" />
  </Svg>
)
export const EyeIcon = ({ on }: { on: boolean }) => (
  <Svg size={24}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" fill={fill(on)} />
  </Svg>
)
export const StarIcon = () => (
  <Svg size={14}>
    <path
      fill="currentColor"
      d="m12 3 2.7 5.600 6.100.9-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100L3.200 9.500l6.100-.9z"
    />
  </Svg>
)
export const ClockIcon = () => (
  <Svg size={12}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
)
export const CheckIcon = ({ size = 12 }: { size?: number }) => (
  <Svg size={size}>
    <path d="m5 12 5 5 9-10" />
  </Svg>
)
export const TrashIcon = () => (
  <Svg size={22}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
)
export const ColumnSortIcon = ({ dir }: { dir?: 'asc' | 'desc' }) => (
  <Svg size={12}>
    <path d={dir === 'desc' ? 'm6 9 6 6 6-6' : dir === 'asc' ? 'm6 15 6-6 6 6' : 'm8 9 4-4 4 4M8 15l4 4 4-4'} />
  </Svg>
)
export const SearchIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </Svg>
)
export const PlusIcon = () => (
  <Svg size={28}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const MinusIcon = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M5 12h14" />
  </Svg>
)
export const FilmIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
  </Svg>
)
export const TvIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="m8 3 4 4 4-4" />
  </Svg>
)
export const FilterIcon = ({ on }: { on: boolean }) => (
  <Svg size={22}>
    <path fill={fill(on)} d="M4 5h16l-6 8v6l-4-2v-4z" />
  </Svg>
)
export const SortIcon = () => (
  <Svg size={22}>
    <path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" />
  </Svg>
)
export const GearIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.900 4.900 7 7M17 17l2.100 2.100M4.900 19.100 7 17M17 7l2.100-2.100" />
  </Svg>
)

export const InfoIcon = () => (
  <Svg size={22}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.500v.01" />
  </Svg>
)
export const MoreIcon = () => (
  <Svg size={22}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Svg>
)

export const XCircleIcon = () => (
  <Svg size={12}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </Svg>
)
export const ClockAlertIcon = () => (
  <Svg size={12}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5M12 15.500v.01" />
  </Svg>
)
export const InfinityIcon = () => (
  <Svg size={12}>
    <path d="M12 12c-2-3-3.500-4-5.500-4a4 4 0 0 0 0 8c2 0 3.500-1 5.500-4zm0 0c2 3 3.500 4 5.500 4a4 4 0 0 0 0-8c-2 0-3.500 1-5.500 4z" />
  </Svg>
)
export const CalendarIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
)
export const KeyIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9m-3 3 3 3" />
  </Svg>
)
export const BellIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />
  </Svg>
)
