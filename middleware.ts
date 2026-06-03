import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

const PROTECTED_ROUTES = ['/matchmaking', '/result', '/history', '/profile', '/admin', '/developer'];
const ADMIN_ROUTES = ['/admin'];
const DEVELOPER_ROUTES = ['/developer'];
const AUTH_ROUTES = ['/auth/login', '/auth/register'];
const MAINTENANCE_ALLOWED_ROUTES = ['/maintenance', '/auth/login', '/auth/register', '/auth/banned'];

type MiddlewareProfile = {
  is_banned: boolean | null;
  is_admin: boolean | null;
  is_developer: boolean | null;
};

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
  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
  const isDeveloperRoute = DEVELOPER_ROUTES.some((r) => pathname.startsWith(r));
  const isMaintenanceAllowedRoute = MAINTENANCE_ALLOWED_ROUTES.some((r) => pathname.startsWith(r));

  let profile: MiddlewareProfile | null = null;

  if (session) {
    const { data } = await supabase
      .from('profiles')
      .select('is_banned, is_admin, is_developer')
      .eq('supabaseId', session.user.id)
      .single();

    profile = data as MiddlewareProfile | null;
  }

  // Wartungsmodus: blockiert die öffentliche Website, lässt Login und die Wartungsseite offen.
  // Developer/Admins dürfen die Website weiterhin benutzen, damit du den Modus wieder deaktivieren kannst.
  if (!isMaintenanceAllowedRoute) {
    const { data: maintenanceSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'maintenance_mode')
      .maybeSingle();

    const maintenanceEnabled = Boolean((maintenanceSetting?.value as { enabled?: boolean } | null)?.enabled);
    const mayBypassMaintenance = Boolean(profile?.is_developer || profile?.is_admin);

    if (maintenanceEnabled && !mayBypassMaintenance) {
      const maintenanceUrl = request.nextUrl.clone();
      maintenanceUrl.pathname = '/maintenance';
      maintenanceUrl.search = '';
      return NextResponse.redirect(maintenanceUrl);
    }
  }

  // Nicht eingeloggte User von geschützten Seiten auf Login weiterleiten.
  if (!session && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Gebannte User auf die Banned-Seite weiterleiten.
  if (session && isProtected && pathname !== '/auth/banned') {
    if (profile?.is_banned) {
      await supabase.auth.signOut();
      const bannedUrl = request.nextUrl.clone();
      bannedUrl.pathname = '/auth/banned';
      bannedUrl.search = '';
      return NextResponse.redirect(bannedUrl);
    }

    // Admin-Route: nur Admins dürfen /admin betreten.
    if (isAdminRoute && !profile?.is_admin) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Developer-Route: nur Developer dürfen /developer betreten.
    // Admins bekommen hier bewusst keinen automatischen Zugriff, außer sie sind zusätzlich is_developer.
    if (isDeveloperRoute && !profile?.is_developer) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Bereits eingeloggte User von Login/Register wegweiterleiten.
  if (session && isAuthRoute) {
    const redirectTo = searchParams.get('redirectTo') || (profile?.is_developer ? '/developer' : '/profile');
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
