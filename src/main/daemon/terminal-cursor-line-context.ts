import type { IBuffer } from '@xterm/headless'
import type { TerminalCursorContext } from '../../shared/agent-composer-pending-input'

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
  const start = Math.max(buffer.baseY, cursorRow - Math.max(0, Math.floor(rowsAbove)))
  for (let row = start; row <= cursorRow; row += 1) {
    rows.push(buffer.getLine(row)?.translateToString(true) ?? '')
  }
  // Why: agent composers draw their placeholder dim, so dropping dim cells leaves only typed text.
  let afterCursor = ''
  for (let x = buffer.cursorX; x < cursorLine.length; x += 1) {
    const cell = cursorLine.getCell(x)
    if (cell && !cell.isDim()) {
      afterCursor += cell.getChars()
    }
  }
  return {
    rows,
    beforeCursor: cursorLine.translateToString(true, 0, buffer.cursorX),
    afterCursor: afterCursor.trimEnd()
  }
}
