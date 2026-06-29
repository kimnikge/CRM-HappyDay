<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { supabase } from "$lib/supabase";
    import { auth } from "$lib/stores/auth.svelte";
    import Button from "$lib/components/ui/Button.svelte";

    let pendingCount = $state(0);
    let dark = $state(false);
    let menuOpen = $state(false);

    function toggleDark() {
        dark = !dark;
        if (browser) {
            document.documentElement.classList.toggle("dark", dark);
            localStorage.setItem("theme", dark ? "dark" : "light");
        }
    }

    function toggleMenu() {
        menuOpen = !menuOpen;
        if (menuOpen && browser) {
            document.body.style.overflow = "hidden";
        } else if (browser) {
            document.body.style.overflow = "";
        }
    }

    function closeMenu() {
        menuOpen = false;
        if (browser) document.body.style.overflow = "";
    }

    function handleNavClick() {
        closeMenu();
    }

    async function loadPending() {
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
        closeMenu();
        await auth.signOut();
    }

    onMount(() => {
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
        return () => {
            clearInterval(timer);
            if (browser) document.body.style.overflow = "";
        };
    });
</script>

<header
    class="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-paper/95 backdrop-blur px-4 py-2.5 sm:px-6 sm:py-3"
>
    <div class="flex items-center gap-2 sm:gap-3">
        <a
            href="/"
            class="text-base sm:text-lg font-display font-semibold text-ink no-underline tracking-tight flex items-center"
        >
            <span aria-hidden="true" class="mr-1.5 sm:mr-2">🍽️</span>
            <span class="hidden xs:inline">Catering CRM</span>
            <span class="xs:hidden">CRM</span>
        </a>
    </div>

    <!-- Desktop navigation -->
    <nav
        class="hidden md:flex items-center gap-2"
        aria-label="Основная навигация"
    >
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
        <span
            class="text-xs text-neutral-500 font-mono hidden lg:inline"
            aria-live="polite"
        >
            {auth.session?.user?.email ?? ""}
        </span>
        <Button variant="ghost" size="sm" onclick={logout}>Выйти</Button>
    </nav>

    <!-- Mobile: badge + hamburger -->
    <div class="flex md:hidden items-center gap-1.5">
        {#if pendingCount > 0}
            <a
                href="/?pending=1"
                class="inline-flex items-center justify-center rounded-full bg-signal text-white text-xs font-bold min-w-5 h-5 px-1.5 no-underline hover:opacity-80 transition-opacity duration-150"
                title="Заказов на согласовании"
            >
                {pendingCount}
            </a>
        {/if}
        <button
            class="flex items-center justify-center w-10 h-10 bg-transparent border-0 cursor-pointer rounded-md hover:bg-neutral-100 transition-colors duration-150"
            onclick={toggleMenu}
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={menuOpen}
        >
            <span class="block relative w-5 h-4">
                <span
                    class="absolute left-0 block h-0.5 w-5 bg-ink rounded transition-all duration-200"
                    class:top-0={!menuOpen}
                    class:top-1.5={menuOpen}
                    class:rotate-45={menuOpen}
                ></span>
                <span
                    class="absolute left-0 top-1.5 block h-0.5 w-5 bg-ink rounded transition-opacity duration-200"
                    class:opacity-0={menuOpen}
                ></span>
                <span
                    class="absolute left-0 block h-0.5 w-5 bg-ink rounded transition-all duration-200"
                    class:top-3={!menuOpen}
                    class:top-1.5={menuOpen}
                    class:-rotate-45={menuOpen}
                ></span>
            </span>
        </button>
    </div>
</header>

<!-- Mobile menu overlay -->
{#if menuOpen}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
        class="fixed inset-0 z-20 md:hidden"
        onclick={closeMenu}
        onkeydown={(e: KeyboardEvent) => {
            if (e.key === "Escape") closeMenu();
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Мобильное меню"
        tabindex="-1"
    >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>

        <!-- Menu panel -->
        <nav
            class="absolute top-0 right-0 bottom-0 w-64 max-w-[80vw] bg-paper shadow-2xl flex flex-col animate-slide-in"
            aria-label="Мобильная навигация"
            onclick={(e: MouseEvent) => e.stopPropagation()}
            onkeydown={(e: KeyboardEvent) => {
                if (e.key === "Escape") closeMenu();
            }}
        >
            <!-- Menu header -->
            <div
                class="flex items-center justify-between px-4 py-3 border-b border-neutral-200"
            >
                <span class="text-sm font-semibold text-ink">Меню</span>
                <button
                    class="flex items-center justify-center w-8 h-8 bg-transparent border-0 cursor-pointer rounded-md hover:bg-neutral-100"
                    onclick={closeMenu}
                    aria-label="Закрыть меню">✕</button
                >
            </div>

            <!-- Nav links -->
            <div class="flex-1 overflow-y-auto py-2">
                <a href="/" class="mobile-nav-link" onclick={handleNavClick}>
                    <span class="mr-3">📋</span>Заказы
                </a>
                <a
                    href="/orders/new"
                    class="mobile-nav-link"
                    onclick={handleNavClick}
                >
                    <span class="mr-3">➕</span>Новый заказ
                </a>
                <a
                    href="/clients"
                    class="mobile-nav-link"
                    onclick={handleNavClick}
                >
                    <span class="mr-3">👥</span>Клиенты
                </a>
                <a
                    href="/calendar"
                    class="mobile-nav-link"
                    onclick={handleNavClick}
                >
                    <span class="mr-3">📅</span>Календарь
                </a>
                {#if auth.role === "admin"}
                    <a
                        href="/users"
                        class="mobile-nav-link"
                        onclick={handleNavClick}
                    >
                        <span class="mr-3">👤</span>Пользователи
                    </a>
                {/if}
                <a
                    href="/profile"
                    class="mobile-nav-link"
                    onclick={handleNavClick}
                >
                    <span class="mr-3">⚙️</span>Профиль
                </a>
                <hr class="my-2 border-neutral-200" />
                <button
                    class="mobile-nav-link w-full text-left"
                    onclick={() => {
                        toggleDark();
                    }}
                >
                    <span class="mr-3">{dark ? "☀️" : "🌙"}</span>
                    {dark ? "Светлая тема" : "Тёмная тема"}
                </button>
            </div>

            <!-- Menu footer: email + logout -->
            <div class="border-t border-neutral-200 px-4 py-3 space-y-2">
                <p class="text-xs text-neutral-500 font-mono truncate">
                    {auth.session?.user?.email ?? ""}
                </p>
                <Button variant="secondary" size="sm" full onclick={logout}>
                    Выйти
                </Button>
            </div>
        </nav>
    </div>
{/if}
