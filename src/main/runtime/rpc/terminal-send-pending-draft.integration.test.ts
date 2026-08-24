import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../orca-runtime'
import { RpcDispatcher } from './dispatcher'
import type { RpcRequest } from './core'
import { TERMINAL_METHODS } from './methods/terminal'
import { AGENT_PROMPT_BRACKETED_PASTE_START } from '../../../shared/agent-prompt-injection'

const CLAUDE_RULE = '─'.repeat(60)

function request(params: unknown): RpcRequest {
  return { id: 'request-1', authToken: 'test-token', method: 'terminal.send', params }
}

async function makeClaudeRuntime(composerRow: string): Promise<{
  runtime: OrcaRuntimeService
  write: ReturnType<typeof vi.fn>
  handle: string
}> {
  const write = vi.fn(() => true)
  const runtime = new OrcaRuntimeService()
  runtime.setPtyController({
    write,
    kill: () => true,
    getForegroundProcess: async () => 'claude'
  })
  runtime.attachWindow(1)
  runtime.syncWindowGraph(1, {
    tabs: [
      {
        tabId: 'tab-1',
        worktreeId: 'repo-1::/tmp/worktree',
        title: 'Claude',
        activeLeafId: 'pane-1',
        layout: null
      }
    ],
    leaves: [
      {
        tabId: 'tab-1',
        worktreeId: 'repo-1::/tmp/worktree',
        leafId: 'pane-1',
        paneRuntimeId: 1,
        ptyId: 'pty-1',
        paneTitle: 'Claude'
      }
    ]
  })
  // Why: the composer draft only exists as rendered output — the user's keystrokes
  // never pass through the runtime, so the screen is the sole evidence of a draft.
  const frame = `✻ Cogitated for 6s\r\n${CLAUDE_RULE}\r\n${composerRow}`
  runtime.onPtyData('pty-1', frame, 1)
  const [terminal] = (await runtime.listTerminals()).terminals
  return { runtime, write, handle: terminal.handle }
}

describe('terminal.send into a composer with unsent input', () => {
  afterEach(() => vi.useRealTimers())

  it('refuses to submit a CLI prompt on top of the user draft and reports it', async () => {
    const { runtime, write, handle } = await makeClaudeRuntime(
      '❯ Refactor the login page so that it'
    )
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const response = await dispatcher.dispatch(
      request({
        terminal: handle,
        text: 'Status update from the other terminal: the build is green.',
        enter: true,
        agentPrompt: true,
        client: { id: 'orca-cli', type: 'desktop' }
      })
    )

    expect(response).toMatchObject({
      ok: true,
      result: {
        send: {
          handle,
          accepted: false,
          bytesWritten: 0,
          refusedReason: 'pending-input',
          pendingInput: 'Refactor the login page so that it'
        }
      }
    })
    expect(write).not.toHaveBeenCalled()
  })

  it('still refuses when the caret was moved to the start of the draft', async () => {
    const { runtime, write, handle } = await makeClaudeRuntime(
      '❯ Refactor the login page so that it\x1b[3G'
    )
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const response = await dispatcher.dispatch(
      request({
        terminal: handle,
        text: 'Status update from the other terminal: the build is green.',
        enter: true,
        agentPrompt: true,
        client: { id: 'orca-cli', type: 'desktop' }
      })
    )

    expect(response).toMatchObject({
      ok: true,
      result: {
        send: {
          accepted: false,
          refusedReason: 'pending-input',
          pendingInput: 'Refactor the login page so that it'
        }
      }
    })
    expect(write).not.toHaveBeenCalled()
  })

  it('pastes into an empty composer that shows a dim placeholder', async () => {
    vi.useFakeTimers()
    const { runtime, write, handle } = await makeClaudeRuntime(
      '❯ \x1b[2mTry "refactor <filepath>"\x1b[22m\x1b[3G'
    )
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const send = dispatcher.dispatch(
      request({
        terminal: handle,
        text: 'review this change',
        enter: true,
        agentPrompt: true,
        client: { id: 'orca-cli', type: 'desktop' }
      })
    )
    await vi.waitFor(() => expect(write).toHaveBeenCalled())
    expect(String(write.mock.calls[0]?.[1])).toContain(
      `${AGENT_PROMPT_BRACKETED_PASTE_START}review this change`
    )
    await vi.runAllTimersAsync()
    await send.catch(() => undefined)
  })

  it('does not read a permission dialog option row as a draft', async () => {
    vi.useFakeTimers()
    const { runtime, write, handle } = await makeClaudeRuntime(
      'Do you trust the files in this folder?\r\n❯ 1. Yes, I trust this folder\r\n  2. No, exit\x1b[A\x1b[3G'
    )
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const send = dispatcher.dispatch(
      request({
        terminal: handle,
        text: 'review this change',
        enter: true,
        agentPrompt: true,
        client: { id: 'orca-cli', type: 'desktop' }
      })
    )
    await vi.waitFor(() => expect(write).toHaveBeenCalled())
    await vi.runAllTimersAsync()
    const response = await send
    expect(response).not.toMatchObject({
      result: { send: { refusedReason: 'pending-input' } }
    })
  })

  it('pastes into an empty composer', async () => {
    vi.useFakeTimers()
    const { runtime, write, handle } = await makeClaudeRuntime('❯ ')
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const send = dispatcher.dispatch(
      request({
        terminal: handle,
        text: 'review this change',
        enter: true,
        agentPrompt: true,
        client: { id: 'orca-cli', type: 'desktop' }
      })
    )
    await vi.waitFor(() => expect(write).toHaveBeenCalled())
    expect(String(write.mock.calls[0]?.[1])).toContain(
      `${AGENT_PROMPT_BRACKETED_PASTE_START}review this change`
    )
    await vi.runAllTimersAsync()
    await send.catch(() => undefined)
  })

  it('appends to the draft when the caller opts in with allowPendingInput', async () => {
    vi.useFakeTimers()
    const { runtime, write, handle } = await makeClaudeRuntime('❯ keep this draft')
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const send = dispatcher.dispatch(
      request({
        terminal: handle,
        text: ' and this',
        enter: true,
        agentPrompt: true,
        allowPendingInput: true,
        client: { id: 'orca-cli', type: 'desktop' }
      })
    )
    await vi.waitFor(() => expect(write).toHaveBeenCalled())
    expect(String(write.mock.calls[0]?.[1])).toContain(
      `${AGENT_PROMPT_BRACKETED_PASTE_START} and this`
    )
    await vi.runAllTimersAsync()
    await send.catch(() => undefined)
  })
})
