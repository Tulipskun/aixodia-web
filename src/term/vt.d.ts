export const DEFAULT_COLS: number
export const DEFAULT_ROWS: number

export interface Cell {
  ch: string
  wide: number
  fg: number | { r: number; g: number; b: number } | null
  bg: number | { r: number; g: number; b: number } | null
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
  inverse: boolean
}

export interface Run {
  text: string
  fg: number | { r: number; g: number; b: number } | null
  bg: number | { r: number; g: number; b: number } | null
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
  inverse: boolean
}

export interface Snapshot {
  cols: number
  rows: number
  cursor: { row: number; col: number; visible: boolean }
  cursorRow: number
  lines: Cell[][]
}

export function charWidth(cp: number): number
export function runs(row: Cell[]): Run[]

export class Screen {
  constructor(options?: { cols?: number; rows?: number; scrollback?: number })
  cols: number
  rows: number
  scrollback: Cell[][]
  grid: Cell[][]
  cursor: { row: number; col: number; visible: boolean }
  write(chunk: Uint8Array | string): void
  resize(cols: number, rows: number): void
  reset(): void
  snapshot(): Snapshot
}
