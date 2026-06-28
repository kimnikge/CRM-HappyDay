<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { supabase } from "$lib/supabase";
    import { auth } from "$lib/stores/auth.svelte";
    import Button from "$lib/components/ui/Button.svelte";

    let pendingCount = $state(0);
    let dark = $state(false); // G18

    function toggleDark() {
        dark = !dark;
        if (browser) {
            document.documentElement.classList.toggle("dark", dark);
            localStorage.setItem("theme", dark ? "dark" : "light");
        }
    }

    async function loadPending() {
        // G12: count orders in "На согласовании" (order_index = 1)
        const { data: status } = await supabase
            .from("statuses")
            .select("id")
            .eq("order_index", 1)
            .single();
        if (!status) return;

        const { count } = await supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("status_id", status.id);
        pendingCount = count ?? 0;
    }

    async function logout() {
        await auth.signOut();
    }

    onMount(() => {
        // G18: Restore theme
        if (browser) {
            const saved = localStorage.getItem("theme");
            dark =
                saved === "dark" ||
                (!saved &&
                    window.matchMedia("(prefers-color-scheme: dark)").matches);
            document.documentElement.classList.toggle("dark", dark);
        }
        loadPending();
        const timer = setInterval(loadPending, 30000);
        return () => clearInterval(timer);
    });
</script>

<header
    class="flex items-center justify-between border-b border-neutral-200 bg-paper px-6 py-3"
>
    <div class="flex items-center gap-3">
        <a
            href="/"
            class="text-lg font-display font-semibold text-ink no-underline tracking-tight"
        >
            <span aria-hidden="true" class="mr-2">🍽️</span>Catering CRM
        </a>
    </div>
    <div class="flex items-center gap-2">
        {#if pendingCount > 0}
            <a
                href="/?pending=1"
                class="inline-flex items-center justify-center rounded-full bg-signal text-white text-xs font-bold min-w-5 h-5 px-1.5 no-underline hover:opacity-80 transition-opacity duration-150"
                title="Заказов на согласовании — нажмите чтобы посмотреть"
            >
                {pendingCount}
            </a>
        {/if}
        <a
            href="/clients"
            class="text-sm text-neutral-500 hover:text-ink no-underline transition-colors duration-150"
            >Клиенты</a
        >
        <a
            href="/calendar"
            class="text-sm text-neutral-500 hover:text-ink no-underline transition-colors duration-150"
            >Календарь</a
        >
        {#if auth.role === "admin"}
            <a
                href="/users"
                class="text-sm text-neutral-500 hover:text-ink no-underline transition-colors duration-150"
                >Пользователи</a
            >
        {/if}
        <a
            href="/profile"
            class="text-sm text-neutral-500 hover:text-ink no-underline transition-colors duration-150"
            >Профиль</a
        >
        <button
            class="text-sm bg-transparent border-0 cursor-pointer px-1 transition-colors duration-150"
            onclick={toggleDark}
            title={dark ? "Светлая тема" : "Тёмная тема"}
            aria-label="Переключить тему">{dark ? "☀️" : "🌙"}</button
        >
        <span class="text-xs text-neutral-500 font-mono" aria-live="polite">
            {auth.session?.user?.email ?? ""}
        </span>
        <Button variant="ghost" size="sm" onclick={logout}>Выйти</Button>
    </div>
</header>
