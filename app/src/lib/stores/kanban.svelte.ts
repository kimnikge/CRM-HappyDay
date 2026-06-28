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
        profiles?: { initials?: string | null; full_name?: string | null } | null;
    };

    class KanbanStore {
        statuses = $state<Status[]>([]);
        orders = $state<Order[]>([]);
        loading = $state(true);
        error = $state<string | null>(null);
        search = $state("");
        dateFilter = $state("");
        managerFilter = $state("");         // G6: filter by manager
        sortBy = $state<"created_at" | "event_date">("created_at"); // G7: sort
        page = $state(0);                   // G9: pagination (0-based)
        pageSize = $state(50);
        totalCount = $state(0);
        hasMore = $state(false);

        private pollingTimer: ReturnType<typeof setInterval> | null = null;
        private fetchController: AbortController | null = null;
        private fetchPromise: Promise<Order[]> | null = null;
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

                const [stRes, ordRes] = await Promise.all([
                    supabase.from("statuses").select("*").order("order_index"),
                    this.fetchOrders(),
                ]);

                if (stRes.error) throw stRes.error;
                this.statuses = stRes.data ?? [];
                this.orders = ordRes;
            } catch (err: any) {
                this.error = err?.message || "Не удалось загрузить данные";
                console.error("[Kanban] load failed:", err);
            } finally {
                this.loading = false;
            }
        }

        /** Fetch orders with deduplication — cancels previous in-flight request */
        private async fetchOrders(): Promise<Order[]> {
            // Cancel previous in-flight request
            if (this.fetchController) {
                this.fetchController.abort();
            }
            this.fetchController = new AbortController();

            try {
                let query = supabase
                    .from("orders")
                    .select(
                        "id, status_id, order_number, company_name, contact_person, event_date, start_time, guest_count, format, total_cost, is_important, manager_id, profiles!orders_manager_id_fkey(initials, full_name)",
                    )
                    .order(this.sortBy, { ascending: this.sortBy === "event_date" })
                    .abortSignal(this.fetchController.signal);

                // G10: search includes order_number
                if (this.search) {
                    const term = `%${this.search}%`;
                    // Check if search term is a number — search by order_number too
                    const isNumeric = /^\d+$/.test(this.search);
                    if (isNumeric) {
                        query = query.or(
                            `company_name.ilike.${term},contact_person.ilike.${term},order_number.eq.${parseInt(this.search)}`,
                        );
                    } else {
                        query = query.or(
                            `company_name.ilike.${term},contact_person.ilike.${term}`,
                        );
                    }
                }
                if (this.dateFilter) {
                    query = query.eq("event_date", this.dateFilter);
                }
                // G6: filter by manager
                if (this.managerFilter) {
                    query = query.eq("manager_id", this.managerFilter);
                }

                // G9: Pagination
                const from = this.page * this.pageSize;
                const to = from + this.pageSize - 1;
                query = query.range(from, to);

                const { data, count } = await query;
                this.totalCount = count ?? 0;
                this.hasMore = (data?.length ?? 0) === this.pageSize;

                // Merge: preserve optimistic changes for pending orders
                const fresh = (data as Order[]) ?? [];
                const result = fresh.map((o) => {
                    if (this.optimisticPending.has(o.id)) {
                        const local = this.orders.find(
                            (lo) => lo.id === o.id,
                        );
                        if (local) return { ...o, status_id: local.status_id };
                    }
                    return o;
                });

                return result;
            } catch (err: any) {
                if (err?.name === "AbortError") {
                    // Request was cancelled — return current orders unchanged
                    return this.orders;
                }
                throw err;
            } finally {
                this.fetchController = null;
            }
        }

        /** Optimistic status change — UI updates immediately, server syncs in background */
        async changeStatus(
            orderId: string,
            newStatusId: string,
        ): Promise<boolean> {
            const order = this.orders.find((o) => o.id === orderId);
            if (!order || order.status_id === newStatusId) return false;

            const oldStatusId = order.status_id;

            // Mark as pending — polling won't overwrite
            this.optimisticPending.add(orderId);

            // Optimistic update
            order.status_id = newStatusId;
            this.orders = [...this.orders];

            try {
                const { error } = await supabase
                    .from("orders")
                    .update({ status_id: newStatusId })
                    .eq("id", orderId);

                if (error) throw error;

                // Record history
                const {
                    data: { session },
                } = await supabase.auth.getSession();
                await supabase.from("status_history").insert({
                    order_id: orderId,
                    old_status_id: oldStatusId,
                    new_status_id: newStatusId,
                    changed_by: session?.user?.id,
                });

                return true;
            } catch (err) {
                // Rollback
                order.status_id = oldStatusId;
                this.orders = [...this.orders];
                console.error("[Kanban] changeStatus failed:", err);
                return false;
            } finally {
                this.optimisticPending.delete(orderId);
            }
        }

        /** Fetch orders for polling — no pagination, gets all for kanban sync */
        private async fetchOrdersPoll(): Promise<Order[]> {
            if (this.fetchController) this.fetchController.abort();
            this.fetchController = new AbortController();

            try {
                let query = supabase
                    .from("orders")
                    .select("id, status_id, order_number, company_name, contact_person, event_date, start_time, guest_count, format, total_cost, is_important, manager_id, profiles!orders_manager_id_fkey(initials, full_name)")
                    .order(this.sortBy, { ascending: this.sortBy === "event_date" })
                    .abortSignal(this.fetchController.signal);

                if (this.managerFilter) {
                    query = query.eq("manager_id", this.managerFilter);
                }

                const { data } = await query;
                const fresh = (data as Order[]) ?? [];
                return fresh.map((o) => {
                    if (this.optimisticPending.has(o.id)) {
                        const local = this.orders.find((lo) => lo.id === o.id);
                        if (local) return { ...o, status_id: local.status_id };
                    }
                    return o;
                });
            } catch (err: any) {
                if (err?.name === "AbortError") return this.orders;
                throw err;
            } finally {
                this.fetchController = null;
            }
        }

        // ---- Polling (visibility-aware) ----

        startPolling() {
            if (!browser) return;
            if (this.pollingTimer) return;

            this.pollingTimer = setInterval(() => {
                if (document.visibilityState === "visible") {
                    // Polling fetches ALL orders (no pagination) for kanban sync
                    this.fetchOrdersPoll()
                        .then((data) => {
                            this.orders = data;
                            this.error = null;
                        })
                        .catch((err) => {
                            console.error("[Kanban] poll failed:", err);
                        });
                }
            }, POLLING_INTERVAL_MS);

            // Stop polling when tab is hidden, resume when visible
            this.visibilityHandler = () => {
                if (document.visibilityState === "visible") {
                    // Resume: fetch immediately
                    this.fetchOrders()
                        .then((data) => {
                            this.orders = data;
                        })
                        .catch(() => {});
                }
            };
            document.addEventListener(
                "visibilitychange",
                this.visibilityHandler,
            );
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

        setSearch(term: string) {
            this.search = term;

            if (this.searchTimer) clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => {
                this.fetchOrders()
                    .then((data) => {
                        this.orders = data;
                        this.error = null;
                    })
                    .catch((err) => {
                        this.error = err?.message || "Ошибка поиска";
                    });
            }, 300);
        }

        setDateFilter(date: string) {
            this.dateFilter = date;

            if (this.searchTimer) clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => {
                this.fetchOrders()
                    .then((data) => {
                        this.orders = data;
                        this.error = null;
                    })
                    .catch((err) => {
                        this.error = err?.message || "Ошибка фильтрации";
                    });
            }, 100);
        }

        // G6: filter by responsible manager
        setManagerFilter(managerId: string) {
            this.managerFilter = managerId;
            this.page = 0;
            this.fetchOrders()
                .then((data) => { this.orders = data; })
                .catch((err) => { this.error = err?.message || "Ошибка фильтрации"; });
        }

        // G7: change sort order
        setSortBy(sort: "created_at" | "event_date") {
            this.sortBy = sort;
            this.page = 0;
            this.fetchOrders()
                .then((data) => { this.orders = data; })
                .catch((err) => { this.error = err?.message || "Ошибка сортировки"; });
        }

        // G9: Pagination
        nextPage() {
            if (!this.hasMore) return;
            this.page++;
            this.fetchOrders()
                .then((data) => { this.orders = [...this.orders, ...data]; })
                .catch((err) => { this.error = err?.message || "Ошибка загрузки"; });
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
