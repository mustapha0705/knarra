import 'react'

/**
 * Directory pickers are a de facto standard that React's typings don't cover.
 * Both attributes are needed: `webkitdirectory` for Chromium/WebKit, the bare
 * `directory` for the standards-track spelling.
 *
 * The type parameter is unused here but must be declared to match the arity of
 * React's own `InputHTMLAttributes<T>`.
 */
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string
    directory?: string
  }
}
