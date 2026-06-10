import { tracingChannel } from 'node:diagnostics_channel'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
// @ts-expect-error - newrelic ships no type declarations
import newrelic from 'newrelic'
import logger from '@/lib/logger'

// TEMPORARY diagnostic endpoint. Reports New Relic / pino instrumentation
// state from inside the deployed Vercel Function. Delete after debugging.
export const dynamic = 'force-dynamic'

// Real Node require, hidden from webpack so it isn't rewritten/bundled.
const nodeRequire = eval('require') as NodeRequire

// Walk up from cwd collecting every node_modules root on the path. nft-pruned
// Lambdas can nest the included files under any of these.
function nodeModulesRoots(): string[] {
  const roots: string[] = []
  let dir = process.cwd()
  for (let i = 0; i < 12; i++) {
    roots.push(join(dir, 'node_modules'))
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return roots
}

export async function GET() {
  // 1) Are the ESM-hook + transformer files PHYSICALLY in the Lambda? Check the
  // raw file on disk — require.resolve lies here because packages like meriyah
  // gate subpath access behind their `exports` map even when the file exists.
  const roots = nodeModulesRoots()
  const filesPresent: Record<string, boolean> = {}
  for (const p of [
    'newrelic/esm-loader.mjs',
    '@apm-js-collab/tracing-hooks/index.js',
    '@apm-js-collab/tracing-hooks/hook.mjs',
    'import-in-the-middle/hook.mjs',
    'meriyah/dist/meriyah.mjs',
    'astring/dist/astring.mjs',
    'esquery/dist/esquery.esm.min.js',
  ]) {
    filesPresent[p] = roots.some((r) => existsSync(join(r, p)))
  }

  // 1b) Is the CJS source-transform hook installed in THIS process? The hook
  // replaces Module.prototype._compile with a fn literally named wrappedCompile
  // (@apm-js-collab/tracing-hooks/index.js:22). If this is true on Vercel but
  // the transform below is false, the hook is present but pino's source never
  // flowed through it (e.g. loaded from precompiled V8 bytecode).
  const hooks: Record<string, unknown> = {}
  try {
    const Mod = nodeRequire('module') as { prototype: { _compile: (...a: unknown[]) => unknown } }
    hooks.compileFnName = Mod.prototype._compile?.name ?? null
    hooks.compilePatched = Mod.prototype._compile?.name === 'wrappedCompile'
  } catch (e) {
    hooks.error = (e as Error)?.message
  }

  // 1c) Most direct test: is the actually-loaded pino's asJson source rewritten?
  // A transformed asJson contains the injected diagnostics_channel call.
  try {
    const tools = nodeRequire('pino/lib/tools.js') as { asJson?: (...a: unknown[]) => unknown }
    const src = tools?.asJson?.toString() ?? ''
    hooks.pinoAsJsonResolved = Boolean(tools?.asJson)
    hooks.pinoAsJsonTransformed = /nr_asJson|orchestrion|tracingChannel|diagnostics_channel|tracing_channel/.test(src)
  } catch (e) {
    hooks.pinoAsJsonError = (e as Error)?.message
  }

  // 2) Is pino's asJson transformed? If so, calling it publishes to this channel.
  const ch = tracingChannel('orchestrion:pino:nr_asJson')
  const agentSubscriberActive = Boolean(
    (ch as unknown as { start?: { hasSubscribers?: boolean } }).start?.hasSubscribers,
  )
  let channelPublishedOnLog = false
  const probe = { start() { channelPublishedOnLog = true } } as unknown as Parameters<typeof ch.subscribe>[0]
  ch.subscribe(probe)

  // 3) Agent connection + log-forwarding config + pending log count.
  const agentInfo: Record<string, unknown> = {}
  try {
    const agent = (newrelic as unknown as { agent?: Record<string, any> }).agent
    const cfg = agent?.config
    agentInfo.hasAgent = Boolean(agent)
    agentInfo.runId = cfg?.run_id ?? null
    agentInfo.connected = Boolean(cfg?.run_id)
    agentInfo.appLoggingEnabled = cfg?.application_logging?.enabled ?? null
    agentInfo.forwardingEnabled = cfg?.application_logging?.forwarding?.enabled ?? null
    try {
      agentInfo.pendingLogsBefore = agent?.logs?.events?.length ?? null
    } catch {
      agentInfo.pendingLogsBefore = 'unreadable'
    }

    logger.info('nr-debug probe log line')

    try {
      agentInfo.pendingLogsAfter = agent?.logs?.events?.length ?? null
    } catch {
      agentInfo.pendingLogsAfter = 'unreadable'
    }
  } catch (e) {
    agentInfo.error = (e as Error)?.message
  }
  ch.unsubscribe(probe as unknown as Parameters<typeof ch.unsubscribe>[0])

  return Response.json({
    node: process.version,
    execArgv: process.execArgv,
    nodeOptions: process.env.NODE_OPTIONS ?? null,
    cwd: process.cwd(),
    nodeModulesRoots: roots.filter((r) => existsSync(r)),
    filesPresent,
    hooks,
    transform: { agentSubscriberActive, channelPublishedOnLog },
    agent: agentInfo,
  })
}
