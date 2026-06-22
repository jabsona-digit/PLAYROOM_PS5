'use client'

// Sentry error monitoring for the admin SPA (P1-4 of the senior review).
// The admin is a fully client-side static export, so we use @sentry/react and
// init in the browser only. Errors-only (no performance tracing / no session
// replay) to stay lean on the free-tier quota. The DSN is public by design
// (it ships in the client bundle and only allows event ingestion).

import * as Sentry from '@sentry/react'

let started = false

function startSentry() {
  if (started || typeof window === 'undefined') return
  started = true
  Sentry.init({
    dsn: 'https://8ce8cef849e863fa49d7de9567b10021@o4511608819875840.ingest.de.sentry.io/4511608859656272',
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,          // errors only — no perf tracing (quota-friendly)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}

// run as soon as this client module is evaluated (before mount)
startSentry()

export function SentryInit() {
  return null
}
