// Iconos SVG inline (trazo, sin relleno). Sustituyen a los emojis de la UI.
const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  clock: 'M12 7v5l3 2 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  watch: 'M9 3h6l1 3H8l1-3z M9 21h6l1-3H8l1 3z M12 9.5V12l1.5 1.5 M7 6h10v12H7z',
  edit: 'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4z M13.5 6.5l4 4',
  copy: 'M9 9h10v10H9z M5 15V5h10',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  send: 'M4 12l16-8-6 16-3-7-7-1z',
  plus: 'M12 5v14 M5 12h14',
  back: 'M15 5l-7 7 7 7',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  logout: 'M15 4h4v16h-4 M10 8l-4 4 4 4 M6 12h10',
  alert: 'M12 9v4 M12 17h.01 M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  play: 'M8 5v14l11-7z',
}

export default function Icon({ name, size = 16, color = 'currentColor', strokeWidth = 1.8, style }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block', ...style }}
    >
      {d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  )
}
