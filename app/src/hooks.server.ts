import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import type { CookieOptions } from '@supabase/ssr';
import WebSocket from 'ws';

export const handle: Handle = async ({ event, resolve }) => {
  // Create Supabase client with cookie handling + ws transport for Node.js
  event.locals.supabase = createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => event.cookies.getAll(),
        setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => {
          cookies.forEach(({ name, value, options }) => {
            event.cookies.set(name, value, { ...options, path: '/' });
          });
        },
      },
      realtime: { transport: WebSocket as unknown as never },
    }
  );

  // Get session and attach to locals — swallows errors gracefully
  event.locals.auth = async () => {
    try {
      const { data: { session }, error } = await event.locals.supabase.auth.getSession();
      if (error) {
        console.error('[hooks] getSession error:', error.message);
        return null;
      }
      return session;
    } catch (err) {
      console.error('[hooks] auth failed:', err);
      return null;
    }
  };

  return resolve(event);
};

// Global error handler — prevents blank screen on unhandled errors
export const handleError: HandleServerError = ({ error, status, message }) => {
  console.error(`[server] ${status}: ${message}`, error);
  return {
    message: status === 500
      ? 'Внутренняя ошибка сервера. Попробуйте позже.'
      : message,
    status,
  };
};
