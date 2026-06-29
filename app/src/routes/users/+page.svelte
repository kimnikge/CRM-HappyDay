<script lang="ts">
    import { onMount } from "svelte";
    import { supabase } from "$lib/supabase";
    import { auth } from "$lib/stores/auth.svelte";
    import Header from "$lib/components/Header.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { goto } from "$app/navigation";

    let users = $state<any[]>([]);
    let loading = $state(true);
    let error = $state("");

    async function load() {
        const { data } = await supabase
            .from("profiles")
            .select("id, full_name, initials, phone, role, created_at")
            .order("created_at", { ascending: false });
        users = data ?? [];
        loading = false;
    }

    async function toggleRole(userId: string, newRole: string) {
        const { error: err } = await supabase
            .from("profiles")
            .update({ role: newRole })
            .eq("id", userId);

        if (err) {
            error = err.message;
        } else {
            load();
        }
    }

    async function deleteUser(userId: string, userName: string) {
        if (!confirm(`Удалить пользователя «${userName}» навсегда?`)) return;

        const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            error = body.error || "Ошибка удаления";
        } else {
            load();
        }
    }

    onMount(async () => {
        await auth.waitForInit();
        if (!auth.session || auth.role !== "admin") {
            goto("/");
            return;
        }
        load();
    });
</script>

<main class="min-h-screen bg-neutral-50">
    <Header />

    <div class="mx-auto max-w-3xl px-3 sm:px-6 py-4 sm:py-6">
        <h2 class="text-lg sm:text-xl font-display font-semibold text-ink mb-4 sm:mb-6">Пользователи</h2>

        {#if error}
            <div class="mb-4 rounded-md bg-alert/10 border border-alert/20 p-3 text-sm text-alert">{error}</div>
        {/if}

        {#if loading}
            <p class="text-sm text-neutral-400 py-10 text-center">Загрузка...</p>
        {:else}
            <div class="table-responsive rounded-md bg-paper border border-neutral-200/60 shadow-card">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b border-neutral-200 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            <th class="px-3 sm:px-4 py-2.5 sm:py-3">Пользователь</th>
                            <th class="px-3 sm:px-4 py-2.5 sm:py-3 hidden sm:table-cell">Телефон</th>
                            <th class="px-3 sm:px-4 py-2.5 sm:py-3">Роль</th>
                            <th class="px-3 sm:px-4 py-2.5 sm:py-3 hidden md:table-cell">Дата</th>
                            <th class="px-3 sm:px-4 py-2.5 sm:py-3 w-1"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each users as u (u.id)}
                            <tr class="border-b border-neutral-100 hover:bg-neutral-50 transition-colors duration-100">
                                <td class="px-3 sm:px-4 py-2.5">
                                    <span class="font-medium text-ink text-sm">{u.full_name}</span>
                                    <span class="text-neutral-400 ml-1.5 text-xs">{u.initials}</span>
                                    <!-- Show phone inline on mobile -->
                                    <span class="block text-xs text-neutral-500 sm:hidden mt-0.5">{u.phone || "—"}</span>
                                </td>
                                <td class="px-3 sm:px-4 py-2.5 text-neutral-600 hidden sm:table-cell">{u.phone || "—"}</td>
                                <td class="px-3 sm:px-4 py-2.5">
                                    {#if u.role === "admin"}
                                        <span class="inline-flex rounded-sm bg-mint/10 text-mint text-xs font-medium px-2 py-0.5">Админ</span>
                                    {:else}
                                        <span class="inline-flex rounded-sm bg-signal/10 text-signal text-xs font-medium px-2 py-0.5">Ожидает</span>
                                    {/if}
                                </td>
                                <td class="px-3 sm:px-4 py-2.5 text-neutral-400 text-xs font-mono hidden md:table-cell">
                                    {new Date(u.created_at).toLocaleDateString("ru-RU")}
                                </td>
                                <td class="px-2 sm:px-4 py-2.5">
                                    {#if u.role === "pending"}
                                        <Button variant="primary" size="sm" onclick={() => toggleRole(u.id, "admin")}>
                                            Активировать
                                        </Button>
                                    {:else if u.id !== auth.session?.user?.id}
                                        <Button variant="secondary" size="sm" onclick={() => toggleRole(u.id, "pending")}>
                                            Отключить
                                        </Button>
                                    {/if}
                                    {#if u.id !== auth.session?.user?.id}
                                        <button
                                            class="text-alert hover:opacity-70 text-xs bg-transparent border-0 p-0 cursor-pointer ml-1"
                                            onclick={() => deleteUser(u.id, u.full_name)}
                                            title="Удалить пользователя"
                                        >✕</button>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</main>
