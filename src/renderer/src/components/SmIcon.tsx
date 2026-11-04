// ícones do tema (Lucide), um por nome. Gerado a partir das telas novas.
const PATHS = {
  "play": "<polygon points=\"6 3 20 12 6 21 6 3\"/>",
  "pause": "<rect x=\"14\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\"/><rect x=\"6\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\"/>",
  "prev": "<polygon points=\"19 20 9 12 19 4 19 20\"/><line x1=\"5\" x2=\"5\" y1=\"19\" y2=\"5\"/>",
  "next": "<polygon points=\"5 4 15 12 5 20 5 4\"/><line x1=\"19\" x2=\"19\" y1=\"5\" y2=\"19\"/>",
  "repeat": "<path d=\"m17 2 4 4-4 4\"/><path d=\"M3 11v-1a4 4 0 0 1 4-4h14\"/><path d=\"m7 22-4-4 4-4\"/><path d=\"M21 13v1a4 4 0 0 1-4 4H3\"/>",
  "search": "<circle cx=\"11\" cy=\"11\" r=\"8\"/><path d=\"m21 21-4.3-4.3\"/>",
  "plus": "<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>",
  "minus": "<path d=\"M5 12h14\"/>",
  "x": "<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>",
  "back": "<path d=\"m12 19-7-7 7-7\"/><path d=\"M19 12H5\"/>",
  "cl": "<path d=\"m15 18-6-6 6-6\"/>",
  "cr": "<path d=\"m9 18 6-6-6-6\"/>",
  "cu": "<path d=\"m18 15-6-6-6 6\"/>",
  "cd": "<path d=\"m6 9 6 6 6-6\"/>",
  "gear": "<path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
  "list": "<path d=\"M21 15V6\"/><path d=\"M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z\"/><path d=\"M12 12H3\"/><path d=\"M16 6H3\"/><path d=\"M12 18H3\"/>",
  "midi": "<rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"3\"/><path d=\"M8 4v9\"/><path d=\"M12 4v9\"/><path d=\"M16 4v9\"/><path d=\"M2 13h20\"/>",
  "phone": "<rect x=\"5\" y=\"2\" width=\"14\" height=\"20\" rx=\"3\"/><path d=\"M12 18h.01\"/>",
  "pad": "<path d=\"M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2\"/>",
  "trash": "<path d=\"M3 6h18\"/><path d=\"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6\"/><path d=\"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2\"/>",
  "filter": "<polygon points=\"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3\"/>",
  "sort": "<path d=\"m21 16-4 4-4-4\"/><path d=\"M17 20V4\"/><path d=\"m3 8 4-4 4 4\"/><path d=\"M7 4v16\"/>",
  "more": "<circle cx=\"12\" cy=\"5\" r=\"1\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"12\" cy=\"19\" r=\"1\"/>",
  "folder": "<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\"/>",
  "check": "<path d=\"M20 6 9 17l-5-5\"/>",
  "loader": "<path d=\"M21 12a9 9 0 1 1-6.219-8.56\"/>",
  "alert": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\"/><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\"/>",
  "download": "<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/><path d=\"M12 15V3\"/>",
  "upload": "<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m17 8-5-5-5 5\"/><path d=\"M12 3v12\"/>",
  "vol": "<polygon points=\"11 5 6 9 2 9 2 15 6 15 11 19 11 5\"/><path d=\"M15.54 8.46a5 5 0 0 1 0 7.07\"/><path d=\"M19.07 4.93a10 10 0 0 1 0 14.14\"/>",
  "note": "<path d=\"M9 18V5l12-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"18\" cy=\"16\" r=\"3\"/>",
  "metro": "<path d=\"M8 21h8l-3-17h-2z\"/><path d=\"m12 15 6-8\"/><path d=\"M7 17h10\"/>",
  "ext": "<path d=\"M15 3h6v6\"/><path d=\"M10 14 21 3\"/><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/>",
  "eq": "<line x1=\"4\" x2=\"4\" y1=\"21\" y2=\"14\"/><line x1=\"4\" x2=\"4\" y1=\"10\" y2=\"3\"/><line x1=\"12\" x2=\"12\" y1=\"21\" y2=\"12\"/><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"3\"/><line x1=\"20\" x2=\"20\" y1=\"21\" y2=\"16\"/><line x1=\"20\" x2=\"20\" y1=\"12\" y2=\"3\"/><line x1=\"2\" x2=\"6\" y1=\"14\" y2=\"14\"/><line x1=\"10\" x2=\"14\" y1=\"8\" y2=\"8\"/><line x1=\"18\" x2=\"22\" y1=\"16\" y2=\"16\"/>",
  "type": "<path d=\"M4 7V4h16v3\"/><path d=\"M9 20h6\"/><path d=\"M12 4v16\"/>",
  "hash": "<path d=\"M4 9h16\"/><path d=\"M4 15h16\"/><path d=\"M10 3 8 21\"/><path d=\"m16 3-2 18\"/>",
  "cols": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"3\"/><path d=\"M9 3v18\"/><path d=\"M15 3v18\"/>",
  "ab": "<path d=\"M3 12h18\"/><path d=\"M6 8v8\"/><path d=\"M18 8v8\"/>",
  "undo": "<path d=\"M3 7v6h6\"/><path d=\"M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13\"/>",
  "redo": "<path d=\"M21 7v6h-6\"/><path d=\"M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7\"/>",
  "refresh": "<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\"/><path d=\"M8 16H3v5\"/>",
  "split": "<path d=\"M16 3h5v5\"/><path d=\"M8 3H3v5\"/><path d=\"M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3\"/><path d=\"m15 9 6-6\"/>",
  "link": "<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"/><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"/>",
  "grip": "<circle cx=\"9\" cy=\"6\" r=\"1\"/><circle cx=\"9\" cy=\"12\" r=\"1\"/><circle cx=\"9\" cy=\"18\" r=\"1\"/><circle cx=\"15\" cy=\"6\" r=\"1\"/><circle cx=\"15\" cy=\"12\" r=\"1\"/><circle cx=\"15\" cy=\"18\" r=\"1\"/>",
  "copy": "<rect x=\"8\" y=\"8\" width=\"14\" height=\"14\" rx=\"3\"/><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/>",
  "wifi": "<path d=\"M12 20h.01\"/><path d=\"M2 8.82a15 15 0 0 1 20 0\"/><path d=\"M5 12.86a10 10 0 0 1 14 0\"/><path d=\"M8.5 16.43a5 5 0 0 1 7 0\"/>",
  "wifioff": "<path d=\"M12 20h.01\"/><path d=\"M8.5 16.43a5 5 0 0 1 7 0\"/><path d=\"m2 2 20 20\"/>",
  "lock": "<rect x=\"3\" y=\"11\" width=\"18\" height=\"11\" rx=\"3\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>",
  "help": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\"/><path d=\"M12 17h.01\"/>",
  "disc": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/>",
  "mic": "<path d=\"M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z\"/><path d=\"M19 10v2a7 7 0 0 1-14 0v-2\"/><line x1=\"12\" x2=\"12\" y1=\"19\" y2=\"22\"/>",
  "drum": "<path d=\"m2 2 8 8\"/><path d=\"m22 2-8 8\"/><ellipse cx=\"12\" cy=\"9\" rx=\"10\" ry=\"5\"/><path d=\"M7 13.4v7.9\"/><path d=\"M12 14v8\"/><path d=\"M17 13.4v7.9\"/><path d=\"M2 9v8a10 5 0 0 0 20 0V9\"/>",
  "guitar": "<path d=\"m20 7 1.7-1.7a1 1 0 0 0 0-1.4l-1.6-1.6a1 1 0 0 0-1.4 0L17 4v3Z\"/><path d=\"m17 7-5.1 5.1\"/><circle cx=\"11.5\" cy=\"12.5\" r=\".5\"/><path d=\"M6 12a2 2 0 0 0 1.8-1.2l.4-.9C8.7 8.8 9.8 8 11 8c2.8 0 5 2.2 5 5 0 1.2-.8 2.3-1.9 2.8l-.9.4A2 2 0 0 0 12 18a4 4 0 0 1-4 4c-3.3 0-6-2.7-6-6a4 4 0 0 1 4-4\"/>",
  "piano": "<rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"3\"/><path d=\"M7 4v10\"/><path d=\"M12 4v10\"/><path d=\"M17 4v10\"/>",
  "bass": "<path d=\"M2 12h3l3-8 4 16 3-8h7\"/>",
  "other": "<circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/><circle cx=\"5\" cy=\"12\" r=\"1\"/>",
  "calendar": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"18\" rx=\"3\"/><path d=\"M16 2v4\"/><path d=\"M8 2v4\"/><path d=\"M3 10h18\"/>",
  "arrowr": "<path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/>"
} as const

export type IconName = keyof typeof PATHS

export function SmIcon({ name, size = 16, stroke = 2.2, className }: { name: IconName; size?: number; stroke?: number; className?: string }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: "block", flex: "none" }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  )
}
