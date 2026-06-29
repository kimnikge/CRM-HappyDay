<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { supabase } from "$lib/supabase";
    import Header from "$lib/components/Header.svelte";
    import KanbanBoard from "$lib/components/kanban/KanbanBoard.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { kanban } from "$lib/stores/kanban.svelte";
    import { auth } from "$lib/stores/auth.svelte";

    let searchInput = $state("");
    let initError = $state<string | null>(null);
    let managers = $state<any[]>([]);
    let selectedManager = $state("");
    let sortByVal = $state<"created_at" | "event_date">("created_at");

    // Read pending filter from URL
    const pendingFilter = $derived(
        $page.url.searchParams.get("pending") === "1",
    );
    const filteredOrders = $derived(
        pendingFilter
            ? kanban.orders.filter((o) => {
                  const s = kanban.statuses.find((st) => st.id === o.status_id);
                  return s?.order_index === 1;
              })
            : kanban.orders,
    );

    function handleSearch() {
        kanban.setSearch(searchInput);
    }

    function handleDateFilter(e: Event) {
        kanban.setDateFilter((e.target as HTMLInputElement).value);
    }

    function handleManagerFilter(e: Event) {
        selectedManager = (e.target as HTMLSelectElement).value;
        kanban.setManagerFilter(selectedManager);
    }

    function handleSortChange(e: Event) {
        sortByVal = (e.target as HTMLSelectElement).value as
            | "created_at"
            | "event_date";
        kanban.setSortBy(sortByVal);
    }

    function handleCardClick(orderId: string) {
        goto(`/orders/${orderId}`);
    }

    async function handleStatusChange(orderId: string, newStatusId: string) {
        const ok = await kanban.changeStatus(orderId, newStatusId);
        if (!ok) {
            // Status change failed — UI already rolled back by store
        }
    }

    // G8: Export to CSV
    function exportCSV() {
        const orders = kanban.orders;
        if (orders.length === 0) return;

        const headers = [
            "Номер заказа",
            "Компания",
            "Контакт",
            "Дата мероприятия",
            "Формат",
            "Гостей",
            "Стоимость",
            "Статус",
            "Менеджер",
        ];
        const rows = orders.map((o) => {
            const status = kanban.statuses.find((s) => s.id === o.status_id);
            return [
                o.order_number,
                o.company_name,
                o.contact_person || "",
                o.event_date || "",
                o.format || "",
                o.guest_count || "",
                o.total_cost || "",
                status?.name || "",
                o.profiles?.full_name || "",
            ]
                .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                .join(",");
        });

        const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `catering-orders-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // G22: Derived stats
    const totalRevenue = $derived(
        kanban.orders.reduce((s, o) => s + (Number(o.total_cost) || 0), 0),
    );
    const activeOrders = $derived(
        kanban.orders.filter((o) => {
            const s = kanban.statuses.find((st) => st.id === o.status_id);
            const idx = s?.order_index ?? -1;
            return idx >= 0 && idx <= 4;
        }).length,
    );
    const thisMonthOrders = $derived(
        kanban.orders.filter((o) => {
            if (!o.event_date) return false;
            const d = new Date(o.event_date);
            const now = new Date();
            return (
                d.getMonth() === now.getMonth() &&
                d.getFullYear() === now.getFullYear()
            );
        }).length,
    );

    async function init() {
        // Wait for auth to finish initializing
        await auth.waitForInit();

        if (auth.error) {
            initError = auth.error;
            return;
        }

        if (!auth.session) {
            goto("/login");
            return;
        }

        await kanban.load();
        if (kanban.error) {
            initError = kanban.error;
        }
        kanban.startPolling();

        // G6: Load managers list
        const { data: profs } = await supabase
            .from("profiles")
            .select("id, full_name, initials")
            .order("full_name");
        managers = profs ?? [];
    }

    onMount(() => {
        init();
    });

    onDestroy(() => {
        kanban.stopPolling();
    });
</script>

<main class="min-h-screen bg-neutral-50">
    <Header />

    <!-- Init error (Supabase unreachable, etc.) -->
    {#if initError}
        <div class="flex flex-col items-center justify-center py-20 gap-4 px-4">
            <div
                class="rounded-md bg-alert/10 border border-alert/20 p-6 max-w-md text-center"
            >
                <p class="text-alert font-medium mb-2">Ошибка подключения</p>
                <p class="text-sm text-neutral-600 mb-4">{initError}</p>
                <Button
                    variant="secondary"
                    onclick={() => {
                        initError = null;
                        init();
                    }}
                >
                    Попробовать снова
                </Button>
            </div>
        </div>
    {:else}
        <!-- Toolbar -->
        <div
            class="sticky top-0 z-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 border-b border-neutral-200 bg-paper/90 backdrop-blur px-3 sm:px-6 py-2.5"
        >
            <div class="flex flex-wrap items-center gap-2 flex-1">
                <input
                    type="search"
                    bind:value={searchInput}
                    oninput={handleSearch}
                    placeholder="Поиск..."
                    class="w-full sm:w-48 md:w-64 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-body placeholder:text-neutral-400
                       focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink hover:border-neutral-400
                       transition-colors duration-150"
                />
                <input
                    type="date"
                    onchange={handleDateFilter}
                    class="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm font-body
                       focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink hover:border-neutral-400
                       transition-colors duration-150"
                />
                <select
                    value={selectedManager}
                    onchange={handleManagerFilter}
                    class="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm font-body max-w-36
                       focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink hover:border-neutral-400
                       transition-colors duration-150"
                >
                    <option value="">Все менеджеры</option>
                    {#each managers as m}
                        <option value={m.id}>{m.initials || m.full_name}</option
                        >
                    {/each}
                </select>
                <select
                    value={sortByVal}
                    onchange={handleSortChange}
                    class="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm font-body
                       focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink hover:border-neutral-400
                       transition-colors duration-150"
                >
                    <option value="created_at">По созданию</option>
                    <option value="event_date">По мероприятию</option>
                </select>
            </div>
            <div class="flex items-center gap-2">
                <Button variant="secondary" size="sm" onclick={exportCSV}>
                    CSV
                </Button>
                <Button href="/orders/new">+ Создать</Button>
            </div>
        </div>

        <!-- Kanban Board -->
        <div class="p-2 sm:p-4">
            {#if kanban.loading}
                <div class="flex items-center justify-center py-20">
                    <p class="text-sm text-neutral-500 animate-pulse">
                        Загрузка заказов...
                    </p>
                </div>
            {:else if kanban.error}
                <div
                    class="flex flex-col items-center justify-center py-20 gap-3"
                >
                    <p class="text-sm text-alert">{kanban.error}</p>
                    <Button variant="secondary" onclick={() => kanban.retry()}>
                        Попробовать снова
                    </Button>
                </div>
            {:else if kanban.statuses.length === 0}
                <div
                    class="flex flex-col items-center justify-center py-20 gap-3"
                >
                    <p class="text-sm text-neutral-500">
                        Нет статусов для отображения
                    </p>
                    <Button variant="secondary" href="/orders/new"
                        >Создать первый заказ</Button
                    >
                </div>
            {:else}
                <!-- G22: Quick stats -->
                <div
                    class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4"
                >
                    <div
                        class="rounded-md bg-paper p-2.5 sm:p-3 border border-neutral-200/60 shadow-card"
                    >
                        <p class="text-2xs sm:text-xs text-neutral-500">
                            Всего
                        </p>
                        <p
                            class="text-base sm:text-lg font-display font-semibold text-ink"
                        >
                            {kanban.orders.length}
                        </p>
                    </div>
                    <div
                        class="rounded-md bg-paper p-2.5 sm:p-3 border border-neutral-200/60 shadow-card"
                    >
                        <p class="text-2xs sm:text-xs text-neutral-500">
                            В работе
                        </p>
                        <p
                            class="text-base sm:text-lg font-display font-semibold text-signal"
                        >
                            {activeOrders}
                        </p>
                    </div>
                    <div
                        class="rounded-md bg-paper p-2.5 sm:p-3 border border-neutral-200/60 shadow-card"
                    >
                        <p class="text-2xs sm:text-xs text-neutral-500">
                            За месяц
                        </p>
                        <p
                            class="text-base sm:text-lg font-display font-semibold text-ink"
                        >
                            {thisMonthOrders}
                        </p>
                    </div>
                    <div
                        class="rounded-md bg-paper p-2.5 sm:p-3 border border-neutral-200/60 shadow-card"
                    >
                        <p class="text-2xs sm:text-xs text-neutral-500">
                            Выручка
                        </p>
                        <p
                            class="text-base sm:text-lg font-display font-semibold text-mint"
                        >
                            {new Intl.NumberFormat("ru-RU").format(
                                totalRevenue,
                            )} ₽
                        </p>
                    </div>
                </div>
                <!-- Pending filter notice -->
                {#if pendingFilter}
                    <div class="flex items-center gap-2 mb-3 px-1">
                        <span class="text-sm text-signal font-medium"
                            >📋 На согласовании</span
                        >
                        <a
                            href="/"
                            class="text-xs text-neutral-400 hover:text-neutral-600 no-underline transition-colors duration-150"
                        >
                            ✕ Сбросить
                        </a>
                    </div>
                {/if}
                <KanbanBoard
                    statuses={kanban.statuses}
                    orders={filteredOrders}
                    onCardClick={handleCardClick}
                    onStatusChange={handleStatusChange}
                />
                <!-- G9: Pagination -->
                {#if kanban.hasMore && !pendingFilter}
                    <div class="flex justify-center mt-4 pb-4">
                        <Button
                            variant="secondary"
                            onclick={() => kanban.nextPage()}
                        >
                            Загрузить ещё
                        </Button>
                    </div>
                {/if}
                <div class="text-center text-xs text-neutral-400 pb-4">
                    Показано {filteredOrders.length} заказов
                </div>
            {/if}
        </div>
    {/if}
</main>
