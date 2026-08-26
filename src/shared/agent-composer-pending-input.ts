/** Rows ending at the cursor row (last entry), plus the cursor row split at the cursor. */
export type TerminalCursorContext = {
  rows: string[]
  /** `rows` with dim cells dropped: what the user typed, minus agent placeholders. */
  typedRows: string[]
  beforeCursor: string
  /** Text right of the cursor, excluding dim cells (agent placeholders render dim). */
  afterCursor: string
  /** DECTCEM off: the agent is showing a dialog or menu, not a composer caret. */
  cursorHidden?: boolean
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

function isComposerPromptRow(row: string, glyph: string): boolean {
  return row.startsWith(glyph)
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
  // Why: a permission or trust dialog reuses the composer glyph for its selected option
  // (Codex even at column 0), but both agents hide the terminal cursor while one is open
  // and show it whenever the composer has a caret — a draft cannot hide the cursor.
  if (context.cursorHidden === true) {
    return null
  }
  const glyph = COMPOSER_PROMPT_GLYPH[agent]
  const trustStyle = options.trustStyle !== false
  const typedRows = trustStyle ? context.typedRows : context.rows
  const cursorRowIndex = context.rows.length - 1
  const cursorRowText = `${context.beforeCursor}${trustStyle ? context.afterCursor : ''}`
  if (isComposerPromptRow(context.rows[cursorRowIndex]!, glyph)) {
    const draft = cursorRowText.slice(glyph.length).trim()
    return draft.length > 0 ? draft : null
  }
  if (!isDraftContinuationRow(context.rows[cursorRowIndex]!)) {
    return null
  }
  for (let index = cursorRowIndex - 1; index >= 0; index -= 1) {
    const row = context.rows[index]!
    if (isComposerPromptRow(row, glyph)) {
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
