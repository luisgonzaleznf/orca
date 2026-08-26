import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HeadlessEmulator } from './headless-emulator'
import {
  COMPOSER_CURSOR_CONTEXT_ROWS,
  detectPendingComposerInput,
  type ComposerPendingInputAgent
} from '../../shared/agent-composer-pending-input'

// Captured verbatim from Claude Code 2.1.246 and Codex 0.149.1 in a 100x30 PTY.
function fixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', `${name}.txt`), 'utf8')
}

describe('readTerminalCursorLineContext against real agent screens', () => {
  let emulator: HeadlessEmulator

  afterEach(() => {
    emulator?.dispose()
  })

  async function detect(agent: ComposerPendingInputAgent, name: string): Promise<string | null> {
    emulator = new HeadlessEmulator({ cols: 100, rows: 30 })
    await emulator.write(fixture(name))
    return detectPendingComposerInput(
      agent,
      emulator.getCursorLineContext(COMPOSER_CURSOR_CONTEXT_ROWS)
    )
  }

  it.each([
    ['claude', 'claude-composer-draft'],
    ['codex', 'codex-composer-draft']
  ] as const)('reads the unsent %s draft', async (agent, name) => {
    await expect(detect(agent, name)).resolves.toBe('Refactor the login page so that it')
    expect(emulator.getCursorLineContext(1)).toMatchObject({ cursorHidden: false })
  })

  it.each([
    ['claude', 'claude-permission-dialog'],
    ['codex', 'codex-trust-dialog']
  ] as const)('does not read a %s dialog option list as a draft', async (agent, name) => {
    await expect(detect(agent, name)).resolves.toBeNull()
    expect(emulator.getCursorLineContext(1)).toMatchObject({ cursorHidden: true })
  })
})
