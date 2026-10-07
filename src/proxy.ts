import createMiddleware from 'next-intl/middleware';
import {routing} from './i18n/routing';

const handleLocale = createMiddleware(routing);

export function proxy(request: any) {
  return handleLocale(request);
}

export const config = {
  // Match only internationalized pathnames
  matcher: ['/', '/(ar|en)/:path*']
};
