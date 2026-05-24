import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ─── Browser-Client (Client Components) ──────────────────────────────────────
// Wird in allen 'use client'-Komponenten verwendet.
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

// ─── Server-Client (Server Components, Route Handlers, Server Actions) ────────
// Liest und schreibt Cookies über next/headers.
// WICHTIG: Immer eine neue Instanz pro Request erstellen – niemals teilen.
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

// ─── Middleware-Client (nur für middleware.ts) ────────────────────────────────
// Benötigt direkten Zugriff auf Request/Response, um Cookies zu lesen und zu
// schreiben. Wird ausschließlich in middleware.ts verwendet.
export const createMiddlewareClient = (
  request: Request,
  response: Response
) => {
  const requestHeaders = new Headers(request.headers)

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers
            .get('cookie')
            ?.split(';')
            .map((c) => {
              const [name, ...rest] = c.trim().split('=')
              return { name: name.trim(), value: rest.join('=') }
            }) ?? []
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieStr = `${name}=${value}; Path=${options?.path ?? '/'}${
              options?.maxAge != null ? `; Max-Age=${options.maxAge}` : ''
            }${options?.httpOnly ? '; HttpOnly' : ''}${
              options?.secure ? '; Secure' : ''
            }${options?.sameSite ? `; SameSite=${options.sameSite}` : ''}`
            requestHeaders.append('Set-Cookie', cookieStr)
          })
        },
      },
    }
  )
}
