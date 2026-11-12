<script lang="ts">
    import { untrack } from "svelte";
    import { page } from "$app/state";
    import { supabase } from "$lib/supabase";
    import Button from "$lib/components/ui/Button.svelte";
    import FormField from "$lib/components/form/FormField.svelte";
    import FormSection from "$lib/components/form/FormSection.svelte";
    import { CURRENCY_LOCALE, CURRENCY_SUFFIX } from "$lib/config";

    type ActivityKind = "call" | "email" | "whatsapp" | "meeting" | "note";

    interface ClientActivity {
        id: string;
        client_id: string;
        kind: string;
        happened_at: string;
        summary: string;
        next_action_at: string | null;
        created_by: string | null;
        created_at: string;
        /** Автор обращения (join на profiles, доступен только админам). */
        profiles?: {
            initials?: string | null;
            full_name?: string | null;
        } | null;
    }

    const ACTIVITY_KIND_META: Record<
        ActivityKind,
        { label: string; icon: string; pill: string }
    > = {
        call: {
            label: "Звонок",
            icon: "📞",
            pill: "bg-signal/15 text-signal",
        },
        email: {
            label: "Письмо",
            icon: "✉️",
            pill: "bg-steel text-ink",
        },
        whatsapp: {
            label: "WhatsApp",
            icon: "💬",
            pill: "bg-mint/15 text-mint",
        },
        meeting: {
            label: "Встреча",
            icon: "🤝",
            pill: "bg-blue-100 text-blue-700",
        },
        note: {
            label: "Заметка",
            icon: "📝",
            pill: "bg-neutral-200 text-neutral-600",
        },
    };

    const ACTIVITY_KIND_OPTIONS = (
        Object.keys(ACTIVITY_KIND_META) as ActivityKind[]
    ).map((value) => ({ value, label: ACTIVITY_KIND_META[value].label }));

    const clientId = $derived(page.params.id ?? "");

    let client = $state<any>(null);
    let orders = $state<any[]>([]);
    let activities = $state<ClientActivity[]>([]);

    let loading = $state(true);
    let notFound = $state(false);
    let error = $state("");
    let ordersError = $state("");
    let activitiesError = $state("");

    // Форма добавления обращения
    let kind = $state<string>("call");
    let summary = $state("");
    let nextActionDate = $state("");
    let saving = $state(false);
    let formError = $state("");

    // Дата удаляемой записи — блокирует повторный клик по её кнопке
    let deletingId = $state<string | null>(null);

    // Идентификатор данных, которые уже загружены, и счётчик запросов
    // (защита от гонки при быстром переключении между клиентами)
    let loadedClientId: string | undefined = undefined;
    let requestSeq = 0;

    const moneyFormat = new Intl.NumberFormat(CURRENCY_LOCALE, {
        maximumFractionDigits: 0,
    });

    function money(value: number | string | null | undefined): string {
        if (value === null || value === undefined || value === "") return "—";
        const n = Number(value);
        if (!Number.isFinite(n)) return "—";
        return moneyFormat.format(n) + CURRENCY_SUFFIX;
    }

    function fmtDate(value: string | null | undefined): string {
        if (!value) return "—";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    }

    function fmtDateTime(value: string | null | undefined): string {
        if (!value) return "—";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "—";
        const date = d.toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
        const time = d.toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
        });
        return `${date}, ${time}`;
    }

    function fmtShortDate(value: string | null | undefined): string {
        if (!value) return "—";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
        });
    }

    function isPast(value: string | null | undefined): boolean {
        if (!value) return false;
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return false;
        return d.getTime() <= Date.now();
    }

    function telHref(phone: string | null | undefined): string {
        return `tel:${String(phone ?? "").replace(/[^\d+]/g, "")}`;
    }

    function kindMeta(kindValue: string) {
        return (
            ACTIVITY_KIND_META[kindValue as ActivityKind] ??
            ACTIVITY_KIND_META.note
        );
    }

    function authorLabel(activity: ClientActivity): string {
        const profile = activity.profiles;
        if (!profile) return "";
        return profile.initials || profile.full_name || "";
    }

    /** Цвет «пилюли» статуса заказа по order_index (как в остальных экранах). */
    function statusPillClass(index: number | null | undefined): string {
        const map: Record<number, string> = {
            0: "bg-neutral-200 text-neutral-600",
            1: "bg-blue-100 text-blue-700",
            2: "bg-teal-100 text-teal-700",
            3: "bg-signal/15 text-signal",
            4: "bg-orange-100 text-orange-700",
            5: "bg-mint/15 text-mint",
            6: "bg-neutral-200 text-neutral-500",
        };
        return map[index ?? 0] ?? "bg-neutral-200 text-neutral-600";
    }

    function activitiesErrorMessage(
        err: { code?: string; message?: string } | null,
    ): string {
        if (!err) return "";
        // 42501 = insufficient_privilege: RLS client_activities пускает только админов
        if (err.code === "42501") {
            return "Журнал обращений доступен только администраторам.";
        }
        return `Журнал обращений недоступен: ${err.message ?? "ошибка загрузки"}`;
    }

    // ---- Агрегаты ----
    const sortedOrders = $derived(
        [...orders].sort((a, b) => {
            const ta = a.event_date
                ? new Date(a.event_date).getTime()
                : Number.NEGATIVE_INFINITY;
            const tb = b.event_date
                ? new Date(b.event_date).getTime()
                : Number.NEGATIVE_INFINITY;
            return tb - ta;
        }),
    );
    const lastOrder = $derived(
        sortedOrders.find((order) => order.event_date) ?? null,
    );
    const totalSum = $derived(
        orders.reduce((sum, order) => sum + (Number(order.total_cost) || 0), 0),
    );
    const averageTicket = $derived(
        orders.length > 0 ? totalSum / orders.length : null,
    );
    const cancelledCount = $derived(
        orders.filter((order) => order.statuses?.name === "Отменён").length,
    );

    // «Повторный клиент» — больше одного заказа
    const repeatClient = $derived(orders.length > 1);

    // «Пора связаться» — у последнего обращения назначено действие в прошлом
    const contactOverdue = $derived(
        Boolean(activities[0]?.next_action_at) &&
            isPast(activities[0]?.next_action_at),
    );

    const lastOrderLabel = $derived(
        lastOrder ? fmtDate(lastOrder.event_date) : "—",
    );

    const ACTIVITY_SELECT = "*, profiles(initials, full_name)";

    async function load(currentId: string) {
        const seq = ++requestSeq;
        loading = true;
        error = "";
        ordersError = "";
        activitiesError = "";
        notFound = false;
        formError = "";

        const [clientRes, ordersRes, activitiesRes] = await Promise.all([
            supabase.from("clients").select("*").eq("id", currentId).single(),
            supabase
                .from("orders")
                .select(
                    "order_number,id,event_date,start_time,total_cost,status_id,statuses(name,order_index)",
                )
                .eq("client_id", currentId)
                .order("event_date", { ascending: false }),
            supabase
                .from("client_activities")
                .select(ACTIVITY_SELECT)
                .eq("client_id", currentId)
                .order("happened_at", { ascending: false }),
        ]);

        // Ответ устарел — пользователь уже перешёл к другому клиенту
        if (seq !== requestSeq) return;

        if (clientRes.error && clientRes.error.code !== "PGRST116") {
            error = clientRes.error.message;
        } else if (!clientRes.data) {
            // .single() не нашёл строку (0 строк) — такого клиента нет
            notFound = true;
        }

        if (notFound || error) {
            client = null;
            orders = [];
            activities = [];
            loading = false;
            return;
        }

        client = clientRes.data;
        orders = ordersRes.data ?? [];
        if (ordersRes.error) {
            ordersError = `Не удалось загрузить заказы: ${ordersRes.error.message}`;
        }
        if (activitiesRes.error) {
            activitiesError = activitiesErrorMessage(activitiesRes.error);
            activities = [];
        } else {
            activities = (activitiesRes.data ?? []) as ClientActivity[];
        }
        loading = false;
    }

    async function reloadActivities() {
        if (!client) return;
        const { data, error: err } = await supabase
            .from("client_activities")
            .select(ACTIVITY_SELECT)
            .eq("client_id", client.id)
            .order("happened_at", { ascending: false });

        if (err) {
            activitiesError = activitiesErrorMessage(err);
            return;
        }
        activities = (data ?? []) as ClientActivity[];
        activitiesError = "";
    }

    async function addActivity(e: SubmitEvent) {
        e.preventDefault();
        if (!client || saving) return;

        const text = summary.trim();
        if (!text) {
            formError = "Введите текст обращения";
            return;
        }

        saving = true;
        formError = "";

        try {
            const {
                data: { session },
            } = await supabase.auth.getSession();

            const { error: insertError } = await supabase
                .from("client_activities")
                .insert({
                    client_id: client.id,
                    kind,
                    summary: text,
                    // date-инпут → полдень локального дня, чтобы дата не «прыгала» по TZ
                    next_action_at: nextActionDate
                        ? new Date(`${nextActionDate}T12:00:00`).toISOString()
                        : null,
                    created_by: session?.user?.id ?? null,
                });

            if (insertError) {
                formError = `Не удалось сохранить обращение: ${insertError.message}`;
            } else {
                kind = "call";
                summary = "";
                nextActionDate = "";
                await reloadActivities();
            }
        } catch {
            formError = "Ошибка сохранения. Проверьте соединение.";
        } finally {
            saving = false;
        }
    }

    async function removeActivity(activity: ClientActivity) {
        const label = `${kindMeta(activity.kind).label} от ${fmtDateTime(activity.happened_at)}`;
        if (!confirm(`Удалить запись «${label}»? Действие необратимо.`)) return;

        deletingId = activity.id;
        activitiesError = "";

        const { error: deleteError } = await supabase
            .from("client_activities")
            .delete()
            .eq("id", activity.id);

        if (deleteError) {
            activitiesError = `Не удалось удалить запись: ${deleteError.message}`;
        } else {
            activities = activities.filter((item) => item.id !== activity.id);
        }
        deletingId = null;
    }

    // Загрузка при монтировании и при смене параметра /clients/[id]
    $effect(() => {
        const currentId = clientId;
        if (!currentId) return;
        if (loadedClientId === currentId) return;
        loadedClientId = currentId;
        untrack(() => load(currentId));
    });
</script>

<svelte:head>
    <title>{client ? `${client.name} — Catering CRM` : "Клиент — Catering CRM"}</title>
</svelte:head>

{#snippet tile(label: string, value: string, valueClass: string)}
    <div class="rounded-lg border border-neutral-200/60 bg-paper p-3 shadow-card sm:p-4">
        <p
            class="text-2xs font-medium uppercase tracking-wider text-neutral-500 sm:text-xs"
        >
            {label}
        </p>
        <p
            class={`mt-1 truncate text-sm font-semibold sm:text-base ${valueClass || "text-ink"}`}
            title={value}
        >
            {value}
        </p>
    </div>
{/snippet}

<div class="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
    <a
        href="/clients"
        class="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 no-underline transition-colors duration-150 hover:text-ink sm:mb-4"
    >
        ← Клиенты
    </a>

    {#if loading}
        <p class="py-10 text-center text-sm text-neutral-400">Загрузка...</p>
    {:else if notFound}
        <div
            class="rounded-lg border border-neutral-200/60 bg-paper p-6 text-center shadow-card sm:p-8"
        >
            <p class="text-3xl" aria-hidden="true">🔍</p>
            <h1 class="mt-3 font-display text-lg font-semibold text-ink">
                Клиент не найден
            </h1>
            <p class="mt-1 text-sm text-neutral-500">
                Возможно, запись была удалена или ссылка устарела.
            </p>
            <div class="mt-4 flex justify-center">
                <Button href="/clients" variant="secondary">
                    К списку клиентов
                </Button>
            </div>
        </div>
    {:else if error}
        <div
            class="rounded-md border border-alert/20 bg-alert/10 p-3 text-sm text-alert"
            role="alert"
        >
            {error}
        </div>
        <div class="mt-3">
            <Button variant="secondary" onclick={() => load(clientId)}>
                Повторить
            </Button>
        </div>
    {:else if client}
        <!-- ===== Шапка: контакты + бейджи ===== -->
        <section
            class="overflow-hidden rounded-lg border border-neutral-200/60 bg-paper shadow-card"
        >
            <div class="h-1 w-full bg-signal" aria-hidden="true"></div>
            <div class="p-4 sm:p-5">
                <div
                    class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                >
                    <div class="min-w-0">
                        <h1
                            class="break-words font-display text-lg font-semibold text-ink sm:text-xl"
                        >
                            {client.name}
                        </h1>
                        <div
                            class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
                        >
                            {#if client.contact_person}
                                <span class="text-neutral-600">
                                    {client.contact_person}
                                </span>
                            {/if}
                            {#if client.phone}
                                <a
                                    href={telHref(client.phone)}
                                    class="text-ink no-underline transition-colors duration-150 hover:text-signal"
                                >
                                    {client.phone}
                                </a>
                            {/if}
                            {#if client.email}
                                <a
                                    href={`mailto:${client.email}`}
                                    class="break-all text-ink no-underline transition-colors duration-150 hover:text-signal"
                                >
                                    {client.email}
                                </a>
                            {/if}
                        </div>
                        {#if client.notes}
                            <p
                                class="mt-2 whitespace-pre-line text-sm text-neutral-500"
                            >
                                {client.notes}
                            </p>
                        {/if}
                    </div>

                    <div class="flex flex-wrap items-center gap-2 sm:justify-end">
                        {#if repeatClient}
                            <span
                                class="inline-flex items-center gap-1 rounded-full bg-mint/15 px-2.5 py-1 text-xs font-medium text-mint"
                            >
                                <span aria-hidden="true">🔁</span>
                                Повторный клиент
                            </span>
                        {/if}
                        {#if contactOverdue}
                            <span
                                class="inline-flex items-center gap-1 rounded-full bg-alert/10 px-2.5 py-1 text-xs font-medium text-alert"
                            >
                                <span aria-hidden="true">⏰</span>
                                Пора связаться
                            </span>
                        {/if}
                    </div>
                </div>
            </div>
        </section>

        <!-- ===== Агрегаты ===== -->
        <div
            class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
            {@render tile("Всего заказов", String(orders.length), "")}
            {@render tile("Сумма", money(totalSum), "")}
            {@render tile(
                "Средний чек",
                averageTicket === null ? "—" : money(averageTicket),
                "",
            )}
            {@render tile("Последний заказ", lastOrderLabel, "")}
            {@render tile(
                "Отменено",
                String(cancelledCount),
                cancelledCount > 0 ? "text-alert" : "",
            )}
        </div>

        <!-- ===== Заказы ===== -->
        <section
            class="mt-4 overflow-hidden rounded-lg border border-neutral-200/60 bg-paper shadow-card"
        >
            <div
                class="flex items-center justify-between border-b border-neutral-200 px-4 py-3"
            >
                <h2
                    class="font-display text-sm font-semibold text-ink sm:text-base"
                >
                    Заказы
                </h2>
                <span class="text-xs text-neutral-400">{orders.length}</span>
            </div>

            {#if ordersError}
                <p class="px-4 py-3 text-sm text-alert" role="alert">
                    {ordersError}
                </p>
            {:else if orders.length === 0}
                <p class="px-4 py-8 text-center text-sm text-neutral-400">
                    Заказов пока нет
                </p>
            {:else}
                <div class="table-responsive">
                    <table class="w-full text-sm">
                        <thead>
                            <tr
                                class="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wider text-neutral-500"
                            >
                                <th class="px-3 py-2.5 sm:px-4 sm:py-3">
                                    Номер
                                </th>
                                <th class="px-3 py-2.5 sm:px-4 sm:py-3">
                                    Дата события
                                </th>
                                <th
                                    class="hidden px-3 py-2.5 sm:table-cell sm:px-4 sm:py-3"
                                >
                                    Статус
                                </th>
                                <th
                                    class="px-3 py-2.5 text-right sm:px-4 sm:py-3"
                                >
                                    Сумма
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each sortedOrders as order (order.id)}
                                <tr
                                    class="border-b border-neutral-100 transition-colors duration-100 hover:bg-neutral-50"
                                >
                                    <td class="px-3 py-2.5 sm:px-4">
                                        <a
                                            href={`/orders/${order.id}`}
                                            class="font-medium text-ink no-underline transition-colors duration-150 hover:text-signal"
                                        >
                                            {order.order_number != null
                                                ? `№${order.order_number}`
                                                : "—"}
                                        </a>
                                    </td>
                                    <td
                                        class="px-3 py-2.5 text-neutral-600 sm:px-4"
                                    >
                                        {fmtDate(order.event_date)}
                                        {#if order.start_time}
                                            <span class="text-neutral-400">
                                                , {String(
                                                    order.start_time,
                                                ).slice(0, 5)}
                                            </span>
                                        {/if}
                                        <span
                                            class="mt-0.5 block text-xs text-neutral-400 sm:hidden"
                                        >
                                            {order.statuses?.name ?? "—"}
                                        </span>
                                    </td>
                                    <td
                                        class="hidden px-3 py-2.5 sm:table-cell sm:px-4"
                                    >
                                        <span
                                            class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClass(
                                                order.statuses?.order_index,
                                            )}`}
                                        >
                                            {order.statuses?.name ?? "—"}
                                        </span>
                                    </td>
                                    <td
                                        class="px-3 py-2.5 text-right font-medium text-ink sm:px-4"
                                    >
                                        {money(order.total_cost)}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
        </section>

        <!-- ===== Журнал обращений + форма добавления ===== -->
        <div class="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <section
                class="overflow-hidden rounded-lg border border-neutral-200/60 bg-paper shadow-card"
            >
                <div
                    class="flex items-center justify-between border-b border-neutral-200 px-4 py-3"
                >
                    <h2
                        class="font-display text-sm font-semibold text-ink sm:text-base"
                    >
                        Журнал обращений
                    </h2>
                    <span class="text-xs text-neutral-400">
                        {activities.length}
                    </span>
                </div>

                <div class="p-4">
                    {#if activitiesError}
                        <p class="text-sm text-alert" role="alert">
                            {activitiesError}
                        </p>
                    {:else if activities.length === 0}
                        <p class="text-sm text-neutral-400">
                            Обращений пока нет — добавьте первое.
                        </p>
                    {:else}
                        <ol class="space-y-3">
                            {#each activities as activity (activity.id)}
                                <li
                                    class="flex gap-3 rounded-md border border-neutral-200/60 p-3"
                                >
                                    <span
                                        class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${kindMeta(
                                            activity.kind,
                                        ).pill}`}
                                        aria-hidden="true"
                                    >
                                        {kindMeta(activity.kind).icon}
                                    </span>
                                    <div class="min-w-0 flex-1">
                                        <div
                                            class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                                        >
                                            <span
                                                class="text-sm font-medium text-ink"
                                            >
                                                {kindMeta(activity.kind).label}
                                            </span>
                                            <span
                                                class="text-xs text-neutral-400"
                                            >
                                                {fmtDateTime(
                                                    activity.happened_at,
                                                )}
                                            </span>
                                            {#if authorLabel(activity)}
                                                <span
                                                    class="text-xs text-neutral-400"
                                                >
                                                    · {authorLabel(activity)}
                                                </span>
                                            {/if}
                                        </div>
                                        <p
                                            class="mt-1 whitespace-pre-line text-sm text-neutral-700"
                                        >
                                            {activity.summary}
                                        </p>
                                        {#if activity.next_action_at}
                                            <p
                                                class={`mt-1 text-xs font-medium ${
                                                    isPast(
                                                        activity.next_action_at,
                                                    )
                                                        ? "text-alert"
                                                        : "text-neutral-500"
                                                }`}
                                            >
                                                перезвонить: {fmtShortDate(
                                                    activity.next_action_at,
                                                )}
                                            </p>
                                        {/if}
                                    </div>
                                    <button
                                        type="button"
                                        onclick={() =>
                                            removeActivity(activity)}
                                        disabled={deletingId === activity.id}
                                        title="Удалить запись"
                                        aria-label={`Удалить обращение: ${kindMeta(activity.kind).label}, ${fmtDateTime(activity.happened_at)}`}
                                        class="h-8 w-8 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0 text-alert transition-opacity duration-150 hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        ✕
                                    </button>
                                </li>
                            {/each}
                        </ol>
                    {/if}
                </div>
            </section>

            <form onsubmit={addActivity} class="min-w-0">
                <FormSection title="Новое обращение" accent="signal">
                    <FormField
                        label="Тип обращения"
                        type="select"
                        bind:value={kind}
                        options={ACTIVITY_KIND_OPTIONS}
                    />
                    <FormField
                        label="Дата следующего действия"
                        type="date"
                        bind:value={nextActionDate}
                    />
                    <FormField
                        label="Текст обращения *"
                        type="textarea"
                        bind:value={summary}
                        rows={3}
                        cols
                    />
                    {#if formError}
                        <p class="col-span-full text-sm text-alert" role="alert">
                            {formError}
                        </p>
                    {/if}
                    <div class="col-span-full flex justify-end">
                        <Button
                            type="submit"
                            variant="primary"
                            loading={saving}
                            disabled={saving}
                        >
                            {saving
                                ? "Добавление..."
                                : "Добавить обращение"}
                        </Button>
                    </div>
                </FormSection>
            </form>
        </div>
    {/if}
</div>
