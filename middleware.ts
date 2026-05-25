import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

const PROTECTED_ROUTES = ['/matchmaking', '/result', '/history', '/profile', '/admin'];
const ADMIN_ROUTES = ['/admin'];
const AUTH_ROUTES = ['/auth/login', '/auth/register'];

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  const isProtected = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  // Nicht eingeloggte User von geschützten Seiten auf Login weiterleiten
  if (!session && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Gebannte User auf die Banned-Seite weiterleiten + Admin-Route serverseitig absichern
  if (session && isProtected && pathname !== '/auth/banned') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_banned, is_admin')
      .eq('supabaseId', session.user.id)
      .single();

    if (profile?.is_banned) {
      await supabase.auth.signOut();
      const bannedUrl = request.nextUrl.clone();
      bannedUrl.pathname = '/auth/banned';
      return NextResponse.redirect(bannedUrl);
    }

    // Admin-Route: nur Admins dürfen /admin betreten
    // Diese Prüfung läuft serverseitig in der Middleware – kein Flash, kein clientseitiger Bypass möglich
    const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
    if (isAdminRoute && !profile?.is_admin) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Bereits eingeloggte User von Login/Register wegweiterleiten
  if (session && isAuthRoute) {
    const redirectTo = searchParams.get('redirectTo') || '/profile';
    const dest = request.nextUrl.clone();
    dest.pathname = redirectTo;
    dest.search = '';
    return NextResponse.redirect(dest);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
