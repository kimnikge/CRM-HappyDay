import { supabase } from '$lib/supabase.server';
import type { CreateClient } from '$lib/schemas';

export async function getClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name');

  if (error) throw error;
  return data;
}

export async function createClient(input: CreateClient, userId: string) {
  const { data, error } = await supabase
    .from('clients')
    .insert({ ...input, created_by: userId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateClient(id: string, input: Partial<CreateClient>) {
  const { data, error } = await supabase
    .from('clients')
    .update(input)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
