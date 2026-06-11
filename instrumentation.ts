import type { EventEmitter } from 'node:events'

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  const { default: newrelic } = await import('newrelic')
  const agent = newrelic?.agent as
    | (EventEmitter & { collector?: { isConnected?: () => boolean } })
    | undefined
  if (!agent || agent.collector?.isConnected?.()) {
    return
  }

  // The function stays warm until register() resolves, but freezes right after
  // the first response — which is why the agent never finished its collector
  // handshake (runId stayed null). Block bootstrap on the connect so it gets
  // real wall-clock time here. The success event is the 'started' state (the
  // agent emits its state name); 'errored' is the failure terminal. Bail after
  // a timeout so a stalled/failed connect can't hang server startup forever.
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      agent.removeListener('started', done)
      agent.removeListener('errored', done)
      resolve()
    }
    const timer = setTimeout(done, 8000)
    agent.once('started', done)
    agent.once('errored', done)
  })
}
