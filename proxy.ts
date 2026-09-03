import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

const PROTECTED_ROUTES = ['/matchmaking', '/result', '/history', '/profile', '/account', '/admin', '/developer', '/auth/mfa'];
const ADMIN_ROUTES = ['/admin'];
const DEVELOPER_ROUTES = ['/developer'];
const AUTH_ROUTES = ['/auth/login', '/auth/register'];
// These endpoints are deliberately public and perform their own validation.
// Keeping them out of the session refresh path prevents a stale browser token
// from blocking the home page ticker or health checks for minutes.
const PUBLIC_API_ROUTES = [
  '/api/health',
  '/api/stripe/webhook',
  '/api/matches/live',
  '/api/community-stats',
  '/api/security/captcha',
];
// Stripe must be able to deliver subscription events while the public site is
// in maintenance mode. The route verifies Stripe's signed payload itself.
const MAINTENANCE_ALLOWED_ROUTES = ['/maintenance', '/auth/login', '/auth/register', '/auth/mfa', '/auth/banned', '/api/stripe/webhook', '/api/health'];
const SUPABASE_PROXY_TIMEOUT_MS = 2_500;

type MiddlewareProfile = {
  is_banned: boolean | null;
  is_admin: boolean | null;
  is_developer: boolean | null;
};

function createTimeoutFetch() {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUPABASE_PROXY_TIMEOUT_MS);
    const upstreamSignal = init?.signal;
    const abortFromUpstream = () => controller.abort();

    if (upstreamSignal) {
      if (upstreamSignal.aborted) controller.abort();
      else upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
    }

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      upstreamSignal?.removeEventListener('abort', abortFromUpstream);
    }
  };
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // URLs sind in Next.js case-sensitive. Viele Nutzer tippen die Seite mit
  // großem D ein; leite diese Schreibweise deshalb zuverlässig auf die echte
  // Developer-Route weiter, statt eine 404-Seite auszuliefern.
  if (pathname === '/Developer' || pathname.startsWith('/Developer/')) {
    const developerUrl = request.nextUrl.clone();
    developerUrl.pathname = pathname.replace(/^\/Developer/, '/developer');
    return NextResponse.redirect(developerUrl);
  }

  // Lokale Design-Vorschau ohne Zugang zu Produktivdaten. Diese Ausnahme ist
  // ausschließlich im Entwicklungsmodus wirksam und muss zusätzlich explizit
  // über die lokale Umgebungsvariable aktiviert werden.
  if (process.env.NODE_ENV === 'development' && process.env.RANKEDDARTS_LOCAL_UI_PREVIEW === '1') {
    return NextResponse.next({ request });
  }

  if (PUBLIC_API_ROUTES.includes(pathname)) {
    return NextResponse.next({ request });
  }

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
      global: {
        // Supabase Auth retries token refreshes internally. Without an abort
        // signal an expired browser session can hold a Vercel function open
        // for more than a minute and make the whole site appear to load forever.
        fetch: createTimeoutFetch(),
      },
    }
  );

  const isProtected = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
  const isDeveloperRoute = DEVELOPER_ROUTES.some((r) => pathname.startsWith(r));
  const isMaintenanceAllowedRoute = MAINTENANCE_ALLOWED_ROUTES.some((r) => pathname.startsWith(r));

  // Check the lightweight maintenance setting before asking Auth to refresh a
  // user token. On normal public pages no verified identity is needed at all.
  let maintenanceEnabled = false;
  if (!isMaintenanceAllowedRoute) {
    try {
      const { data: maintenanceSetting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'maintenance_mode')
        .maybeSingle();

      maintenanceEnabled = Boolean((maintenanceSetting?.value as { enabled?: boolean } | null)?.enabled);
    } catch (error) {
      console.error('Could not read maintenance status in proxy:', error);
    }
  }

  // Protected pages, authentication pages and maintenance bypasses still need
  // a verified identity. Public traffic must never wait for a token refresh.
  if (!isProtected && !isAuthRoute && !maintenanceEnabled) {
    return response;
  }

  // Never trust the user embedded in a cookie session for access control.
  // getUser() verifies the access token with Supabase Auth before we use it.
  // A failed or timed-out refresh is treated as signed out instead of making
  // the request wait indefinitely.
  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.warn('Supabase session verification failed in proxy:', error.message);
    } else {
      user = data.user;
    }
  } catch (error) {
    console.error('Supabase session verification crashed in proxy:', error);
  }

  let profile: MiddlewareProfile | null = null;

  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('is_banned, is_admin, is_developer')
      .eq('supabaseId', user.id)
      .single();

    profile = data as MiddlewareProfile | null;
  }

  // Wartungsmodus: blockiert die öffentliche Website, lässt Login und die Wartungsseite offen.
  // Developer/Admins dürfen die Website weiterhin benutzen, damit du den Modus wieder deaktivieren kannst.
  if (maintenanceEnabled) {
    const mayBypassMaintenance = Boolean(profile?.is_developer || profile?.is_admin);

    if (!mayBypassMaintenance) {
      const maintenanceUrl = request.nextUrl.clone();
      maintenanceUrl.pathname = '/maintenance';
      maintenanceUrl.search = '';
      return NextResponse.redirect(maintenanceUrl);
    }
  }

  // Nicht eingeloggte User von geschützten Seiten auf Login weiterleiten.
  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Gebannte User auf die Banned-Seite weiterleiten.
  if (user && isProtected && pathname !== '/auth/banned') {
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

    if ((isAdminRoute || isDeveloperRoute) && pathname !== '/auth/mfa') {
      const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance?.currentLevel !== 'aal2') {
        const mfaUrl = request.nextUrl.clone();
        mfaUrl.pathname = '/auth/mfa';
        mfaUrl.search = '';
        mfaUrl.searchParams.set('redirectTo', pathname);
        return NextResponse.redirect(mfaUrl);
      }
    }
  }

  // Bereits eingeloggte User von Login/Register wegweiterleiten.
  if (user && isAuthRoute) {
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
