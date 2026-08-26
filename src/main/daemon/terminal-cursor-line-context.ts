import type { IBufferLine, Terminal } from '@xterm/headless'
import type { TerminalCursorContext } from '../../shared/agent-composer-pending-input'

// Why: agent composers draw their placeholder dim, so dropping dim cells leaves only typed
// text. Ink paints gaps as empty cells rather than spaces, so an empty cell still reads as one.
function undimmedText(line: IBufferLine, fromX = 0): string {
  let text = ''
  for (let x = fromX; x < line.length; x += 1) {
    const cell = line.getCell(x)
    if (!cell || cell.isDim() || cell.getWidth() === 0) {
      continue
    }
    text += cell.getChars() || ' '
  }
  return text.trimEnd()
}

/** Rows ending at the cursor row plus the cursor row split at the cursor; null before any row exists. */
export function readTerminalCursorLineContext(
  terminal: Terminal,
  rowsAbove: number
): TerminalCursorContext | null {
  const buffer = terminal.buffer.active
  const cursorRow = buffer.baseY + buffer.cursorY
  const cursorLine = buffer.getLine(cursorRow)
  if (!cursorLine) {
    return null
  }
  const rows: string[] = []
  const typedRows: string[] = []
  const start = Math.max(buffer.baseY, cursorRow - Math.max(0, Math.floor(rowsAbove)))
  for (let row = start; row <= cursorRow; row += 1) {
    const line = buffer.getLine(row)
    rows.push(line?.translateToString(true) ?? '')
    typedRows.push(line ? undimmedText(line) : '')
  }
  return {
    rows,
    typedRows,
    beforeCursor: cursorLine.translateToString(true, 0, buffer.cursorX),
    afterCursor: undimmedText(cursorLine, buffer.cursorX),
    cursorHidden: !terminal.modes.showCursor
  }
}
