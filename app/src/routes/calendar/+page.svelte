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

    const year = $derived(currentDate.getFullYear());
    const month = $derived(currentDate.getMonth());

    const monthName = $derived(
        currentDate.toLocaleDateString("ru-RU", {
            month: "long",
            year: "numeric",
        }),
    );

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

    $effect(() => {
        weeks = buildCalendar(year, month);
    });

    function ordersForDay(day: number) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return orders.filter((o) => o.event_date === dateStr);
    }

    function prevMonth() {
        currentDate = new Date(year, month - 1, 1);
    }
    function nextMonth() {
        currentDate = new Date(year, month + 1, 1);
    }

    async function load() {
        loading = true;
        // Load orders for current and adjacent months
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

    onMount(load);
    // Reload when month changes
    $effect(() => {
        month;
        year;
        load();
    });
</script>

<main class="min-h-screen bg-neutral-50">
    <Header />

    <div class="mx-auto max-w-5xl p-6">
        <div class="mb-6 flex items-center justify-between">
            <div>
                <h2 class="text-xl font-display font-semibold text-ink">
                    Календарь мероприятий
                </h2>
                <p class="text-sm text-neutral-500">{orders.length} заказов</p>
            </div>
            <div class="flex items-center gap-3">
                <Button variant="secondary" size="sm" onclick={prevMonth}
                    >←</Button
                >
                <span
                    class="text-sm font-medium text-ink capitalize min-w-35 text-center"
                    >{monthName}</span
                >
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
            <div
                class="rounded-md bg-paper border border-neutral-200/60 shadow-card overflow-hidden"
            >
                <!-- Day headers -->
                <div
                    class="grid grid-cols-7 border-b border-neutral-200 bg-neutral-100"
                >
                    {#each ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as day}
                        <div
                            class="px-2 py-2 text-center text-xs font-medium text-neutral-500"
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
                                    class="min-h-24 p-1 bg-neutral-50/50"
                                ></div>
                            {:else}
                                {@const dayOrders = ordersForDay(day)}
                                <div
                                    class="min-h-24 p-1 border-l border-neutral-100 first:border-l-0
                                    {new Date(
                                        year,
                                        month,
                                        day,
                                    ).toDateString() ===
                                    new Date().toDateString()
                                        ? 'bg-signal/5'
                                        : ''}"
                                >
                                    <span
                                        class="block text-xs font-medium px-1 py-0.5 mb-0.5
                                        {new Date(
                                            year,
                                            month,
                                            day,
                                        ).toDateString() ===
                                        new Date().toDateString()
                                            ? 'text-signal font-bold'
                                            : 'text-neutral-600'}"
                                    >
                                        {day}
                                    </span>
                                    {#each dayOrders.slice(0, 3) as o}
                                        <button
                                            class="block w-full text-left text-[11px] leading-tight truncate px-1 py-0.5 mb-0.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border-0 cursor-pointer transition-colors duration-100"
                                            onclick={() => openOrder(o.id)}
                                        >
                                            {o.company_name}
                                            {#if o.guest_count}
                                                <span
                                                    class="text-neutral-400 ml-1"
                                                    >{o.guest_count}ч</span
                                                >
                                            {/if}
                                        </button>
                                    {/each}
                                    {#if dayOrders.length > 3}
                                        <span
                                            class="text-[10px] text-neutral-400 px-1"
                                            >+{dayOrders.length - 3}</span
                                        >
                                    {/if}
                                </div>
                            {/if}
                        {/each}
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</main>
