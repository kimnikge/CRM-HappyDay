import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabase.server';
import { safeService } from '$lib/api-helpers.server';
import type { RequestHandler } from './$types';

// GET /api/statuses — list all statuses (public read)
export const GET: RequestHandler = async () => {
  const [data, svcError] = await safeService(async () => {
    const { data, error } = await supabase
      .from('statuses')
      .select('*')
      .order('order_index');
    if (error) throw error;
    return data;
  });
  if (svcError) return svcError;
  return json(data);
};
