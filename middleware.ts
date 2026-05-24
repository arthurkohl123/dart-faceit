import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

// ─── Routen-Konfiguration ─────────────────────────────────────────────────────

/** Routen, die eine aktive Session erfordern. */
const PROTECTED_ROUTES = [
  '/matchmaking',
  '/result',
  '/history',
  '/profile',
  '/admin',
]

/** Routen, die nur für nicht-eingeloggte Nutzer zugänglich sind. */
const AUTH_ROUTES = [
  '/auth/login',
  '/auth/register',
]

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Response-Objekt vorbereiten, damit Supabase aktualisierte Cookies
  // zurückschreiben kann (Token-Refresh).
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Cookies sowohl in den Request als auch in die Response schreiben,
          // damit nachfolgende Server-Komponenten die aktualisierte Session sehen.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Session prüfen – getUser() validiert das JWT serverseitig.
  // WICHTIG: Kein Code zwischen createServerClient und getUser() einfügen,
  // der den Request verändern könnte.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isProtected = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  )
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route))

  // ── Nicht eingeloggt → geschützte Route → Login ───────────────────────────
  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    // Ursprüngliche Ziel-URL als Query-Parameter mitgeben für Redirect nach Login
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── Eingeloggt → Auth-Route → Profil ─────────────────────────────────────
  if (user && isAuthRoute) {
    const profileUrl = request.nextUrl.clone()
    profileUrl.pathname = '/profile'
    return NextResponse.redirect(profileUrl)
  }

  // ── Admin-Schutz ──────────────────────────────────────────────────────────
  // Grobe Prüfung auf Middleware-Ebene: Nur eingeloggte Nutzer kommen durch.
  // Die feingranulare is_admin-Prüfung findet weiterhin in der Seite selbst statt.
  if (pathname.startsWith('/admin') && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Aktualisierte Cookies (Token-Refresh) an den Browser zurückgeben
  return supabaseResponse
}

// ─── Matcher ──────────────────────────────────────────────────────────────────
// Die Middleware wird nur für relevante Routen ausgeführt.
// Statische Dateien, _next-Interna und API-Routen werden ausgeschlossen.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
