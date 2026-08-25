/** Rows ending at the cursor row (last entry), plus the cursor row split at the cursor. */
export type TerminalCursorContext = {
  rows: string[]
  /** `rows` with dim cells dropped: what the user typed, minus agent placeholders. */
  typedRows: string[]
  /** A few rows after the cursor row; only read as evidence of a dialog option list. */
  rowsBelow?: string[]
  beforeCursor: string
  /** Text right of the cursor, excluding dim cells (agent placeholders render dim). */
  afterCursor: string
}

export type DetectPendingComposerInputOptions = {
  /** False when the PTY is re-rendered by native ConPTY, whose SGR-dim fidelity is unverified. */
  trustStyle?: boolean
}

export type ComposerPendingInputAgent = 'claude' | 'codex'

// Why: both agents render a dim placeholder right of the cursor on an empty composer
// (Claude `Try "..."`, Codex `Ask Codex to do anything`), so text left of the cursor is
// proof on its own, and text right of it only counts once dim cells are excluded —
// that is what still catches a draft after Home/Ctrl+A moved the caret to column 2.
const COMPOSER_PROMPT_GLYPH: Record<ComposerPendingInputAgent, string> = {
  claude: '❯',
  codex: '›'
}

/** Rows above the cursor row that can still belong to a multi-line draft. */
export const COMPOSER_CURSOR_CONTEXT_ROWS = 16
/** Rows below the cursor row needed to recognize a dialog option list. */
export const COMPOSER_CURSOR_CONTEXT_ROWS_BELOW = 2

const NUMBERED_OPTION = /^\s*\d+\.\s/

// Why: a permission/trust dialog draws its selected option with the composer glyph, so
// the evidence is the option *list* — a numbered row directly under a numbered glyph row —
// not the glyph row's own text, which a draft like `1. First step` shares.
function isDialogOptionRow(row: string, glyph: string, nextRow: string | undefined): boolean {
  return (
    NUMBERED_OPTION.test(row.slice(glyph.length)) &&
    nextRow !== undefined &&
    NUMBERED_OPTION.test(nextRow)
  )
}

function isComposerPromptRow(row: string, glyph: string, nextRow: string | undefined): boolean {
  return row.startsWith(glyph) && !isDialogOptionRow(row, glyph, nextRow)
}

// Why: both agents indent every draft continuation row under the glyph, so content at
// column 0 (rules, transcript bullets, echoed prompts) is never part of the draft.
function isDraftContinuationRow(row: string): boolean {
  return row.length === 0 || /^\s/.test(row)
}

/**
 * Text the user has typed but not submitted in an agent composer, or null when the
 * screen shows no draft or cannot prove one (unknown never blocks a send).
 */
export function detectPendingComposerInput(
  agent: ComposerPendingInputAgent,
  context: TerminalCursorContext | null | undefined,
  options: DetectPendingComposerInputOptions = {}
): string | null {
  if (!context || context.rows.length === 0) {
    return null
  }
  const glyph = COMPOSER_PROMPT_GLYPH[agent]
  const trustStyle = options.trustStyle !== false
  const typedRows = trustStyle ? context.typedRows : context.rows
  const cursorRowIndex = context.rows.length - 1
  const rowAfter = (index: number): string | undefined =>
    index + 1 <= cursorRowIndex ? context.rows[index + 1] : context.rowsBelow?.[0]
  const cursorRowText = `${context.beforeCursor}${trustStyle ? context.afterCursor : ''}`
  if (isComposerPromptRow(context.rows[cursorRowIndex]!, glyph, rowAfter(cursorRowIndex))) {
    const draft = cursorRowText.slice(glyph.length).trim()
    return draft.length > 0 ? draft : null
  }
  if (!isDraftContinuationRow(context.rows[cursorRowIndex]!)) {
    return null
  }
  for (let index = cursorRowIndex - 1; index >= 0; index -= 1) {
    const row = context.rows[index]!
    if (isComposerPromptRow(row, glyph, rowAfter(index))) {
      const lines = [
        (typedRows[index] ?? row).slice(glyph.length),
        ...typedRows.slice(index + 1, cursorRowIndex),
        cursorRowText
      ]
      const draft = lines
        .map((line) => line.trim())
        .join('\n')
        .trim()
      return draft.length > 0 ? draft : null
    }
    if (!isDraftContinuationRow(row)) {
      return null
    }
  }
  return null
}

export const AGENT_PROMPT_PENDING_INPUT_ERROR = 'agent_prompt_pending_input'

export class AgentPromptPendingInputError extends Error {
  constructor(readonly pendingInput: string) {
    super(AGENT_PROMPT_PENDING_INPUT_ERROR)
    this.name = 'AgentPromptPendingInputError'
  }
}
