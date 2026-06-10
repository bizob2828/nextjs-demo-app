export async function register() {
  // Vercel Functions ignore NODE_OPTIONS, so the agent is never preloaded via
  // `--require newrelic`. Without that preload the agent installs its source
  // transform hook only after pino has already been compiled and cached, so
  // pino is never instrumented. register() runs once at server bootstrap,
  // before any route module loads pino — importing the agent here installs the
  // transform hook first, winning the race.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // @ts-expect-error - newrelic ships no type declarations
    await import('newrelic')
  }
}
