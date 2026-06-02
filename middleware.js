import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function middleware(request) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  const { pathname } = request.nextUrl;

  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user;
  } catch (authErr) {
    console.warn("[Middleware] Invalid or expired refresh token:", authErr.message);
    // If the session is corrupted, clear cookies and redirect back to /portal login
    const redirectRes = NextResponse.redirect(new URL("/portal", request.url));
    
    // Find all cookies matching supabase auth naming patterns and clear them
    const cookieList = request.cookies.getAll();
    cookieList.forEach(c => {
      if (c.name.includes("sb-") || c.name.includes("supabase")) {
        redirectRes.cookies.delete(c.name);
      }
    });
    return redirectRes;
  }

  // Authenticated user at login page → send to payment/activation flow
  if (pathname === "/portal" && user) {
    return NextResponse.redirect(new URL("/portal/pago", request.url));
  }

  // Protect payment and dashboard routes from unauthenticated users
  if ((pathname === "/portal/pago" || pathname.startsWith("/portal/pago/")) && !user) {
    return NextResponse.redirect(new URL("/portal", request.url));
  }

  if (pathname.match(/^\/portal\/.+\/dashboard/) && !user) {
    return NextResponse.redirect(new URL("/portal", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/portal", "/portal/:path*"],
};
