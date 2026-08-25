import type { IBuffer, IBufferLine } from '@xterm/headless'
import {
  COMPOSER_CURSOR_CONTEXT_ROWS_BELOW,
  type TerminalCursorContext
} from '../../shared/agent-composer-pending-input'

// Why: agent composers draw their placeholder dim, so dropping dim cells leaves only typed text.
function undimmedText(line: IBufferLine, fromX = 0): string {
  let text = ''
  for (let x = fromX; x < line.length; x += 1) {
    const cell = line.getCell(x)
    if (cell && !cell.isDim()) {
      text += cell.getChars()
    }
  }
  return text.trimEnd()
}

/** Rows ending at the cursor row plus the cursor row split at the cursor; null before any row exists. */
export function readTerminalCursorLineContext(
  buffer: IBuffer,
  rowsAbove: number
): TerminalCursorContext | null {
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
  const rowsBelow: string[] = []
  const end = Math.min(buffer.length - 1, cursorRow + COMPOSER_CURSOR_CONTEXT_ROWS_BELOW)
  for (let row = cursorRow + 1; row <= end; row += 1) {
    rowsBelow.push(buffer.getLine(row)?.translateToString(true) ?? '')
  }
  return {
    rows,
    typedRows,
    rowsBelow,
    beforeCursor: cursorLine.translateToString(true, 0, buffer.cursorX),
    afterCursor: undimmedText(cursorLine, buffer.cursorX)
  }
}
