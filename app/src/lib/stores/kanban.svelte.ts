/*
    Kanban store — reactive state for the dashboard.
    Handles: polling, optimistic updates, debounced search,
    request deduplication, error/retry, visibility-aware polling.

    Usage:
      import { kanban } from '$lib/stores/kanban.svelte';
      kanban.load();
      kanban.startPolling();
      kanban.changeStatus(orderId, newStatusId);
*/
import { browser } from "$app/environment";
import { supabase } from "$lib/supabase";
import { POLLING_INTERVAL_MS } from "$lib/config";

type Status = { id: string; name: string; order_index: number };

/** Embedded client info + the client's total order count (nested aggregate). */
type ClientAggregate = {
    id?: string | null;
    name?: string | null;
    /** PostgREST returns aggregates as an array: [{ count: N }]. */
    orders?: { count: number }[] | null;
};

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
    is_important?: boolean | null;
    /** Flattened client order count — see `withClientOrderCount`. */
    client_orders_count?: number;
    clients?: ClientAggregate | null;
    profiles?: { initials?: string | null; full_name?: string | null } | null;
};

/**
 * Columns selected for every orders query (initial load and polling).
 * `clients(id, name, orders(count))` is a single nested aggregate: it returns
 * the client's total order count inline, so no second request is needed.
 */
const ORDER_COLUMNS =
    "id, status_id, order_number, company_name, contact_person, event_date, start_time, guest_count, format, total_cost, is_important, manager_id, clients(id, name, orders(count)), profiles!orders_manager_id_fkey(initials, full_name)";

/**
 * Flatten the nested aggregate into `client_orders_count`.
 * Defensive: `clients` can be null (no client / hidden by RLS) and
 * `clients.orders` can be missing or empty.
 */
function withClientOrderCount(order: Order): Order {
    return {
        ...order,
        client_orders_count: order.clients?.orders?.[0]?.count ?? 0,
    };
}

function isAbortError(err: any): boolean {
    return (
        err?.name === "AbortError" ||
        err?.code === "ABORT_ERR" ||
        err?.message === "Aborted"
    );
}

class KanbanStore {
    statuses = $state<Status[]>([]);
    orders = $state<Order[]>([]);
    loading = $state(true);
    error = $state<string | null>(null);
    search = $state("");
    dateFilter = $state("");
    managerFilter = $state(""); // G6: filter by manager
    sortBy = $state<"created_at" | "event_date">("created_at"); // G7: sort
    page = $state(0); // G9: pagination (0-based)
    pageSize = $state(50);
    totalCount = $state(0);
    hasMore = $state(false);
    /** Last status-change failure, rendered by the dashboard toolbar. */
    statusError = $state<string | null>(null);
    /** Current authenticated user id — required by the atomic status RPC. */
    currentUserId = $state<string | null>(null);

    private pollingTimer: ReturnType<typeof setInterval> | null = null;
    private fetchController: AbortController | null = null;
    private searchTimer: ReturnType<typeof setTimeout> | null = null;
    private visibilityHandler: (() => void) | null = null;

    /** Set of order IDs with pending optimistic updates — polling skips these */
    private optimisticPending = new Set<string>();

    async load(): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session) {
                this.loading = false;
                return;
            }
            this.currentUserId = session.user.id;

            const [stRes] = await Promise.all([
                supabase.from("statuses").select("*").order("order_index"),
                this.fetchOrders(),
            ]);

            if (stRes.error) throw stRes.error;
            this.statuses = stRes.data ?? [];
        } catch (err: any) {
            if (!isAbortError(err)) {
                this.error = err?.message || "Не удалось загрузить данные";
                console.error("[Kanban] load failed:", err);
            }
        } finally {
            this.loading = false;
        }
    }

    /**
     * Single query builder shared by the initial load, filter/sort changes,
     * pagination and polling. It applies every active filter plus the
     * currently loaded row window, so polling never drops filters and never
     * falls back to "all orders" (which used to make search results vanish).
     */
    private buildOrdersQuery(controller: AbortController, lastRow: number) {
        let query = supabase
            .from("orders")
            .select(ORDER_COLUMNS, { count: "exact" })
            .order(this.sortBy, { ascending: this.sortBy === "event_date" })
            .abortSignal(controller.signal);

        // G10: search includes order_number
        if (this.search) {
            const term = `%${this.search}%`;
            const isNumeric = /^\d+$/.test(this.search);
            query = isNumeric
                ? query.or(
                      `company_name.ilike.${term},contact_person.ilike.${term},order_number.eq.${parseInt(this.search, 10)}`,
                  )
                : query.or(
                      `company_name.ilike.${term},contact_person.ilike.${term}`,
                  );
        }
        if (this.dateFilter) {
            query = query.eq("event_date", this.dateFilter);
        }
        // G6: filter by manager
        if (this.managerFilter) {
            query = query.eq("manager_id", this.managerFilter);
        }

        // G9: load every row up to the current page (0-based window)
        return query.range(0, lastRow);
    }

    /** Merge fresh server rows with pending optimistic status changes. */
    private mergeOptimistic(fresh: Order[]): Order[] {
        if (this.optimisticPending.size === 0) return fresh;
        return fresh.map((o) => {
            if (!this.optimisticPending.has(o.id)) return o;
            const local = this.orders.find((lo) => lo.id === o.id);
            return local ? { ...o, status_id: local.status_id } : o;
        });
    }

    /** Fetch the filtered/sorted window and replace `orders` with it. */
    private async fetchOrders(): Promise<void> {
        // Cancel previous in-flight request
        if (this.fetchController) {
            this.fetchController.abort();
        }
        const controller = new AbortController();
        this.fetchController = controller;

        try {
            const lastRow = this.page * this.pageSize + this.pageSize - 1;
            const query = this.buildOrdersQuery(controller, lastRow);

            const { data, count, error } = await query;
            if (error) throw error;

            this.totalCount = count ?? 0;
            this.hasMore = this.totalCount > lastRow + 1;
            // mergeOptimistic is unchanged; the flattened repeat-client count
            // is derived afterwards so the UI reads a plain number.
            this.orders = this.mergeOptimistic((data as Order[]) ?? []).map(
                withClientOrderCount,
            );
            this.error = null;
        } catch (err: any) {
            if (isAbortError(err)) {
                // Request was cancelled by a newer one — keep current state.
                return;
            }
            throw err;
        } finally {
            if (this.fetchController === controller) {
                this.fetchController = null;
            }
        }
    }

    /** Read the current user id once (needed for the atomic status RPC). */
    private async resolveUserId(): Promise<string | null> {
        if (this.currentUserId) return this.currentUserId;
        const {
            data: { session },
        } = await supabase.auth.getSession();
        this.currentUserId = session?.user?.id ?? null;
        return this.currentUserId;
    }

    /** Optimistic status change — atomic update via PostgreSQL RPC. */
    async changeStatus(
        orderId: string,
        newStatusId: string,
    ): Promise<boolean> {
        const order = this.orders.find((o) => o.id === orderId);
        if (!order || order.status_id === newStatusId) return false;

        const oldStatusId = order.status_id;
        this.statusError = null;

        // Mark as pending — polling won't overwrite
        this.optimisticPending.add(orderId);

        // Optimistic update
        order.status_id = newStatusId;
        this.orders = [...this.orders];

        try {
            const userId = await this.resolveUserId();
            if (!userId) {
                throw new Error("Сессия истекла — войдите заново");
            }

            // The RPC updates the order and writes status_history atomically.
            const { error } = await supabase.rpc("change_order_status", {
                p_order_id: orderId,
                p_new_status_id: newStatusId,
                p_user_id: userId,
                p_comment: null,
            });
            if (error) throw error;

            return true;
        } catch (err: any) {
            // Rollback
            const current = this.orders.find((o) => o.id === orderId);
            if (current) current.status_id = oldStatusId;
            this.orders = [...this.orders];
            this.statusError =
                err?.message || "Не удалось изменить статус заказа";
            console.error("[Kanban] changeStatus failed:", err);
            return false;
        } finally {
            this.optimisticPending.delete(orderId);
        }
    }

    /** Clear the last status-change error (e.g. when dismissing it). */
    clearStatusError() {
        this.statusError = null;
    }

    // ---- Polling (visibility-aware) ----

    startPolling() {
        if (!browser) return;
        if (this.pollingTimer) return;

        // Polling reuses the filtered query builder, so search/date/manager
        // filters and the loaded page window are preserved on every tick.
        this.pollingTimer = setInterval(() => {
            if (document.visibilityState === "visible") {
                this.fetchOrders().catch((err) => {
                    console.error("[Kanban] poll failed:", err);
                });
            }
        }, POLLING_INTERVAL_MS);

        // Stop polling when tab is hidden, resume when visible
        this.visibilityHandler = () => {
            if (document.visibilityState === "visible") {
                this.fetchOrders().catch(() => {});
            }
        };
        document.addEventListener("visibilitychange", this.visibilityHandler);
    }

    stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
        if (this.visibilityHandler) {
            document.removeEventListener(
                "visibilitychange",
                this.visibilityHandler,
            );
            this.visibilityHandler = null;
        }
    }

    // ---- Search (debounced) ----

    private scheduleFilterFetch(delay: number, errorMessage: string) {
        // A filter change invalidates the loaded page window right away, so a
        // poll that fires during the debounce already uses page 0.
        this.page = 0;
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => {
            this.fetchOrders().catch((err) => {
                this.error = err?.message || errorMessage;
            });
        }, delay);
    }

    setSearch(term: string) {
        this.search = term;
        this.scheduleFilterFetch(300, "Ошибка поиска");
    }

    setDateFilter(date: string) {
        this.dateFilter = date;
        this.scheduleFilterFetch(100, "Ошибка фильтрации");
    }

    // G6: filter by responsible manager
    setManagerFilter(managerId: string) {
        this.managerFilter = managerId;
        this.page = 0;
        this.fetchOrders().catch((err) => {
            this.error = err?.message || "Ошибка фильтрации";
        });
    }

    // G7: change sort order
    setSortBy(sort: "created_at" | "event_date") {
        this.sortBy = sort;
        this.page = 0;
        this.fetchOrders().catch((err) => {
            this.error = err?.message || "Ошибка сортировки";
        });
    }

    // G9: Pagination — reload the whole loaded window (0..page*pageSize-1)
    async nextPage() {
        if (!this.hasMore) return;
        const previousPage = this.page;
        this.page = previousPage + 1;
        try {
            await this.fetchOrders();
        } catch (err: any) {
            this.page = previousPage;
            this.error = err?.message || "Ошибка загрузки";
        }
    }

    /** Manual retry after error */
    retry() {
        this.load();
    }

    destroy() {
        this.stopPolling();
        if (this.searchTimer) clearTimeout(this.searchTimer);
        if (this.fetchController) this.fetchController.abort();
    }
}

export const kanban = new KanbanStore();
