/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API. Leave unset to use the in-browser mock. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'us-atlas/states-10m.json' {
  const topology: import('topojson-specification').Topology
  export default topology
}

declare module 'world-atlas/countries-50m.json' {
  const topology: import('topojson-specification').Topology
  export default topology
}
