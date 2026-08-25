import { describe, expect, it } from 'vitest'
import { detectPendingComposerInput } from './agent-composer-pending-input'

const CLAUDE_RULE = '─'.repeat(60)

describe('detectPendingComposerInput', () => {
  it('reads a single-line Claude draft left of the cursor', () => {
    expect(
      detectPendingComposerInput('claude', {
        rows: ['✻ Cogitated for 6s', CLAUDE_RULE, '❯ Refactor the login page so that it'],
        typedRows: ['✻ Cogitated for 6s', CLAUDE_RULE, '❯ Refactor the login page so that it'],
        beforeCursor: '❯ Refactor the login page so that it',
        afterCursor: ''
      })
    ).toBe('Refactor the login page so that it')
  })

  it('treats an empty Claude composer as no draft', () => {
    expect(
      detectPendingComposerInput('claude', {
        rows: [CLAUDE_RULE, '❯'],
        typedRows: [CLAUDE_RULE, '❯'],
        beforeCursor: '❯ ',
        afterCursor: ''
      })
    ).toBeNull()
  })

  it('ignores the Codex placeholder rendered after the cursor', () => {
    expect(
      detectPendingComposerInput('codex', {
        rows: ['• You have 1 usage limit reset available.', '› Ask Codex to do anything'],
        typedRows: ['• You have 1 usage limit reset available.', '›'],
        beforeCursor: '› ',
        afterCursor: ''
      })
    ).toBeNull()
  })

  it('reads a Codex draft left of the cursor', () => {
    expect(
      detectPendingComposerInput('codex', {
        rows: ['• Working (0s • esc to interrupt)', '› fix the flaky test'],
        typedRows: ['• Working (0s • esc to interrupt)', '› fix the flaky test'],
        beforeCursor: '› fix the flaky test',
        afterCursor: ''
      })
    ).toBe('fix the flaky test')
  })

  it('joins a multi-line draft back to the prompt glyph row', () => {
    expect(
      detectPendingComposerInput('claude', {
        rows: [CLAUDE_RULE, '❯ first line', '  second line', '  third'],
        typedRows: [CLAUDE_RULE, '❯ first line', '  second line', '  third'],
        beforeCursor: '  third',
        afterCursor: ''
      })
    ).toBe('first line\nsecond line\nthird')
  })

  it('keeps a multi-paragraph draft that contains a blank row', () => {
    expect(
      detectPendingComposerInput('claude', {
        rows: [CLAUDE_RULE, '❯ para one', '', '  para two'],
        typedRows: [CLAUDE_RULE, '❯ para one', '', '  para two'],
        beforeCursor: '  para two',
        afterCursor: ''
      })
    ).toBe('para one\n\npara two')
  })

  it('keeps a bulleted continuation line', () => {
    expect(
      detectPendingComposerInput('codex', {
        rows: ['› first', '  • second'],
        typedRows: ['› first', '  • second'],
        beforeCursor: '  • second',
        afterCursor: ''
      })
    ).toBe('first\n• second')
  })

  it('does not read transcript history above a rule as a draft', () => {
    expect(
      detectPendingComposerInput('claude', {
        rows: ['❯ an earlier prompt', '· Drizzling…', CLAUDE_RULE, '  cursor parked here'],
        typedRows: ['❯ an earlier prompt', '· Drizzling…', CLAUDE_RULE, '  cursor parked here'],
        beforeCursor: '  cursor parked here',
        afterCursor: ''
      })
    ).toBeNull()
  })

  it('stops at a column-zero transcript row between an echoed prompt and the caret', () => {
    expect(
      detectPendingComposerInput('codex', {
        rows: ['› an earlier prompt', '• Working (0s • esc to interrupt)', '  status row'],
        typedRows: ['› an earlier prompt', '• Working (0s • esc to interrupt)', '  status row'],
        beforeCursor: '  status row',
        afterCursor: ''
      })
    ).toBeNull()
  })

  it('does not read a column-zero row under the composer as a continuation', () => {
    expect(
      detectPendingComposerInput('codex', {
        rows: ['› draft', 'gpt-5 high · ~/repo'],
        typedRows: ['› draft', 'gpt-5 high · ~/repo'],
        beforeCursor: 'gpt-5 high · ~/repo',
        afterCursor: ''
      })
    ).toBeNull()
  })

  it('answers null when no prompt glyph row is in reach', () => {
    expect(
      detectPendingComposerInput('claude', {
        rows: ['plain shell output', 'user@host %'],
        typedRows: ['plain shell output', 'user@host %'],
        beforeCursor: 'user@host %',
        afterCursor: ''
      })
    ).toBeNull()
    expect(detectPendingComposerInput('claude', null)).toBeNull()
    expect(
      detectPendingComposerInput('codex', {
        rows: [],
        typedRows: [],
        beforeCursor: '',
        afterCursor: ''
      })
    ).toBeNull()
  })

  it('does not mistake the other agent glyph for a composer', () => {
    expect(
      detectPendingComposerInput('codex', {
        rows: ['❯ Refactor the login page'],
        typedRows: ['❯ Refactor the login page'],
        beforeCursor: '❯ Refactor the login page',
        afterCursor: ''
      })
    ).toBeNull()
  })

  it('reads a draft to the right of a caret moved home', () => {
    const context = {
      rows: [CLAUDE_RULE, '❯ Refactor the login page so that it'],
      typedRows: [CLAUDE_RULE, '❯ Refactor the login page so that it'],
      beforeCursor: '❯ ',
      afterCursor: 'Refactor the login page so that it'
    }
    expect(detectPendingComposerInput('claude', context)).toBe('Refactor the login page so that it')
    expect(detectPendingComposerInput('claude', context, { trustStyle: true })).toBe(
      'Refactor the login page so that it'
    )
  })

  it('joins both sides of a mid-draft caret', () => {
    expect(
      detectPendingComposerInput('codex', {
        rows: ['› fix the flaky test'],
        typedRows: ['› fix the flaky test'],
        beforeCursor: '› fix the ',
        afterCursor: 'flaky test'
      })
    ).toBe('fix the flaky test')
  })

  it('does not read a permission dialog option list as a draft', () => {
    const question = 'Do you trust the files in this folder?'
    expect(
      detectPendingComposerInput('claude', {
        rows: [question, '❯ 1. Yes, I trust this folder', '  2. No, exit'],
        typedRows: [question, '❯ 1. Yes, I trust this folder', '  2. No, exit'],
        beforeCursor: '  2. No, exit',
        afterCursor: ''
      })
    ).toBeNull()
    expect(
      detectPendingComposerInput('claude', {
        rows: ['❯ 1. Yes, I trust this folder'],
        typedRows: ['❯ 1. Yes, I trust this folder'],
        rowsBelow: ['  2. No, exit', ''],
        beforeCursor: '❯ 1. Yes, I trust this folder',
        afterCursor: ''
      })
    ).toBeNull()
  })

  it('keeps a draft whose first line is numbered when no option list follows', () => {
    expect(
      detectPendingComposerInput('claude', {
        rows: [CLAUDE_RULE, '❯ 1. First step'],
        typedRows: [CLAUDE_RULE, '❯ 1. First step'],
        rowsBelow: [CLAUDE_RULE, '  ⏵⏵ auto mode on'],
        beforeCursor: '❯ 1. First step',
        afterCursor: ''
      })
    ).toBe('1. First step')
  })

  it('drops dim placeholder text from a glyph row reached from a continuation row', () => {
    expect(
      detectPendingComposerInput('codex', {
        rows: ['› Ask Codex to do anything', '  line two'],
        typedRows: ['›', '  line two'],
        beforeCursor: '  line two',
        afterCursor: ''
      })
    ).toBe('line two')
  })

  it('ignores text right of the caret when style cannot be trusted', () => {
    expect(
      detectPendingComposerInput(
        'codex',
        {
          rows: ['› Ask Codex to do anything'],
          typedRows: ['›'],
          beforeCursor: '› ',
          afterCursor: 'Ask Codex to do anything'
        },
        { trustStyle: false }
      )
    ).toBeNull()
  })
})
