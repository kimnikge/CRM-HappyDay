<script lang="ts">
    /**
     * KanbanBoard — the full kanban view.
     *
     * Renders a horizontally scrollable row of KanbanColumns.
     * Manages drag-and-drop at the board level.
     *
     * Props:
     *   statuses — ordered list of statuses
     *   getOrders — function returning orders for a given status id
     *   onStatusChange — callback when an order is dropped onto a column
     *   onCardClick — callback when a card is clicked
     */
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

    function ordersForStatus(statusId: string): Order[] {
        return orders.filter((o) => o.status_id === statusId);
    }

    function handleDrop(orderId: string, newStatusId: string) {
        const order = orders.find((o) => o.id === orderId);
        if (!order || order.status_id === newStatusId) return;
        onStatusChange?.(orderId, newStatusId);
    }
</script>

<div
    class="flex gap-4 overflow-x-auto pb-2"
    role="region"
    aria-label="Канбан-доска заказов"
    aria-roledescription="kanban board"
>
    {#each statuses as status (status.id)}
        <KanbanColumn
            {status}
            orders={ordersForStatus(status.id)}
            {onCardClick}
            onDrop={handleDrop}
        />
    {/each}
</div>
