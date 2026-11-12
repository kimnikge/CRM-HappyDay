<script lang="ts">
    /**
     * KanbanBoard — the full kanban view.
     *
     * Renders a horizontally scrollable row of KanbanColumns.
     * Manages drag-and-drop at the board level.
     *
     * Two input paths are supported:
     *   - Desktop: native HTML5 drag & drop (draggable cards -> column drop)
     *   - Touch/pen: Pointer Events fallback; the board resolves the column
     *     under the pointer via `document.elementFromPoint` and drops there.
     *
     * Props:
     *   statuses — ordered list of statuses
     *   orders — orders to render (already filtered/sorted by the caller)
     *   onStatusChange — callback when an order is dropped onto a column
     *   onCardClick — callback when a card is clicked
     */
    import { onMount } from "svelte";
    import KanbanColumn from "./KanbanColumn.svelte";

    type Status = { id: string; name: string; order_index: number };

    type Order = {
        id: string;
        status_id: string;
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
        statuses = [],
        orders = [],
        onStatusChange,
        onCardClick,
    }: {
        statuses?: Status[];
        orders?: Order[];
        onStatusChange?: (orderId: string, newStatusId: string) => void;
        onCardClick?: (orderId: string) => void;
    } = $props();

    // ---- Shared drag state (pointer fallback) ----
    let dragOrderId = $state<string | null>(null);
    let dragOverStatusId = $state<string | null>(null);

    /** Click events fired right after a drop must not navigate to the order. */
    let suppressClickUntil = 0;

    function ordersForStatus(statusId: string): Order[] {
        return orders.filter((o) => o.status_id === statusId);
    }

    function handleDrop(orderId: string, newStatusId: string) {
        const order = orders.find((o) => o.id === orderId);
        if (!order || order.status_id === newStatusId) return;
        onStatusChange?.(orderId, newStatusId);
    }

    /** Resolve the kanban column under a viewport point. */
    function statusIdUnderPoint(x: number, y: number): string | null {
        if (typeof document === "undefined") return null;
        const el = document.elementFromPoint(x, y);
        const column = el?.closest("[data-status-id]") as HTMLElement | null;
        return column?.dataset.statusId ?? null;
    }

    function beginDrag(orderId: string) {
        dragOrderId = orderId;
        dragOverStatusId = null;
    }

    function moveDrag(_orderId: string, clientX: number, clientY: number) {
        if (!dragOrderId) return;
        const next = statusIdUnderPoint(clientX, clientY);
        if (next !== dragOverStatusId) {
            dragOverStatusId = next;
        }
    }

    function finishDrag(orderId: string, clientX: number, clientY: number) {
        const wasDragging = dragOrderId !== null;
        const target = statusIdUnderPoint(clientX, clientY);
        dragOrderId = null;
        dragOverStatusId = null;
        document.body.style.userSelect = "";
        if (!wasDragging) return;
        // A real drag happened — swallow the synthetic click that follows.
        suppressClickUntil = Date.now() + 400;
        if (target) handleDrop(orderId, target);
    }

    function cancelDrag() {
        dragOrderId = null;
        dragOverStatusId = null;
        if (typeof document !== "undefined") {
            document.body.style.userSelect = "";
        }
    }

    function handleCardClick(orderId: string) {
        if (Date.now() < suppressClickUntil) return;
        onCardClick?.(orderId);
    }

    onMount(() => {
        function onKeydown(e: KeyboardEvent) {
            if (e.key === "Escape" && dragOrderId) cancelDrag();
        }
        window.addEventListener("keydown", onKeydown);
        return () => window.removeEventListener("keydown", onKeydown);
    });
</script>

<div
    class="flex gap-2 sm:gap-4 overflow-x-auto pb-2 snap-x snap-mandatory -mx-2 sm:mx-0 px-2 sm:px-0"
    role="region"
    aria-label="Канбан-доска заказов"
    aria-roledescription="kanban board"
>
    {#each statuses as status (status.id)}
        <KanbanColumn
            {status}
            orders={ordersForStatus(status.id)}
            onCardClick={handleCardClick}
            onDrop={handleDrop}
            draggingOrderId={dragOrderId}
            isDropTarget={dragOverStatusId === status.id}
            onDragBegin={beginDrag}
            onDragMove={moveDrag}
            onDragEnd={finishDrag}
            onDragCancel={cancelDrag}
        />
    {/each}

    <!-- Empty state when no columns -->
    {#if statuses.length === 0}
        <div
            class="flex items-center justify-center w-full py-12 text-sm text-neutral-400"
        >
            Нет колонок для отображения
        </div>
    {/if}
</div>
