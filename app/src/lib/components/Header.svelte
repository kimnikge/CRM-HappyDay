<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { supabase } from "$lib/supabase";
    import { auth } from "$lib/stores/auth.svelte";
    import Button from "$lib/components/ui/Button.svelte";

    let pendingCount = $state(0);
    let dark = $state(false);
    let menuOpen = $state(false);

    /** Элементы для управления фокусом мобильного меню (модальный диалог). */
    let burgerButton = $state<HTMLButtonElement | null>(null);
    let menuPanel = $state<HTMLElement | null>(null);

    const FOCUSABLE =
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function focusableIn(root: HTMLElement | null): HTMLElement[] {
        if (!root) return [];
        return Array.from(
            root.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter(
            (el) =>
                el.getAttribute("tabindex") !== "-1" &&
                el.getClientRects().length > 0,
        );
    }

    function toggleDark() {
        dark = !dark;
        if (!browser) return;
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.style.colorScheme = dark ? "dark" : "light";
        try {
            localStorage.setItem("theme", dark ? "dark" : "light");
        } catch {
            // localStorage может быть недоступен (приватный режим) — тема всё равно применена
        }
    }

    function openMenu() {
        if (menuOpen) return;
        menuOpen = true;
        if (browser) document.body.style.overflow = "hidden";
    }

    function closeMenu() {
        if (!menuOpen) return;
        menuOpen = false;
        if (browser) document.body.style.overflow = "";
    }

    function toggleMenu() {
        if (menuOpen) closeMenu();
        else openMenu();
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

    /**
     * Мобильное меню — модальный диалог:
     *  - фокус при открытии уходит в панель, при закрытии возвращается на бургер;
     *  - Tab/Shift+Tab циклически ходят только по элементам панели;
     *  - Escape закрывает;
     *  - фон (header) на время открытия помечается inert/aria-hidden.
     * Тему применяет inline-скрипт в app.html ДО первой отрисовки, поэтому
     * здесь мы её только читаем (для иконки/подписи) и переключаем по клику.
     */
    let wasOpen = false;
    $effect(() => {
        if (!menuOpen) {
            if (!wasOpen) return;
            wasOpen = false;
            const trigger = burgerButton;
            if (trigger?.isConnected) trigger.focus();
            return;
        }

        if (!menuPanel) return; // панель ещё не смонтирована — эффект перезапустится
        const panel: HTMLElement = menuPanel;
        wasOpen = true;

        const header = burgerButton?.closest("header");
        header?.setAttribute("aria-hidden", "true");
        header?.setAttribute("inert", "");

        // начальный фокус — первый элемент панели (кнопка «Закрыть»)
        const initial = focusableIn(panel);
        (initial[0] ?? panel).focus();

        function onKeydown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                closeMenu();
                return;
            }
            if (event.key !== "Tab") return;

            const items = focusableIn(panel);
            if (items.length === 0) {
                event.preventDefault();
                panel.focus();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement as HTMLElement | null;
            const inside = active !== null && panel.contains(active);

            if (event.shiftKey) {
                if (!inside || active === first) {
                    event.preventDefault();
                    last.focus();
                }
            } else if (!inside || active === last) {
                event.preventDefault();
                first.focus();
            }
        }

        document.addEventListener("keydown", onKeydown, true);

        return () => {
            document.removeEventListener("keydown", onKeydown, true);
            header?.removeAttribute("inert");
            header?.removeAttribute("aria-hidden");
        };
    });

    onMount(() => {
        // Никакого применения темы здесь: класс `dark` и color-scheme уже
        // выставил inline-скрипт из app.html. Читаем состояние для UI.
        if (browser) {
            dark = document.documentElement.classList.contains("dark");
        }
        loadPending();
        const timer = setInterval(loadPending, 30000);

        // Если на мобиле открыть меню и повернуть/растянуть экран до desktop —
        // меню перестаёт быть видимым по CSS, поэтому закрываем его, чтобы не
        // остался заблокированным скролл body.
        const desktopQuery = window.matchMedia("(min-width: 768px)");
        const onViewportChange = (event: MediaQueryListEvent) => {
            if (event.matches) closeMenu();
        };
        desktopQuery.addEventListener("change", onViewportChange);

        return () => {
            clearInterval(timer);
            desktopQuery.removeEventListener("change", onViewportChange);
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

    <!-- Desktop navigation (same links as the mobile menu) -->
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
            href="/"
            class="text-sm text-neutral-600 hover:text-ink no-underline whitespace-nowrap transition-colors duration-150"
            >Заказы</a
        >
        <a
            href="/orders/new"
            class="text-sm text-neutral-600 hover:text-ink no-underline whitespace-nowrap transition-colors duration-150"
            >Новый заказ</a
        >
        <a
            href="/clients"
            class="text-sm text-neutral-600 hover:text-ink no-underline whitespace-nowrap transition-colors duration-150"
            >Клиенты</a
        >
        <a
            href="/calendar"
            class="text-sm text-neutral-600 hover:text-ink no-underline whitespace-nowrap transition-colors duration-150"
            >Календарь</a
        >
        {#if auth.role === "admin"}
            <a
                href="/users"
                class="text-sm text-neutral-600 hover:text-ink no-underline whitespace-nowrap transition-colors duration-150"
                >Пользователи</a
            >
        {/if}
        <a
            href="/profile"
            class="text-sm text-neutral-600 hover:text-ink no-underline whitespace-nowrap transition-colors duration-150"
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
            bind:this={burgerButton}
            class="flex items-center justify-center w-10 h-10 bg-transparent border-0 cursor-pointer rounded-md hover:bg-neutral-100 transition-colors duration-150"
            onclick={toggleMenu}
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? "mobile-menu" : undefined}
            aria-haspopup="dialog"
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
    <div
        id="mobile-menu"
        class="fixed inset-0 z-20 md:hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-menu-title"
        tabindex="-1"
    >
        <!-- Backdrop: отдельная кнопка закрытия (пропускается Tab'ом — для этого есть ✕ и Escape) -->
        <button
            type="button"
            tabindex="-1"
            class="absolute inset-0 w-full h-full border-0 p-0 bg-black/30 backdrop-blur-sm cursor-default"
            aria-label="Закрыть меню"
            onclick={closeMenu}
        ></button>

        <!-- Menu panel -->
        <nav
            bind:this={menuPanel}
            class="absolute top-0 right-0 bottom-0 w-64 max-w-[80vw] bg-paper shadow-2xl flex flex-col animate-slide-in"
            aria-label="Мобильная навигация"
            tabindex="-1"
        >
            <!-- Menu header -->
            <div
                class="flex items-center justify-between px-4 py-3 border-b border-neutral-200"
            >
                <span
                    id="mobile-menu-title"
                    class="text-sm font-semibold text-ink">Меню</span
                >
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
