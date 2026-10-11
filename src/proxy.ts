import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const handleLocale = createMiddleware(routing);

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check if target is login page (/ar/login, /en/login, or /login)
  const isLoginPage =
    pathname === "/login" ||
    pathname === "/ar/login" ||
    pathname === "/en/login" ||
    pathname.startsWith("/ar/login/") ||
    pathname.startsWith("/en/login/");

  if (isLoginPage) {
    // Check if the user already has a valid Supabase auth session token cookie
    const allCookies = request.cookies.getAll();
    const hasAuthToken = allCookies.some(
      (c) =>
        c.name.startsWith("sb-") &&
        c.name.includes("-auth-token") &&
        c.value &&
        c.value !== "[]" &&
        c.value !== '""'
    );

    if (hasAuthToken) {
      const locale = pathname.startsWith("/en") ? "en" : "ar";
      const redirectUrl = new URL(`/${locale}/chat`, request.url);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return handleLocale(request);
}

export const config = {
  // Match only internationalized pathnames, ignore api, static, and auth callback
  matcher: ["/", "/(ar|en)/:path*"],
};
