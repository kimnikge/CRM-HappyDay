<script lang="ts">
    /**
     * KanbanCard — miniature order card on the dashboard.
     *
     * Displays: company name, contact person, event date/time,
     * guest count, format tag, total cost, urgent indicator,
     * manager initials.
     *
     * Draggable by default. Left accent bar via `.format-dot`.
     */
    import Tag from "$lib/components/ui/Tag.svelte";
    import { CURRENCY_LOCALE, CURRENCY_SUFFIX } from "$lib/config";

    let {
        order,
        onClick,
        draggable = true,
    }: {
        order: {
            id: string;
            order_number: number;
            company_name: string;
            contact_person?: string | null;
            event_date?: string | null;
            start_time?: string | null;
            guest_count?: number | null;
            format?: string | null;
            total_cost?: number | null;
            is_important?: boolean | null; // G13
            profiles?: {
                initials?: string | null;
                full_name?: string | null;
            } | null;
        };
        onClick?: (id: string) => void;
        draggable?: boolean;
    } = $props();

    const initials = $derived(
        order.profiles?.initials || order.profiles?.full_name?.charAt(0) || "?",
    );

    function fmtCurrency(n: number | null | undefined): string {
        if (n == null) return "—";
        return (
            new Intl.NumberFormat(CURRENCY_LOCALE).format(n) + CURRENCY_SUFFIX
        );
    }

    function fmtDate(d: string | null | undefined): string {
        if (!d) return "";
        const date = new Date(d);
        return date.toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "short",
        });
    }

    function isUrgent(eventDate: string | null | undefined): boolean {
        if (!eventDate) return false;
        const d = new Date(eventDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const event = new Date(d);
        event.setHours(0, 0, 0, 0);
        return event <= tomorrow && event >= today;
    }

    function handleClick() {
        onClick?.(order.id);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
        }
    }

    function dragStart(e: DragEvent) {
        if (!draggable) return;
        e.dataTransfer?.setData("text/plain", order.id);
        e.dataTransfer!.effectAllowed = "move";
    }

    function getFormatDotClass(fmt: string | null | undefined): string {
        if (!fmt) return "bg-format-default";
        const map: Record<string, string> = {
            банкет: "bg-format-banquet",
            фуршет: "bg-format-furshet",
            "кофе-брейк": "bg-format-coffee",
            коктейль: "bg-format-cocktail",
            буфет: "bg-format-buffet",
        };
        return map[fmt.toLowerCase()] ?? "bg-format-default";
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<button
    class="kanban-card group relative flex w-full cursor-pointer overflow-hidden rounded-md bg-paper text-left shadow-card transition-shadow duration-200 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 border-0 p-0"
    {draggable}
    ondragstart={dragStart}
    onclick={handleClick}
    onkeydown={handleKeydown}
>
    <!-- Left accent bar (format color) -->
    <span
        class={`format-dot ${getFormatDotClass(order.format)}`}
        aria-hidden="true"
    ></span>

    <div class="flex-1 p-3">
        <!-- Top row: company + urgent -->
        <div class="flex items-start justify-between gap-2 mb-1">
            <span class="text-sm font-semibold text-ink leading-tight truncate">
                {order.company_name}
            </span>
            {#if isUrgent(order.event_date)}
                <span
                    class="shrink-0 text-signal animate-pulse"
                    title="Срочно: мероприятие сегодня или завтра"
                    aria-label="Срочный заказ">⚡</span
                >
            {/if}
            {#if order.is_important}
                <span
                    class="shrink-0"
                    title="Важный заказ"
                    aria-label="Важный заказ">⭐</span
                >
            {/if}
        </div>

        <!-- Contact person -->
        {#if order.contact_person}
            <p class="text-xs text-neutral-500 truncate mb-1.5">
                {order.contact_person}
            </p>
        {/if}

        <!-- Date + guest count row -->
        <div class="flex items-center gap-3 text-xs text-neutral-600 mb-2">
            {#if order.event_date}
                <span class="font-mono tabular-nums">
                    {fmtDate(order.event_date)}{order.start_time
                        ? ` ${order.start_time.slice(0, 5)}`
                        : ""}
                </span>
            {/if}
            {#if order.guest_count}
                <span class="font-mono tabular-nums"
                    >{order.guest_count} чел.</span
                >
            {/if}
        </div>

        <!-- Bottom row: format tag + cost + manager -->
        <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
                {#if order.format}
                    <Tag format={order.format}>{order.format}</Tag>
                {/if}
            </div>
            <div class="flex items-center gap-2 shrink-0">
                {#if order.total_cost != null}
                    <span
                        class="text-xs font-semibold text-ink font-mono tabular-nums"
                    >
                        {fmtCurrency(order.total_cost)}
                    </span>
                {/if}
                <span
                    class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-600"
                    title={order.profiles?.full_name ?? "Менеджер"}
                >
                    {initials}
                </span>
            </div>
        </div>
    </div>
</button>
