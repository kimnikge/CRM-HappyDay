import { supabaseAdmin } from '$lib/supabase-admin.server';
import { MAX_FILE_SIZE } from '$lib/schemas';

// Server-side file operations use supabaseAdmin (service_role) to bypass RLS.
// Auth is already verified by the API endpoint via requireAuth().

export async function getOrderFiles(orderId: string) {
  const { data, error } = await supabaseAdmin
    .from('files')
    .select('*')
    .eq('order_id', orderId)
    .order('uploaded_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function uploadFile(orderId: string, file: File, userId: string) {
  // Validate on server side too
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Файл слишком большой. Максимум 10 МБ');
  }

  const timestamp = Date.now();
  const filePath = `${orderId}/${timestamp}_${file.name}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabaseAdmin.storage
    .from('order-files')
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  // Record in DB
  const { data, error: dbError } = await supabaseAdmin
    .from('files')
    .insert({
      order_id: orderId,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: userId,
    })
    .select()
    .single();

  if (dbError) throw dbError;
  return data;
}

export async function deleteFile(fileId: string) {
  // Get file info first
  const { data: file } = await supabaseAdmin
    .from('files')
    .select('file_path')
    .eq('id', fileId)
    .single();

  if (file) {
    // Delete from storage
    await supabaseAdmin.storage.from('order-files').remove([file.file_path]);
  }

  // Delete from DB
  const { error } = await supabaseAdmin.from('files').delete().eq('id', fileId);
  if (error) throw error;
}
