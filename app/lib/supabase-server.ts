import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ─── Server-Client (Server Components, Route Handlers, Server Actions) ────────
// Liest und schreibt Cookies über next/headers.
// WICHTIG: Immer eine neue Instanz pro Request erstellen – niemals teilen.
// Diese Datei darf NUR in Server Components oder Route Handlers importiert werden.
export const createServerSupabaseClient = async () => {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll wird in Server Components aufgerufen, die keine Cookies
            // setzen können. Kann ignoriert werden, wenn eine Middleware die
            // Session aktuell hält.
          }
        },
      },
    }
  )
}
