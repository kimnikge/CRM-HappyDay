import { json } from '@sveltejs/kit';
import { ZodError, type ZodSchema } from 'zod';

/**
 * Safe parse — wraps Zod schema parsing with proper 400 error response.
 * Returns [parsedData, null] on success, [null, Response] on failure.
 *
 * Usage:
 *   const [data, error] = await safeParse(request, mySchema);
 *   if (error) return error;
 *   // data is typed correctly
 */
export async function safeParse<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<[T, null] | [null, Response]> {
  try {
    const body = await request.json();
    const parsed = schema.parse(body);
    return [parsed, null];
  } catch (err) {
    if (err instanceof ZodError) {
      return [
        null,
        json(
          {
            error: 'Ошибка валидации',
            details: err.issues.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
          { status: 400 },
        ),
      ];
    }

    // JSON parse error
    if (err instanceof SyntaxError) {
      return [
        null,
        json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 }),
      ];
    }

    console.error('[safeParse] unexpected error:', err);
    return [
      null,
      json({ error: 'Внутренняя ошибка сервера' }, { status: 500 }),
    ];
  }
}

/**
 * Require auth — returns session or 401 response.
 */
export async function requireAuth(locals: App.Locals): Promise<
  [NonNullable<Awaited<ReturnType<typeof locals.auth>>>, null] | [null, Response]
> {
  const session = await locals.auth();
  if (!session) {
    return [null, json({ error: 'Unauthorized' }, { status: 401 })];
  }
  return [session, null];
}

/**
 * Wrap a service call — catches errors and returns proper 500.
 */
export async function safeService<T>(
  fn: () => Promise<T>,
): Promise<[T, null] | [null, Response]> {
  try {
    const data = await fn();
    return [data, null];
  } catch (err: any) {
    console.error('[service] error:', err?.message ?? err);
    return [
      null,
      json(
        { error: err?.message || 'Внутренняя ошибка сервера' },
        { status: 500 },
      ),
    ];
  }
}
