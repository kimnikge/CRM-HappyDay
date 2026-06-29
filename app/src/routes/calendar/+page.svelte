<script lang="ts">
    import { onMount } from "svelte";
    import { supabase } from "$lib/supabase";
    import { goto } from "$app/navigation";
    import Header from "$lib/components/Header.svelte";
    import Button from "$lib/components/ui/Button.svelte";

    let orders = $state<any[]>([]);
    let loading = $state(true);
    let currentDate = $state(new Date());
    let weeks = $state<(number | null)[][]>([]);
    let viewMode = $state<"grid" | "list">("grid");
    let isMobile = $state(false);

    const year = $derived(currentDate.getFullYear());
    const month = $derived(currentDate.getMonth());

    const monthName = $derived(
        currentDate.toLocaleDateString("ru-RU", {
            month: "long",
            year: "numeric",
        }),
    );

    const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const dayNamesShort = ["П", "В", "С", "Ч", "П", "С", "В"];

    function buildCalendar(y: number, m: number): (number | null)[][] {
        const firstDay = new Date(y, m, 1);
        const lastDay = new Date(y, m + 1, 0);
        const startOffset = (firstDay.getDay() + 6) % 7;

        const days: (number | null)[] = [];
        for (let i = 0; i < startOffset; i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);

        const result: (number | null)[][] = [];
        for (let i = 0; i < days.length; i += 7) {
            result.push(days.slice(i, i + 7));
        }
        return result;
    }

    // Group orders by date for list view
    const groupedOrders = $derived.by(() => {
        const map = new Map<string, typeof orders>();
        for (const o of orders) {
            const key = o.event_date || "—";
            const arr = map.get(key) ?? [];
            arr.push(o);
            map.set(key, arr);
        }
        // Sort by date
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    });

    $effect(() => {
        weeks = buildCalendar(year, month);
    });

    function ordersForDay(day: number) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return orders.filter((o) => o.event_date === dateStr);
    }

    function isToday(day: number): boolean {
        return (
            new Date(year, month, day).toDateString() ===
            new Date().toDateString()
        );
    }

    function dayName(day: number): string {
        const d = new Date(year, month, day);
        return d.toLocaleDateString("ru-RU", { weekday: "short" });
    }

    function prevMonth() {
        currentDate = new Date(year, month - 1, 1);
    }
    function nextMonth() {
        currentDate = new Date(year, month + 1, 1);
    }

    async function load() {
        loading = true;
        const from = `${year}-${String(month).padStart(2, "0")}-01`;
        const to = `${year}-${String(month + 2).padStart(2, "0")}-01`;
        const { data } = await supabase
            .from("orders")
            .select(
                "id, order_number, company_name, event_date, format, guest_count, status_id, profiles!orders_manager_id_fkey(initials)",
            )
            .gte("event_date", from)
            .lt("event_date", to)
            .order("event_date");
        orders = data ?? [];
        loading = false;
    }

    function openOrder(id: string) {
        goto(`/orders/${id}`);
    }

    function checkMobile() {
        isMobile = typeof window !== "undefined" && window.innerWidth < 640;
    }

    onMount(() => {
        checkMobile();
        window.addEventListener("resize", checkMobile);
        load();
        return () => window.removeEventListener("resize", checkMobile);
    });

    $effect(() => {
        month;
        year;
        load();
    });
</script>

<main class="min-h-screen bg-neutral-50">
    <Header />

    <div class="mx-auto max-w-5xl px-3 sm:px-6 py-4 sm:py-6">
        <div
            class="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
            <div>
                <h2
                    class="text-lg sm:text-xl font-display font-semibold text-ink"
                >
                    Календарь мероприятий
                </h2>
                <p class="text-xs sm:text-sm text-neutral-500">
                    {orders.length} заказов
                </p>
            </div>
            <div
                class="flex items-center justify-between sm:justify-end gap-2 sm:gap-3"
            >
                <!-- View toggle (mobile) -->
                <div class="flex rounded-md bg-neutral-100 p-0.5 sm:hidden">
                    <button
                        class="rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 border-0 cursor-pointer
                            {viewMode === 'grid'
                            ? 'bg-paper text-ink shadow-sm'
                            : 'text-neutral-500'}"
                        onclick={() => (viewMode = "grid")}>📅</button
                    >
                    <button
                        class="rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 border-0 cursor-pointer
                            {viewMode === 'list'
                            ? 'bg-paper text-ink shadow-sm'
                            : 'text-neutral-500'}"
                        onclick={() => (viewMode = "list")}>📋</button
                    >
                </div>

                <Button variant="secondary" size="sm" onclick={prevMonth}
                    >←</Button
                >
                <span
                    class="text-xs sm:text-sm font-medium text-ink capitalize text-center min-w-28 sm:min-w-35"
                >
                    {monthName}
                </span>
                <Button variant="secondary" size="sm" onclick={nextMonth}
                    >→</Button
                >
                <Button variant="secondary" size="sm" href="/">Канбан</Button>
            </div>
        </div>

        {#if loading}
            <p class="text-sm text-neutral-400 py-10 text-center">
                Загрузка...
            </p>
        {:else}
            <!-- List view (mobile default) -->
            {#if viewMode === "list"}
                <div class="space-y-1 sm:hidden">
                    {#if groupedOrders.length === 0}
                        <p class="text-sm text-neutral-400 py-10 text-center">
                            Нет мероприятий в этом месяце
                        </p>
                    {:else}
                        {#each groupedOrders as [dateStr, dayOrders]}
                            {@const d =
                                dateStr === "—" ? null : new Date(dateStr)}
                            <div
                                class="rounded-md bg-paper border border-neutral-200/60 shadow-card overflow-hidden"
                            >
                                <div
                                    class="flex items-center gap-2 px-3 py-2 bg-neutral-100 border-b border-neutral-200"
                                >
                                    <span
                                        class="text-xs font-semibold text-ink"
                                    >
                                        {d
                                            ? d.toLocaleDateString("ru-RU", {
                                                  day: "numeric",
                                                  month: "long",
                                                  weekday: "short",
                                              })
                                            : "Без даты"}
                                    </span>
                                    <span
                                        class="text-2xs text-neutral-500 font-mono"
                                        >{dayOrders.length} заказа</span
                                    >
                                </div>
                                {#each dayOrders as o}
                                    <button
                                        class="block w-full text-left px-3 py-2.5 border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-colors duration-100 border-0 bg-transparent cursor-pointer"
                                        onclick={() => openOrder(o.id)}
                                    >
                                        <div
                                            class="flex items-center justify-between gap-2"
                                        >
                                            <span
                                                class="text-sm font-medium text-ink truncate"
                                                >{o.company_name}</span
                                            >
                                            <span
                                                class="text-xs text-neutral-500 shrink-0"
                                            >
                                                {o.guest_count
                                                    ? `${o.guest_count}ч`
                                                    : ""}
                                                {o.format
                                                    ? ` · ${o.format}`
                                                    : ""}
                                            </span>
                                        </div>
                                    </button>
                                {/each}
                            </div>
                        {/each}
                    {/if}
                </div>
            {/if}

            <!-- Grid view (desktop + mobile grid toggle) -->
            <div
                class:hidden={isMobile && viewMode === "list"}
                class="sm:block"
            >
                <div
                    class="rounded-md bg-paper border border-neutral-200/60 shadow-card overflow-hidden"
                >
                    <!-- Day headers -->
                    <div
                        class="grid grid-cols-7 border-b border-neutral-200 bg-neutral-100"
                    >
                        {#each isMobile ? dayNamesShort : dayNames as day}
                            <div
                                class="px-1 sm:px-2 py-1.5 sm:py-2 text-center text-2xs sm:text-xs font-medium text-neutral-500"
                            >
                                {day}
                            </div>
                        {/each}
                    </div>

                    <!-- Weeks -->
                    {#each weeks as week}
                        <div
                            class="grid grid-cols-7 border-b border-neutral-100 last:border-0"
                        >
                            {#each week as day}
                                {#if day === null}
                                    <div
                                        class="min-h-16 sm:min-h-24 p-0.5 sm:p-1 bg-neutral-50/50"
                                    ></div>
                                {:else}
                                    {@const dayOrders = ordersForDay(day)}
                                    <div
                                        class="min-h-16 sm:min-h-24 p-0.5 sm:p-1 border-l border-neutral-100 first:border-l-0
                                        {isToday(day) ? 'bg-signal/5' : ''}"
                                    >
                                        <span
                                            class="block text-2xs sm:text-xs font-medium px-0.5 sm:px-1 py-0.5 mb-0.5
                                            {isToday(day)
                                                ? 'text-signal font-bold'
                                                : 'text-neutral-600'}"
                                        >
                                            {day}
                                        </span>
                                        {#each dayOrders.slice(0, isMobile ? 2 : 3) as o}
                                            <button
                                                class="block w-full text-left text-[10px] sm:text-[11px] leading-tight truncate px-0.5 sm:px-1 py-0.5 mb-0.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border-0 cursor-pointer transition-colors duration-100"
                                                onclick={() => openOrder(o.id)}
                                            >
                                                {isMobile
                                                    ? o.company_name.slice(
                                                          0,
                                                          12,
                                                      ) +
                                                      (o.company_name.length >
                                                      12
                                                          ? "…"
                                                          : "")
                                                    : o.company_name}
                                                {#if o.guest_count}
                                                    <span
                                                        class="text-neutral-400 ml-0.5"
                                                        >{o.guest_count}ч</span
                                                    >
                                                {/if}
                                            </button>
                                        {/each}
                                        {#if dayOrders.length > (isMobile ? 2 : 3)}
                                            <span
                                                class="text-[9px] sm:text-[10px] text-neutral-400 px-0.5 sm:px-1"
                                            >
                                                +{dayOrders.length -
                                                    (isMobile ? 2 : 3)}
                                            </span>
                                        {/if}
                                    </div>
                                {/if}
                            {/each}
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</main>
