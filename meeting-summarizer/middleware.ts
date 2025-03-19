// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Clone the request headers
  const requestHeaders = new Headers(request.headers);
  
  // Set the CSP header
  requestHeaders.set(
    'Content-Security-Policy',
    "script-src 'self' 'unsafe-eval' https://unpkg.com; worker-src blob:"
  );
  
  // Return the response with the added header
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};