// Authentication state is managed server-side via httpOnly cookies.
// The middleware.ts reads cronko_token directly from request cookies.
// Client-side auth helpers are not needed — tokens are not accessible via JS.
