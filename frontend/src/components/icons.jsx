const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function IconDashboard(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  )
}

export function IconTrendingUp(props) {
  return (
    <svg {...base} {...props}>
      <polyline points="3 17 9 11 13 15 21 6" />
      <polyline points="14 6 21 6 21 13" />
    </svg>
  )
}

export function IconBox(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" />
      <path d="M3 7.5V17l9 4.5 9-4.5V7.5" />
      <path d="M12 12v9.5" />
    </svg>
  )
}

export function IconLayers(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="M3 12l9 5 9-5" />
      <path d="M3 16l9 5 9-5" />
    </svg>
  )
}

export function IconPackageCheck(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" />
      <path d="M3 8.5V17l9 4.5 9-4.5V8.5" />
      <path d="M9.5 12.5 11.5 14.5 15 10.5" />
    </svg>
  )
}

export function IconPackageDown(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" />
      <path d="M3 8.5V17l9 4.5 9-4.5V8.5" />
      <path d="M12 9v7" />
      <path d="M9 13.5 12 16.5 15 13.5" />
    </svg>
  )
}

export function IconRoll(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 3v5.75" />
    </svg>
  )
}

export function IconClipboardList(props) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" />
      <path d="M8.5 11h7" />
      <path d="M8.5 14.5h7" />
      <path d="M8.5 18h4.5" />
    </svg>
  )
}

export function IconWrench(props) {
  return (
    <svg {...base} {...props}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 4.9L4 16.5V20h3.5l5.3-5.3a4 4 0 0 0 4.9-5.4l-2.9 2.9-2-2 2.9-2.9Z" />
    </svg>
  )
}

export function IconUsers(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 4.8a3.25 3.25 0 0 1 0 6.4" />
      <path d="M15 14.2c2.9.4 5 2.3 5.5 5.8" />
    </svg>
  )
}

export function IconCog(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.55 1.55M7.15 16.85l-1.55 1.55M18.4 18.4l-1.55-1.55M7.15 7.15 5.6 5.6" />
    </svg>
  )
}

export function IconFactory(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 21V11l5 3.2V11l5 3.2V11l6 3.8V21H3Z" />
      <path d="M7 21v-4M12 21v-4M17 21v-4" />
      <path d="M17 7V4h2v3l2 1.6V11" />
    </svg>
  )
}

export function IconSwap(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8h13" />
      <path d="M14 4l3 4-3 4" />
      <path d="M20 16H7" />
      <path d="M10 12l-3 4 3 4" />
    </svg>
  )
}

export function IconHome(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v10h12V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  )
}

export function IconLogout(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" />
      <path d="M14 16l4-4-4-4" />
      <path d="M18 12H9" />
    </svg>
  )
}

export function IconChevronsLeft(props) {
  return (
    <svg {...base} {...props}>
      <polyline points="13 5 7 12 13 19" />
      <polyline points="18 5 12 12 18 19" />
    </svg>
  )
}

export function IconSliders(props) {
  return (
    <svg {...base} {...props}>
      <line x1="4" y1="6" x2="13" y2="6" />
      <line x1="17" y1="6" x2="20" y2="6" />
      <circle cx="15" cy="6" r="2" />
      <line x1="4" y1="12" x2="5" y2="12" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <circle cx="7" cy="12" r="2" />
      <line x1="4" y1="18" x2="15" y2="18" />
      <line x1="19" y1="18" x2="20" y2="18" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  )
}
