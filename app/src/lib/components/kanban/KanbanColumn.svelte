<script lang="ts">
    /**
     * KanbanColumn — single status column on the dashboard.
     *
     * Renders a header (name + count + total sum) and a list of KanbanCards.
     * Accepts drop events for drag-and-drop status change (HTML5 on desktop,
     * Pointer Events fallback on touch — both resolved by the board).
     */
    import KanbanCard from "./KanbanCard.svelte";
    import { CURRENCY_LOCALE, CURRENCY_SUFFIX } from "$lib/config";

    type Order = {
        id: string;
        order_number: number;
        company_name: string;
        contact_person?: string | null;
        event_date?: string | null;
        start_time?: string | null;
        guest_count?: number | null;
        format?: string | null;
        total_cost?: number | null;
        profiles?: {
            initials?: string | null;
            full_name?: string | null;
        } | null;
    };

    let {
        status,
        orders,
        onCardClick,
        onDrop,
        draggingOrderId = null,
        isDropTarget = false,
        onDragBegin,
        onDragMove,
        onDragEnd,
        onDragCancel,
    }: {
        status: { id: string; name: string; order_index: number };
        orders: Order[];
        onCardClick?: (orderId: string) => void;
        onDrop?: (orderId: string, newStatusId: string) => void;
        /** Id of the order currently dragged with pointer events, if any. */
        draggingOrderId?: string | null;
        /** True when a pointer drag hovers over this column. */
        isDropTarget?: boolean;
        onDragBegin?: (orderId: string) => void;
        onDragMove?: (orderId: string, clientX: number, clientY: number) => void;
        onDragEnd?: (orderId: string, clientX: number, clientY: number) => void;
        onDragCancel?: () => void;
    } = $props();

    const tempClasses: Record<number, string> = {
        0: "col-temp-draft",
        1: "col-temp-review",
        2: "col-temp-confirmed",
        3: "col-temp-inprogress",
        4: "col-temp-dispatch",
        5: "col-temp-done",
        6: "col-temp-cancelled",
    };

    function tempClass(index: number): string {
        return tempClasses[index] ?? "col-temp-draft";
    }

    function totalSum(): number {
        return orders.reduce((s, o) => s + (Number(o.total_cost) || 0), 0);
    }

    function fmtCurrency(n: number): string {
        return (
            new Intl.NumberFormat(CURRENCY_LOCALE).format(n) + CURRENCY_SUFFIX
        );
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        const orderId = e.dataTransfer?.getData("text/plain");
        if (orderId) onDrop?.(orderId, status.id);
    }

    function handleDragEnter(e: DragEvent) {
        e.preventDefault();
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="kanban-col flex w-64 sm:w-72 shrink-0 snap-start flex-col rounded-md bg-neutral-100 shadow-column transition-shadow duration-150 {tempClass(
        status.order_index,
    )} {isDropTarget ? 'ring-2 ring-inset ring-signal' : ''}"
    data-status-id={status.id}
    ondragover={handleDragOver}
    ondragenter={handleDragEnter}
    ondrop={handleDrop}
>
    <!-- Column header -->
    <div
        class="flex items-center justify-between px-2.5 sm:px-3 pt-2.5 sm:pt-3 pb-1.5 sm:pb-2"
    >
        <span class="text-xs sm:text-sm font-semibold text-neutral-700">
            {status.name}
        </span>
        <div class="flex items-center gap-1.5 sm:gap-2 text-right">
            <span
                class="inline-flex items-center justify-center rounded-full bg-neutral-300 px-1.5 sm:px-2 py-0.5 text-2xs sm:text-xs font-bold text-neutral-600 font-mono tabular-nums min-w-5 sm:min-w-6"
            >
                {orders.length}
            </span>
            <span
                class="text-2xs sm:text-xs text-neutral-500 font-mono tabular-nums"
            >
                {fmtCurrency(totalSum())}
            </span>
        </div>
    </div>

    <!-- Cards -->
    <div class="flex flex-col gap-2 px-2 pb-2 min-h-16">
        {#each orders as order (order.id)}
            <KanbanCard
                {order}
                onClick={onCardClick}
                dragging={draggingOrderId === order.id}
                {onDragBegin}
                {onDragMove}
                {onDragEnd}
                {onDragCancel}
            />
        {/each}
        {#if orders.length === 0}
            <p
                class="px-2 py-4 text-center text-xs text-neutral-400 select-none"
            >
                Нет заказов
            </p>
        {/if}
    </div>
</div>
