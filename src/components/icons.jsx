import { useState } from 'react'
import { Popover } from './Popover.jsx'

const F = { fill: 'currentColor', stroke: 'none' }

function pixels(rows, unit) {
  const w = rows[0].length * unit
  const h = rows.length * unit
  const ox = (16 - w) / 2
  const oy = (16 - h) / 2
  let d = ''
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === 'X') d += `M${ox + x * unit} ${oy + y * unit}h${unit}v${unit}h${-unit}z`
  }))
  return d
}

const INVADER = pixels(['..X.....X..', '...X...X...', '..XXXXXXX..', '.XX.XXX.XX.', 'XXXXXXXXXXX', 'X.XXXXXXX.X', 'X.X.....X.X', '...XX.XX...'], 1.3)
const GHOST = pixels(['..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', 'XXXXXXXX', 'X.XX.XX.'], 1.6)

const ICONS = {
  calendar: <><rect x="2" y="3" width="12" height="11" rx="2" /><path {...F} d="M4 3h8a2 2 0 0 1 2 2v1.5H2V5a2 2 0 0 1 2-2Z" /><path d="M5 1.5v2.5M11 1.5v2.5" /></>,
  'calendar-check': <><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5 1.5v2.5M11 1.5v2.5M5.6 10l1.6 1.6 3.2-3.4" /></>,
  text: <path d="M2.5 4h11M2.5 7h11M2.5 10h11M2.5 13h6.5" />,
  'align-left': <path d="M2.5 3.5h11M2.5 6.5h7M2.5 9.5h11M2.5 12.5h7" />,
  stack: <><rect {...F} x="2" y="2.5" width="6.5" height="2.6" rx=".8" /><rect {...F} x="2" y="6.7" width="12" height="2.6" rx=".8" /><rect {...F} x="2" y="10.9" width="9" height="2.6" rx=".8" /></>,
  hash: <path d="M6 2.5 4.8 13.5M11.2 2.5 10 13.5M2.8 5.8h11M2.2 10.2h11" />,
  'select-circle': <><circle cx="8" cy="8" r="5.8" /><path d="M5.6 7.1 8 9.4l2.4-2.3" /></>,
  list: <><path d="M6 4.2h8M6 8h8M6 11.8h8" /><circle {...F} cx="2.8" cy="4.2" r="1.1" /><circle {...F} cx="2.8" cy="8" r="1.1" /><circle {...F} cx="2.8" cy="11.8" r="1.1" /></>,
  checkbox: <><rect x="2.3" y="2.3" width="11.4" height="11.4" rx="2.6" /><path d="m5.3 8.2 1.9 1.9 3.6-4.2" /></>,
  'check-circle': <><circle cx="8" cy="8" r="6.2" /><path d="m5.2 8.2 1.9 1.9 3.7-4.1" /></>,
  'clipboard-check': <><path d="M5.5 2.8h-1A1.5 1.5 0 0 0 3 4.3v9.2A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5V4.3a1.5 1.5 0 0 0-1.5-1.5h-1" /><rect x="5.5" y="1.5" width="5" height="2.6" rx=".8" /><path d="m5.5 9.3 1.8 1.8 3.2-3.6" /></>,
  clock: <><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.4 1.5" /></>,
  stopwatch: <><circle cx="8" cy="9" r="5.2" /><path d="M8 6.4V9l1.7 1M6.3 1.8h3.4M8 1.8v2" /></>,
  hourglass: <path d="M3.5 1.5h9M3.5 14.5h9M4.5 1.5c0 3.5 3.5 4.5 3.5 6.5s-3.5 3-3.5 6.5M11.5 1.5c0 3.5-3.5 4.5-3.5 6.5s3.5 3 3.5 6.5" />,
  sigma: <path d="M12 3.2H4.2L8.4 8l-4.2 4.8H12" />,
  sliders: <><path d="M2 4h12M2 8h12M2 12h12" /><circle {...F} cx="10.5" cy="4" r="1.9" /><circle {...F} cx="5" cy="8" r="1.9" /><circle {...F} cx="9" cy="12" r="1.9" /></>,
  star: <path d="M8 1.8 9.9 5.7l4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6Z" />,
  sparkle: <path d="M7 1.5c.6 3.2 1.8 4.4 5 5-3.2.6-4.4 1.8-5 5-.6-3.2-1.8-4.4-5-5 3.2-.6 4.4-1.8 5-5ZM13 10.5v4M11 12.5h4" />,
  heart: <path d="M8 14s-5.6-3.4-5.6-7.3A3.1 3.1 0 0 1 8 4.7a3.1 3.1 0 0 1 5.6 2C13.6 10.6 8 14 8 14Z" />,
  bolt: <path {...F} d="M9.6 1 3 9.2h4.2L6.3 15l6.7-8.3H8.8Z" />,
  fire: <path d="M8 15c2.8 0 4.6-1.9 4.6-4.5 0-2.9-2.6-4.3-3.3-7.6-1.6 1-2.4 2.6-2.3 4.3-.9-.5-1.5-1.4-1.6-2.4-1.3 1.3-2 3-2 5.7C3.4 13.1 5.2 15 8 15Z" />,
  drop: <path d="M8 2.2c2.4 3.1 4 5.2 4 7.5a4 4 0 0 1-8 0c0-2.3 1.6-4.4 4-7.5Z" />,
  leaf: <path d="M3 13.5C3 7.3 7 3 14 3c0 7-4.3 11-10.5 11M3 13.5l6.5-6.5" />,
  sun: <><circle cx="8" cy="8" r="3" /><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3" /></>,
  moon: <path d="M13.6 9.9A5.9 5.9 0 0 1 6.1 2.4a5.9 5.9 0 1 0 7.5 7.5Z" />,
  bed: <><path d="M1.5 2.5v11M1.5 10.5h13v3M1.5 8h11a2 2 0 0 1 2 2v.5" /><rect {...F} x="2.8" y="5.2" width="3.8" height="2.4" rx="1" /></>,
  coffee: <path d="M2.5 6h9v4a3.5 3.5 0 0 1-3.5 3.5H6A3.5 3.5 0 0 1 2.5 10ZM11.5 7h1a2 2 0 0 1 0 4h-1M5 1.5v2M8 1.5v2" />,
  dumbbell: <><rect {...F} x=".8" y="5.6" width="1.6" height="4.8" rx=".5" /><rect {...F} x="2.8" y="3.6" width="2.4" height="8.8" rx=".7" /><rect {...F} x="5" y="7" width="6" height="2" /><rect {...F} x="10.8" y="3.6" width="2.4" height="8.8" rx=".7" /><rect {...F} x="13.6" y="5.6" width="1.6" height="4.8" rx=".5" /></>,
  activity: <path d="M1.5 8.5h3l2-5 3 9 2-4h3" />,
  stethoscope: <><path d="M3.5 2v4a3 3 0 0 0 6 0V2M6.5 9v1.5a3.5 3.5 0 0 0 7 0V9" /><circle cx="13.5" cy="7.5" r="1.5" /></>,
  pill: <path d="M6.2 13.8a3.2 3.2 0 0 1-4.5-4.5l7.6-7.6a3.2 3.2 0 0 1 4.5 4.5ZM5.5 5.5l5 5" />,
  book: <path d="M3 13V3a1.5 1.5 0 0 1 1.5-1.5H13v11H4.5A1.5 1.5 0 0 0 3 14a1.5 1.5 0 0 0 1.5 1.5H13" />,
  'book-open': <path d="M8 4C6.5 2.8 4.5 2.5 1.5 2.8v10c3-.3 5 0 6.5 1.2 1.5-1.2 3.5-1.5 6.5-1.2v-10c-3-.3-5 0-6.5 1.2ZM8 4v10" />,
  copy: <><rect {...F} x="5" y="1.5" width="9" height="10.5" rx="1.6" /><path d="M3.5 4.5v8.5A1.5 1.5 0 0 0 5 14.5h7" /></>,
  bookmark: <path d="M4 1.5h8v13l-4-3-4 3Z" />,
  pen: <path d="M11 2.5 13.5 5l-8 8-3 1 1-3ZM9.5 4 12 6.5" />,
  'pen-line': <path d="M10.5 2.5 13 5l-7 7-3 .8.8-3ZM2.5 15h11" />,
  search: <><circle cx="7" cy="7" r="4.6" /><path d="m10.4 10.4 3.6 3.6" /></>,
  'eye-off': <path d="M2 2l12 12M6.6 3.7A6.6 6.6 0 0 1 8 3.5c4 0 6.5 4.5 6.5 4.5a12 12 0 0 1-1.9 2.4M10.1 10.1A2 2 0 0 1 5.9 5.9M4.2 4.9A11.6 11.6 0 0 0 1.5 8S4 12.5 8 12.5a6.4 6.4 0 0 0 3-.8" />,
  eye: <><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" /><circle cx="8" cy="8" r="2" /></>,
  bulb: <path d="M6 12.5h4M6.5 14.5h3M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.8.6 1.3v.5h4V11c0-.5.2-1 .6-1.3A4.5 4.5 0 0 0 8 1.5Z" />,
  target: <><circle cx="8" cy="8" r="6.2" /><circle cx="8" cy="8" r="3.4" /><circle {...F} cx="8" cy="8" r="1.2" /></>,
  flag: <path d="M3 15V2M3 2.5h9.5l-2 3 2 3H3" />,
  trophy: <path d="M4.5 2h7v4a3.5 3.5 0 0 1-7 0ZM4.5 3.5H2v1a2.5 2.5 0 0 0 2.6 2.5M11.5 3.5H14v1a2.5 2.5 0 0 1-2.6 2.5M8 9.5v2.5M5 14.5h6M6 12h4v2.5H6Z" />,
  waves: <path d="M1.5 4.5c1.1-1.3 2.1-1.3 3.2 0s2.1 1.3 3.3 0 2.1-1.3 3.2 0 2.1 1.3 3.3 0M1.5 8.5c1.1-1.3 2.1-1.3 3.2 0s2.1 1.3 3.3 0 2.1-1.3 3.2 0 2.1 1.3 3.3 0M1.5 12.5c1.1-1.3 2.1-1.3 3.2 0s2.1 1.3 3.3 0 2.1-1.3 3.2 0 2.1 1.3 3.3 0" />,
  shuffle: <path d="M1.5 4.5H4c3.5 0 4.5 7 8 7h2.5M1.5 11.5H4c1.4 0 2.4-1.1 3.2-2.4M9.3 6.9c.8-1.3 1.8-2.4 3.2-2.4h2M12.5 2.5l2 2-2 2M12.5 9.5l2 2-2 2" />,
  refresh: <path d="M13.5 6A5.8 5.8 0 0 0 3 4.5M2.5 10A5.8 5.8 0 0 0 13 11.5M13.5 2v4h-4M2.5 14v-4h4" />,
  command: <path d="M5.5 5.5h5v5h-5ZM5.5 5.5V4A1.5 1.5 0 1 0 4 5.5h1.5M10.5 5.5H12A1.5 1.5 0 1 0 10.5 4v1.5M10.5 10.5V12a1.5 1.5 0 1 0 1.5-1.5h-1.5M5.5 10.5H4A1.5 1.5 0 1 0 5.5 12v-1.5" />,
  code: <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5M9 3 7 13" />,
  terminal: <><rect x="1.5" y="2.5" width="13" height="11" rx="2" /><path d="m4.5 6 2 2-2 2M8 10.5h3.5" /></>,
  robot: <><rect x="3" y="5" width="10" height="8" rx="2" /><path d="M8 2.6V5M1.5 8.5v2M14.5 8.5v2" /><circle {...F} cx="8" cy="2" r=".9" /><circle {...F} cx="6" cy="8.6" r="1" /><circle {...F} cx="10" cy="8.6" r="1" /></>,
  invader: <path {...F} d={INVADER} />,
  ghost: <path {...F} d={GHOST} />,
  envelope: <><rect x="1.5" y="3.3" width="13" height="9.4" rx="1.8" /><path d="m2.3 4.4 5.7 4.3 5.7-4.3" /></>,
  chat: <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H7l-3.5 3v-3A1.5 1.5 0 0 1 2 9.5Z" />,
  bell: <path d="M4 11.5V7a4 4 0 0 1 8 0v4.5l1.5 1.5h-11ZM6.5 14.5h3" />,
  send: <path d="M14.5 1.5 7 9M14.5 1.5 10 14.5 7 9 1.5 6Z" />,
  link: <path d="M6.8 9.2a2.8 2.8 0 0 0 4 0l2.4-2.4a2.8 2.8 0 0 0-4-4l-.9.9M9.2 6.8a2.8 2.8 0 0 0-4 0L2.8 9.2a2.8 2.8 0 0 0 4 4l.9-.9" />,
  user: <><circle cx="8" cy="5" r="3" /><path d="M2.5 14.5C3.1 11.5 5.3 10 8 10s4.9 1.5 5.5 4.5" /></>,
  users: <><circle cx="6" cy="5.5" r="2.5" /><path d="M1.5 14c.4-2.5 2.2-3.8 4.5-3.8s4.1 1.3 4.5 3.8" /><circle cx="11.5" cy="5" r="2" /><path d="M11 10.2c1.9 0 3.2 1 3.5 3" /></>,
  smile: <><circle cx="8" cy="8" r="6.3" /><path d="M5.5 9.5c.6.9 1.5 1.4 2.5 1.4s1.9-.5 2.5-1.4" /><circle {...F} cx="6" cy="6.3" r=".9" /><circle {...F} cx="10" cy="6.3" r=".9" /></>,
  home: <path d="M2 7.5 8 2.5l6 5M3.5 6.5v7.5H7V10h2v4h3.5V6.5" />,
  cart: <><path d="M1.5 2h2l1.6 8.5h7.6l1.5-6H4.2" /><circle {...F} cx="6" cy="13.5" r="1.1" /><circle {...F} cx="12" cy="13.5" r="1.1" /></>,
  wallet: <><rect x="1.5" y="3.5" width="13" height="10" rx="2" /><path d="M10.5 7.5h4v3h-4a1.5 1.5 0 0 1 0-3Z" /></>,
  tag: <><path d="M1.5 2.5v5l7 7 6-6-7-7h-5Z" /><circle {...F} cx="5" cy="5.5" r="1" /></>,
  pin: <><path d="M8 15s4.5-4.4 4.5-8A4.5 4.5 0 0 0 3.5 7c0 3.6 4.5 8 4.5 8Z" /><circle cx="8" cy="7" r="1.6" /></>,
  globe: <><circle cx="8" cy="8" r="6.3" /><path d="M1.7 8h12.6M8 1.7c1.8 1.8 2.6 4 2.6 6.3S9.8 12.5 8 14.3C6.2 12.5 5.4 10.3 5.4 8S6.2 3.5 8 1.7Z" /></>,
  camera: <><path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h1.8l1.2-1.8h3L10.7 4h1.8A1.5 1.5 0 0 1 14 5.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5Z" /><circle cx="8" cy="8.5" r="2.5" /></>,
  music: <><path d="M6 12.5V3l7.5-1.5V11" /><circle {...F} cx="4.3" cy="12.5" r="1.9" /><circle {...F} cx="11.8" cy="11" r="1.9" /></>,
  chart: <><path d="M2 14.2h12" /><rect {...F} x="3" y="8" width="2.4" height="5" rx=".5" /><rect {...F} x="6.8" y="3.5" width="2.4" height="9.5" rx=".5" /><rect {...F} x="10.6" y="6" width="2.4" height="7" rx=".5" /></>,
  pie: <><path d="M7 3a5.5 5.5 0 1 0 6 6H7Z" /><path {...F} d="M9 1.5a5.5 5.5 0 0 1 5.5 5.5H9Z" /></>,
  progress: <><rect x="1.5" y="5.2" width="13" height="5.6" rx="2.8" /><rect {...F} x="3" y="6.8" width="6" height="2.4" rx="1.2" /></>,
  layers: <path d="M8 1.5 14.5 5 8 8.5 1.5 5ZM1.5 8 8 11.5 14.5 8M1.5 11 8 14.5 14.5 11" />,
  folder: <path d="M1.5 4A1.5 1.5 0 0 1 3 2.5h3L7.5 4H13a1.5 1.5 0 0 1 1.5 1.5V12a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 12Z" />,
  undo: <path d="M5.5 3.5 2.5 6.5l3 3M2.5 6.5h7.2a3.8 3.8 0 0 1 0 7.6H7.5" />,
  chevron: <path strokeWidth="1.6" d="M6 3.5 10.5 8 6 12.5" />,
  grip: <><circle {...F} cx="6" cy="3.6" r="1.25" /><circle {...F} cx="10" cy="3.6" r="1.25" /><circle {...F} cx="6" cy="8" r="1.25" /><circle {...F} cx="10" cy="8" r="1.25" /><circle {...F} cx="6" cy="12.4" r="1.25" /><circle {...F} cx="10" cy="12.4" r="1.25" /></>,
  page: <><path d="M4 1.8h5.2L12.5 5v8.7a.8.8 0 0 1-.8.8H4.3a.8.8 0 0 1-.8-.8V2.6a.8.8 0 0 1 .5-.8Z" /><path d="M9 1.8V5.2h3.4M5.8 8.2h4.4M5.8 10.8h4.4" /></>,
  laptop: <><rect x="3" y="3" width="10" height="7" rx="1.2" /><path d="M1.5 12.5h13l-1 1.2h-11Z" /></>,
  monitor: <><rect x="1.8" y="2.5" width="12.4" height="8.5" rx="1.4" /><path d="M8 11v2.5M5 13.8h6" /></>,
  phone: <><rect x="4.5" y="1.5" width="7" height="13" rx="1.8" /><path d="M7.2 12.3h1.6" /></>,
  tablet: <><rect x="2.8" y="1.5" width="10.4" height="13" rx="1.6" /><path d="M7.2 12.3h1.6" /></>,
  keyboard: <><rect x="1.5" y="4" width="13" height="8" rx="1.5" /><path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M4 9.2h.01M11.5 9.2h.01M6 9.5h4" /></>,
  mouse: <><rect x="4.5" y="1.5" width="7" height="13" rx="3.5" /><path d="M8 4v2.5" /></>,
  server: <><rect x="2" y="2" width="12" height="5" rx="1.2" /><rect x="2" y="9" width="12" height="5" rx="1.2" /><path d="M4.5 4.5h.01M4.5 11.5h.01M8 4.5h3.5M8 11.5h3.5" /></>,
  database: <><ellipse cx="8" cy="3.5" rx="5.5" ry="2" /><path d="M2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" /></>,
  cloud: <path d="M4.5 12.5a3 3 0 0 1-.4-6 4.2 4.2 0 0 1 8.1-.9 3.2 3.2 0 0 1 .3 6.9Z" />,
  wifi: <><path d="M1.5 6a9.3 9.3 0 0 1 13 0M3.8 8.6a6 6 0 0 1 8.4 0M6.1 11.1a2.8 2.8 0 0 1 3.8 0" /><circle {...F} cx="8" cy="13.4" r="1" /></>,
  'git-branch': <><circle cx="4.5" cy="3.5" r="1.6" /><circle cx="4.5" cy="12.5" r="1.6" /><circle cx="11.5" cy="5" r="1.6" /><path d="M4.5 5.1v5.8M11.5 6.6c0 3-4.5 2.6-6.6 4.7" /></>,
  'git-commit': <><circle cx="8" cy="8" r="2.6" /><path d="M1.5 8h3.9M10.6 8h3.9" /></>,
  bug: <><rect x="4.5" y="5" width="7" height="9" rx="3.5" /><path d="M6 5.2a2 2 0 0 1 4 0M8 8v6M4.5 8.5H2M14 8.5h-2.5M4.6 11.5 2.5 13M11.4 11.5l2.1 1.5M4.8 6 3 4.2M11.2 6 13 4.2" /></>,
  cpu: <><rect x="4" y="4" width="8" height="8" rx="1.2" /><rect x="6.3" y="6.3" width="3.4" height="3.4" /><path d="M6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5" /></>,
  'hard-drive': <><rect x="1.5" y="8.5" width="13" height="5" rx="1.3" /><path d="M1.5 9.5 4 3h8l2.5 6.5M4.5 11h.01M7 11h.01" /></>,
  plug: <path d="M5.5 1.5v3.5M10.5 1.5v3.5M3.5 5h9v2.5a4.5 4.5 0 0 1-9 0ZM8 12v2.5" />,
  battery: <><rect x="1.5" y="5" width="11.5" height="6" rx="1.4" /><path d="M14.5 7v2" /><rect {...F} x="3" y="6.5" width="5.5" height="3" rx=".5" /></>,
  braces: <path d="M5.5 2.5c-1.5 0-2 .7-2 2v1.6c0 .9-.6 1.5-1.5 1.9.9.4 1.5 1 1.5 1.9v1.6c0 1.3.5 2 2 2M10.5 2.5c1.5 0 2 .7 2 2v1.6c0 .9.6 1.5 1.5 1.9-.9.4-1.5 1-1.5 1.9v1.6c0 1.3-.5 2-2 2" />,
  window: <><rect x="1.5" y="2.5" width="13" height="11" rx="1.6" /><path d="M1.5 5.5h13" /><circle {...F} cx="3.6" cy="4" r=".6" /><circle {...F} cx="5.4" cy="4" r=".6" /></>,
  cursor: <path d="M3 2.5 13 7l-4.2 1.4L7.2 13Z" />,
  download: <path d="M8 2v8.5M4.5 7 8 10.5 11.5 7M2.5 13.5h11" />,
  upload: <path d="M8 10.5V2M4.5 5.5 8 2l3.5 3.5M2.5 13.5h11" />,
  package: <path d="M8 1.5 14 4.7v6.6L8 14.5l-6-3.2V4.7ZM2 4.7 8 8l6-3.3M8 8v6.5M5 3.1l6 3.3" />,
  key: <><circle cx="5" cy="11" r="3" /><path d="M7.2 8.8 13.5 2.5M11 5l2 2M12.5 3.5l1.5 1.5" /></>,
  lock: <><rect x="3" y="7" width="10" height="7.5" rx="1.6" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></>,
  shield: <path d="M8 1.5 13.5 3.5v4c0 3.4-2.3 5.9-5.5 7-3.2-1.1-5.5-3.6-5.5-7v-4Z" />,
  qr: <><rect x="2" y="2" width="4.5" height="4.5" rx=".6" /><rect x="9.5" y="2" width="4.5" height="4.5" rx=".6" /><rect x="2" y="9.5" width="4.5" height="4.5" rx=".6" /><path d="M9.5 9.5h1.5v1.5M14 9.5V12M9.5 14h4.5M12 12h.01" /></>,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  duplicate: <><rect x="5" y="5" width="9" height="9" rx="2" /><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" /></>,
  play: <path d="M5 3.2v9.6L12.8 8Z" />,
  pause: <path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth="2.2" />,
  stop: <rect x="3.5" y="3.5" width="9" height="9" rx="1.8" />,
  'arrows-h': <path d="M1.8 8h12.4M4.5 5.3 1.8 8l2.7 2.7M11.5 5.3 14.2 8l-2.7 2.7" />,
  'insert-left': <path d="M2.5 2.5v11M13.5 8H6M8.8 5.2 6 8l2.8 2.8" />,
  'insert-right': <path d="M13.5 2.5v11M2.5 8H10M7.2 5.2 10 8l-2.8 2.8" />,
  'arrow-up': <path d="M8 13.5v-11M4.5 6 8 2.5 11.5 6" />,
  'arrow-down': <path d="M8 2.5v11M4.5 10 8 13.5 11.5 10" />,
  'arrow-right': <path d="M2.5 8h11M10 4.5 13.5 8 10 11.5" />,
  'arrow-out': <path d="M9.5 2.5h4v4M13.5 2.5 7 9M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />,
  plus: <path d="M8 3v10M3 8h10" />,
  grid: <><rect x="2" y="2" width="12" height="12" rx="2" /><path d="M2 8h12M8 2v12" /></>,
  gear: <><circle cx="8" cy="8" r="4.5" /><circle cx="8" cy="8" r="1.8" /><path strokeWidth="2.1" strokeLinecap="butt" d="M13.00 8.00L14.70 8.00M11.54 11.54L12.74 12.74M8.00 13.00L8.00 14.70M4.46 11.54L3.26 12.74M3.00 8.00L1.30 8.00M4.46 4.46L3.26 3.26M8.00 3.00L8.00 1.30M11.54 4.46L12.74 3.26" /></>,
  inbox: <path d="M1.5 9.5 3.5 3h9l2 6.5v4h-13ZM1.5 9.5h4l1 1.5h3l1-1.5h4" />,
}

const ICON_NAMES = Object.keys(ICONS)

const TYPE_ICON = {
  date: 'calendar', text: 'text', number: 'hash', select: 'select-circle', multi: 'list',
  checkbox: 'checkbox', todo: 'checkbox', mixed: 'list', time: 'clock', weekday: 'sigma', week: 'sigma', cycle: 'drop', tracked: 'stopwatch',
}

export function Icon({ name, size = 16, weight = 1.35 }) {
  return (
    <svg className="field-icon" viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name] || ICONS.text}
    </svg>
  )
}

export function BrandMark({ size = 22 }) {
  return (
    <svg className="brand-mark" viewBox="0 0 1024 1024" width={size} height={size} aria-hidden="true">
      <rect width="1024" height="1024" rx="224" fill="#0c0c0c" />
      <rect x="40" y="40" width="944" height="944" rx="190" fill="none" stroke="#3a3a3a" strokeWidth="24" />
      <rect x="236" y="300" width="552" height="56" rx="28" fill="#f2f0f0" />
      <rect x="236" y="420" width="380" height="56" rx="28" fill="#aaaaaa" />
      <rect x="236" y="540" width="460" height="56" rx="28" fill="#777777" />
      <rect x="236" y="660" width="260" height="56" rx="28" fill="#4d4d4d" />
      <circle cx="740" cy="688" r="48" fill="#f2f0f0" />
    </svg>
  )
}

export function FieldIcon({ type, icon }) {
  return <Icon name={ICONS[icon] ? icon : TYPE_ICON[type] || 'text'} />
}

export function IconPicker({ anchor, value, onPick, onClose }) {
  const [q, setQ] = useState('')
  const list = ICON_NAMES.filter((n) => n.includes(q.trim().toLowerCase()))
  return (
    <Popover anchor={anchor} onClose={onClose} width={300}>
      <div className="icon-picker">
        <div className="icon-picker-top">
          <input autoFocus className="line-editor slim" placeholder="Search icons" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn ghost" onClick={() => { onPick(null); onClose() }}>Reset</button>
        </div>
        <div className="icon-grid">
          {list.map((n) => (
            <button key={n} className={`icon-cell ${value === n ? 'on' : ''}`} title={n} onClick={() => { onPick(n); onClose() }}>
              <Icon name={n} size={18} />
            </button>
          ))}
          {!list.length && <div className="empty-note">No icons</div>}
        </div>
      </div>
    </Popover>
  )
}
