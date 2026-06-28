import { json } from '@sveltejs/kit';
    import { supabaseAdmin } from '$lib/supabase-admin.server';
    import { requireAuth, safeService } from '$lib/api-helpers.server';
    import type { RequestHandler } from './$types';

    // DELETE /api/users/{id} — delete user (admin only)
    export const DELETE: RequestHandler = async ({ params, locals }) => {
      const [session, authError] = await requireAuth(locals);
      if (authError) return authError;

      // Only admins can delete users
      const [, svcError] = await safeService(async () => {
        // Check caller is admin
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (!profile || profile.role !== 'admin') {
          throw new Error('Только администратор может удалять пользователей');
        }

        // Prevent self-deletion
        if (params.id === session.user.id) {
          throw new Error('Нельзя удалить самого себя');
        }

        // Delete from auth.users (cascades to profiles via FK)
        const { error } = await supabaseAdmin.auth.admin.deleteUser(params.id);
        if (error) throw error;

        return { success: true };
      });

      if (svcError) return svcError;
      return json({ success: true });
    };
