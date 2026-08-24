import { describe, expect, it } from 'vitest'
import { detectPendingComposerInput } from './agent-composer-pending-input'

const CLAUDE_RULE = '─'.repeat(60)

describe('detectPendingComposerInput', () => {
  it('reads a single-line Claude draft left of the cursor', () => {
    expect(
      detectPendingComposerInput('claude', {
        rows: ['✻ Cogitated for 6s', CLAUDE_RULE, '❯ Refactor the login page so that it'],
        beforeCursor: '❯ Refactor the login page so that it',
        afterCursor: ''
      })
    ).toBe('Refactor the login page so that it')
  })

  it('treats an empty Claude composer as no draft', () => {
    expect(
      detectPendingComposerInput('claude', {
        rows: [CLAUDE_RULE, '❯'],
        beforeCursor: '❯ ',
        afterCursor: ''
      })
    ).toBeNull()
  })

  it('ignores the Codex placeholder rendered after the cursor', () => {
    expect(
      detectPendingComposerInput('codex', {
        rows: ['• You have 1 usage limit reset available.', '› Ask Codex to do anything'],
        beforeCursor: '› ',
        afterCursor: ''
      })
    ).toBeNull()
  })

  it('reads a Codex draft left of the cursor', () => {
    expect(
      detectPendingComposerInput('codex', {
        rows: ['• Working (0s • esc to interrupt)', '› fix the flaky test'],
        beforeCursor: '› fix the flaky test',
        afterCursor: ''
      })
    ).toBe('fix the flaky test')
  })

  it('joins a multi-line draft back to the prompt glyph row', () => {
    expect(
      detectPendingComposerInput('claude', {
        rows: [CLAUDE_RULE, '❯ first line', '  second line', '  third'],
        beforeCursor: '  third',
        afterCursor: ''
      })
    ).toBe('first line\nsecond line\nthird')
  })

  it('does not read transcript history above a rule as a draft', () => {
    expect(
      detectPendingComposerInput('claude', {
        rows: ['❯ an earlier prompt', '· Drizzling…', CLAUDE_RULE, '  cursor parked here'],
        beforeCursor: '  cursor parked here',
        afterCursor: ''
      })
    ).toBeNull()
  })

  it('answers null when no prompt glyph row is in reach', () => {
    expect(
      detectPendingComposerInput('claude', {
        rows: ['plain shell output', 'user@host %'],
        beforeCursor: 'user@host %',
        afterCursor: ''
      })
    ).toBeNull()
    expect(detectPendingComposerInput('claude', null)).toBeNull()
    expect(
      detectPendingComposerInput('codex', { rows: [], beforeCursor: '', afterCursor: '' })
    ).toBeNull()
  })

  it('does not mistake the other agent glyph for a composer', () => {
    expect(
      detectPendingComposerInput('codex', {
        rows: ['❯ Refactor the login page'],
        beforeCursor: '❯ Refactor the login page',
        afterCursor: ''
      })
    ).toBeNull()
  })

  it('reads a draft to the right of a caret moved home', () => {
    const context = {
      rows: [CLAUDE_RULE, '❯ Refactor the login page so that it'],
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
        beforeCursor: '› fix the ',
        afterCursor: 'flaky test'
      })
    ).toBe('fix the flaky test')
  })

  it('ignores text right of the caret when style cannot be trusted', () => {
    expect(
      detectPendingComposerInput(
        'codex',
        {
          rows: ['› Ask Codex to do anything'],
          beforeCursor: '› ',
          afterCursor: 'Ask Codex to do anything'
        },
        { trustStyle: false }
      )
    ).toBeNull()
  })
})
