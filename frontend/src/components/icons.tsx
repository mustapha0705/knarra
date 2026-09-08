import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/**
 * Line icons lifted from the design export. They all share a 24x24 box and
 * inherit their colour from `stroke`/`currentColor` at the call site, so the
 * two palettes in the app can reuse the same set.
 */
function Icon({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const PlusIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const MinusIcon = (p: IconProps) => (
  <Icon strokeWidth={1.8} {...p}>
    <path d="M5 12h14" />
  </Icon>
)

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </Icon>
)

export const CloseIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const CheckIcon = (p: IconProps) => (
  <Icon strokeWidth={2.1} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
)

export const SortIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h11" />
    <path d="M4 12h8" />
    <path d="M4 17h5" />
    <path d="M17 10v8" />
    <path d="m14.4 15.4 2.6 2.8 2.6-2.8" />
  </Icon>
)

export const GridIcon = (p: IconProps) => (
  <Icon strokeLinecap="butt" {...p}>
    <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" />
    <rect x="13" y="3.5" width="7.5" height="7.5" rx="2" />
    <rect x="3.5" y="13" width="7.5" height="7.5" rx="2" />
    <rect x="13" y="13" width="7.5" height="7.5" rx="2" />
  </Icon>
)

export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6h12" />
    <path d="M9 12h12" />
    <path d="M9 18h12" />
    <path d="M4 6h.01" />
    <path d="M4 12h.01" />
    <path d="M4 18h.01" />
  </Icon>
)

export const HelpIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.7" />
    <path d="M12 17.1h.01" />
  </Icon>
)

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.2 14.6a1.6 1.6 0 0 0 .32 1.77l.06.06a1.94 1.94 0 1 1-2.75 2.75l-.06-.06a1.6 1.6 0 0 0-2.72 1.14V21a1.94 1.94 0 1 1-3.88 0v-.09a1.6 1.6 0 0 0-2.72-1.14l-.06.06a1.94 1.94 0 1 1-2.75-2.75l.06-.06a1.6 1.6 0 0 0-1.14-2.72H3.2a1.94 1.94 0 1 1 0-3.88h.09a1.6 1.6 0 0 0 1.14-2.72l-.06-.06a1.94 1.94 0 1 1 2.75-2.75l.06.06a1.6 1.6 0 0 0 2.72-1.14V3.2a1.94 1.94 0 1 1 3.88 0v.09a1.6 1.6 0 0 0 2.72 1.14l.06-.06a1.94 1.94 0 1 1 2.75 2.75l-.06.06a1.6 1.6 0 0 0 1.14 2.72h.09a1.94 1.94 0 1 1 0 3.88h-.09a1.6 1.6 0 0 0-1.47.82Z" />
  </Icon>
)

export const PlayFrameIcon = (p: IconProps) => (
  <Icon strokeWidth={1.8} {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="m10.2 9.4 4.6 2.6-4.6 2.6Z" />
  </Icon>
)

export const DotsIcon = ({ size = 17, ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    <circle cx="5.5" cy="12" r="1.55" />
    <circle cx="12" cy="12" r="1.55" />
    <circle cx="18.5" cy="12" r="1.55" />
  </svg>
)

export const UndoIcon = (p: IconProps) => (
  <Icon strokeWidth={1.6} {...p}>
    <path d="M3 8h11a5.5 5.5 0 0 1 0 11H8" />
    <path d="m7 4-4 4 4 4" />
  </Icon>
)

export const RedoIcon = (p: IconProps) => (
  <Icon strokeWidth={1.6} {...p}>
    <path d="M21 8H10a5.5 5.5 0 0 0 0 11h6" />
    <path d="m17 4 4 4-4 4" />
  </Icon>
)

export const CanvasTabIcon = (p: IconProps) => (
  <Icon strokeWidth={1.6} strokeLinecap="butt" {...p}>
    <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.8" />
    <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.8" />
    <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.8" />
    <rect x="13" y="13" width="7.5" height="7.5" rx="1.8" />
  </Icon>
)

export const TimelineTabIcon = (p: IconProps) => (
  <Icon strokeWidth={1.6} {...p}>
    <path d="M3 6h11" />
    <path d="M3 12h18" />
    <path d="M3 18h7" />
  </Icon>
)

export const PlayIcon = ({ size = 15, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...rest}>
    <path d="M8 5.4v13.2a1 1 0 0 0 1.53.85l10.4-6.6a1 1 0 0 0 0-1.7L9.53 4.55A1 1 0 0 0 8 5.4Z" />
  </svg>
)

export const PauseIcon = ({ size = 15, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...rest}>
    <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
  </svg>
)

export const SendIcon = (p: IconProps) => (
  <Icon strokeWidth={1.8} {...p}>
    <path d="M4.5 12h14" />
    <path d="m12.5 6 6 6-6 6" />
  </Icon>
)

export const VolumeIcon = (p: IconProps) => (
  <Icon strokeWidth={1.6} {...p}>
    <path d="M11 5 6.5 9H3.5v6h3L11 19Z" />
    <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
  </Icon>
)

export const HomeIcon = (p: IconProps) => (
  <Icon strokeWidth={1.5} {...p}>
    <path d="M3.5 10.2 12 3.5l8.5 6.7V19a1.7 1.7 0 0 1-1.7 1.7H5.2A1.7 1.7 0 0 1 3.5 19Z" />
    <path d="M9.4 20.7v-6.4h5.2v6.4" />
  </Icon>
)

export const UploadFileIcon = (p: IconProps) => (
  <Icon strokeWidth={1.5} {...p}>
    <path d="M21 15.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3.5" />
    <path d="m17 8-5-5-5 5" />
    <path d="M12 3v12.5" />
  </Icon>
)

export const UploadFolderIcon = (p: IconProps) => (
  <Icon strokeWidth={1.5} {...p}>
    <path d="M20 12.4V19a1.8 1.8 0 0 1-1.8 1.8H5A1.8 1.8 0 0 1 3.2 19V6.3A1.8 1.8 0 0 1 5 4.5h3.9l2 2.4h7.3A1.8 1.8 0 0 1 20 8.7" />
    <path d="M17.6 15.6v-6.2" />
    <path d="m15.2 11.8 2.4-2.4 2.4 2.4" />
  </Icon>
)

export const MarkdownIcon = (p: IconProps) => (
  <Icon strokeWidth={1.5} {...p}>
    <path d="M20 4.8v9.4L14.2 20H5a1.8 1.8 0 0 1-1.8-1.8V4.8A1.8 1.8 0 0 1 5 3h13.2A1.8 1.8 0 0 1 20 4.8Z" />
    <path d="M13.9 20v-4.3a1.5 1.5 0 0 1 1.5-1.5H20" />
  </Icon>
)

export const LinkIcon = (p: IconProps) => (
  <Icon strokeWidth={1.5} {...p}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Icon>
)

export const SandboxIcon = (p: IconProps) => (
  <Icon strokeWidth={1.5} {...p}>
    <path d="m9 8-4 4 4 4" />
    <path d="m15 8 4 4-4 4" />
  </Icon>
)

export const DocumentIcon = (p: IconProps) => (
  <Icon strokeWidth={1.4} strokeLinecap="butt" {...p}>
    <path d="M5 3.8A1.8 1.8 0 0 1 6.8 2h6.4L19 7.8V20.2A1.8 1.8 0 0 1 17.2 22H6.8A1.8 1.8 0 0 1 5 20.2Z" />
    <path d="M13 2v6h6" />
  </Icon>
)
