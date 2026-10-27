/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API. Leave unset to use the in-browser mock. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
