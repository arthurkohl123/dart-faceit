import { createBrowserClient } from '@supabase/ssr'

// ─── Browser-Client (Client Components) ──────────────────────────────────────
// Wird in allen 'use client'-Komponenten sowie in providers.tsx verwendet.
// next/headers darf hier NICHT importiert werden – diese Datei landet im
// Client-Bundle und würde sonst einen Build-Fehler verursachen.
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
