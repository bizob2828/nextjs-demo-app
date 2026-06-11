// The newrelic package ships no type declarations. Declare it loosely so the
// agent API (getBrowserTimingHeader, agent.collector, etc.) typechecks.
declare module 'newrelic' {
  const newrelic: any
  export default newrelic
}
