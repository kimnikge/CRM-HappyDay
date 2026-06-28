<script lang="ts">
    import { onMount } from "svelte";
    import { supabase } from "$lib/supabase";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import Header from "$lib/components/Header.svelte";
    import FormSection from "$lib/components/form/FormSection.svelte";
    import FormField from "$lib/components/form/FormField.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { updateOrderSchema, validateFile } from "$lib/schemas";
    import {
        FORMATS,
        EVENT_LEVELS,
        WATER_TYPES,
        COFFEE_TYPES,
        DISHWARE_TYPES,
        YES_NO_OPTIONS,
    } from "$lib/config";

    // ---- State ----
    let order: any = $state(null);
    let statuses: any[] = $state([]);
    let files: any[] = $state([]);
    let history: any[] = $state([]);
    let saving = $state(false);
    let error = $state("");
    let success = $state("");
    let uploadError = $state("");
    let tablesSource = $state<"от заказчика" | "от кейтеринга" | "">("");
    let cocktailTables = $state<number | null>(null);
    let buffetTables = $state<number | null>(null);
    let tablesExtra = $state("");
    let formLinkCopied = $state(false);
    let showCancelReason = $state(false);
    let cancelReason = $state("");
    let pendingStatusId = $state<string | null>(null);

    const id = $derived($page.params.id);

    // ---- Helpers ----

    /** Parse tables_info JSON into local state */
    function parseTablesInfo(raw: string | null) {
        cocktailTables = null;
        buffetTables = null;
        tablesExtra = "";
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            if (parsed.c != null) cocktailTables = Number(parsed.c);
            if (parsed.f != null) buffetTables = Number(parsed.f);
            if (parsed.x) tablesExtra = String(parsed.x);
        } catch {
            // Legacy: plain text → put into extra
            tablesExtra = raw;
        }
    }

    /** Serialize local tables state back to JSON string */
    function serializeTablesInfo(): string | null {
        const obj: Record<string, unknown> = {};
        if (cocktailTables != null) obj.c = cocktailTables;
        if (buffetTables != null) obj.f = buffetTables;
        if (tablesExtra) obj.x = tablesExtra;
        return Object.keys(obj).length > 0 ? JSON.stringify(obj) : null;
    }

    /** Return known Zod field names for updateOrderSchema (Zod v4 compat) */
    function getOrderFieldNames(): string[] {
        const shape =
            (updateOrderSchema as any).shape ??
            (updateOrderSchema as any)._def?.shape ??
            {};
        return Object.keys(shape);
    }

    /** Extract only the fields defined in updateOrderSchema from the order object */
    function buildUpdateBody(
        order: Record<string, unknown>,
    ): Record<string, unknown> {
        const body: Record<string, unknown> = {};
        for (const key of getOrderFieldNames()) {
            if (order[key] !== undefined) body[key] = order[key];
        }
        return body;
    }

    // ---- Data loading ----
    async function load() {
        const { data } = await supabase
            .from("orders")
            .select("*, clients(*), statuses(*)")
            .eq("id", id)
            .single();
        order = data;
        if (!order) {
            goto("/");
            return;
        }

        const [stRes, flRes, histRes] = await Promise.all([
            supabase.from("statuses").select("*").order("order_index"),
            supabase
                .from("files")
                .select("*")
                .eq("order_id", id)
                .order("uploaded_at", { ascending: false }),
            supabase
                .from("status_history")
                .select(
                    "*, statuses:new_status_id(name), profiles:changed_by(full_name)",
                )
                .eq("order_id", id)
                .order("changed_at", { ascending: false }),
        ]);

        statuses = stRes.data ?? [];
        files = flRes.data ?? [];
        history = histRes.data ?? [];

        // Parse tables_info JSON into local sub-fields
        parseTablesInfo(data.tables_info);
    }

    // ---- Actions ----
    async function save() {
        saving = true;
        error = "";
        success = "";

        const body = buildUpdateBody(order);
        body.tables_info = serializeTablesInfo();

        const { error: err } = await supabase
            .from("orders")
            .update(body)
            .eq("id", id);

        if (err) {
            error = err.message;
        } else {
            success = "Сохранено";
            setTimeout(() => (success = ""), 2000);
        }
        saving = false;
    }

    async function changeStatus(statusId: string) {
        // G2: если статус «Отменён» — запросить причину
        const targetStatus = statuses.find((s) => s.id === statusId);
        if (targetStatus?.order_index === 6) {
            pendingStatusId = statusId;
            cancelReason = "";
            showCancelReason = true;
            return;
        }
        await doChangeStatus(statusId, null);
    }

    async function doChangeStatus(
        statusId: string,
        cancelReasonText: string | null,
    ) {
        const {
            data: { session },
        } = await supabase.auth.getSession();

        // Use atomic RPC for status change
        const { error: rpcErr } = await supabase.rpc("change_order_status", {
            p_order_id: id,
            p_new_status_id: statusId,
            p_user_id: session?.user?.id,
            p_comment: cancelReasonText ?? null,
        });

        if (!rpcErr && cancelReasonText) {
            // Also save cancel_reason on the order
            await supabase
                .from("orders")
                .update({ cancel_reason: cancelReasonText })
                .eq("id", id);
        }

        load();
    }

    async function confirmCancel() {
        showCancelReason = false;
        if (pendingStatusId) {
            await doChangeStatus(pendingStatusId, cancelReason || null);
            pendingStatusId = null;
        }
    }

    function getFormLink(): string {
        return `${location.origin}/form/${order.form_token}`;
    }

    async function copyFormLink() {
        try {
            await navigator.clipboard.writeText(getFormLink());
            formLinkCopied = true;
            setTimeout(() => (formLinkCopied = false), 2000);
        } catch {
            // fallback: select text manually
        }
    }

    function openWhatsApp() {
        if (!order?.phone) return;
        // Strip all non-digit characters, keep leading + if present
        const clean = order.phone.replace(/[^\d+]/g, "");
        const digits = clean.startsWith("+") ? clean.slice(1) : clean;
        window.open(`https://wa.me/${digits}`, "_blank");
    }

    // G5: Duplicate order
    async function duplicateOrder() {
        if (!order) return;
        const {
            data: { session },
        } = await supabase.auth.getSession();

        // Copy all form fields except system ones
        const {
            id,
            order_number,
            created_at,
            updated_at,
            form_token,
            form_submitted,
            status_id,
            manager_id,
            clients,
            statuses,
            ...copy
        } = order;

        const { data: newOrder, error: dupErr } = await supabase
            .from("orders")
            .insert({
                ...copy,
                manager_id: session?.user?.id,
                status_id: order.status_id, // keep same status or set to draft?
            })
            .select("id")
            .single();

        if (dupErr) {
            error = dupErr.message;
        } else if (newOrder) {
            goto(`/orders/${newOrder.id}`);
        }
    }

    async function uploadFile(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        const v = validateFile(file);
        if (!v.valid) {
            uploadError = v.error!;
            return;
        }
        uploadError = "";

        const path = `${id}/${Date.now()}_${file.name}`;
        await supabase.storage.from("order-files").upload(path, file);
        const {
            data: { session },
        } = await supabase.auth.getSession();
        await supabase.from("files").insert({
            order_id: id,
            file_name: file.name,
            file_path: path,
            file_size: file.size,
            mime_type: file.type,
            uploaded_by: session?.user?.id,
        });
        load();
        input.value = "";
    }

    async function deleteFile(fileId: string, filePath: string) {
        await supabase.storage.from("order-files").remove([filePath]);
        await supabase.from("files").delete().eq("id", fileId);
        load();
    }

    function downloadFile(filePath: string) {
        const { data } = supabase.storage
            .from("order-files")
            .getPublicUrl(filePath);
        window.open(data.publicUrl, "_blank");
    }

    function formatBytes(bytes: number): string {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    onMount(load);
</script>

<main class="min-h-screen bg-neutral-50">
    <Header />

    {#if order}
        <div class="mx-auto max-w-4xl p-6">
            <button
                onclick={() => goto("/")}
                class="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-ink mb-4 cursor-pointer bg-transparent border-0 p-0 transition-colors duration-150"
            >
                ← Назад к заказам
            </button>
            <!-- Header -->
            <div class="mb-6 flex items-center justify-between">
                <div>
                    <h2 class="text-xl font-display font-semibold text-ink">
                        Заказ №{order.order_number}
                    </h2>
                    <p class="text-sm text-neutral-500">{order.company_name}</p>
                </div>
                <div class="flex items-center gap-3">
                    <!-- G1: Form link + WhatsApp -->
                    <div class="flex items-center gap-1.5">
                        {#if order.form_token}
                            {#if order.form_submitted}
                                <span
                                    class="text-xs text-neutral-400 bg-neutral-100 rounded px-2 py-1"
                                >
                                    Форма заполнена ✓
                                </span>
                            {:else}
                                <button
                                    class="text-xs text-signal hover:underline bg-signal/5 rounded px-2 py-1 cursor-pointer border-0 transition-colors duration-150"
                                    onclick={copyFormLink}
                                    title="Скопировать ссылку на форму"
                                >
                                    {formLinkCopied
                                        ? "Скопировано ✓"
                                        : "📋 Ссылка на форму"}
                                </button>
                            {/if}
                        {/if}
                        {#if order.phone}
                            <button
                                class="text-xs text-green-600 hover:underline bg-green-50 rounded px-2 py-1 cursor-pointer border-0 transition-colors duration-150"
                                onclick={openWhatsApp}
                                title="Написать в WhatsApp"
                            >
                                💬 WhatsApp
                            </button>
                        {/if}
                    </div>
                    <select
                        value={order.status_id}
                        onchange={(e) =>
                            changeStatus((e.target as HTMLSelectElement).value)}
                        class="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-body
                               focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink
                               hover:border-neutral-400 transition-colors duration-150"
                    >
                        {#each statuses as s}
                            <option
                                value={s.id}
                                selected={s.id === order.status_id}
                                >{s.name}</option
                            >
                        {/each}
                    </select>
                </div>
            </div>

            <!-- G2: Cancel reason modal -->
            {#if showCancelReason}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                    onclick={() => (showCancelReason = false)}
                    onkeydown={(e: KeyboardEvent) => {
                        if (e.key === "Escape") showCancelReason = false;
                    }}
                    role="dialog"
                    aria-modal="true"
                    tabindex="-1"
                >
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="bg-paper rounded-md shadow-lg p-6 w-full max-w-sm mx-4"
                        onclick={(e: MouseEvent) => e.stopPropagation()}
                        onkeydown={(e: KeyboardEvent) => {
                            if (e.key === "Escape") e.stopPropagation();
                        }}
                    >
                        <h3
                            class="text-lg font-display font-semibold text-ink mb-3"
                        >
                            Причина отмены
                        </h3>
                        <textarea
                            bind:value={cancelReason}
                            class="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-body placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink mb-4"
                            rows={3}
                            placeholder="Укажите причину отмены заказа..."
                        ></textarea>
                        <div class="flex gap-2 justify-end">
                            <button
                                class="px-4 py-2 text-sm text-neutral-600 hover:text-ink bg-transparent border-0 cursor-pointer rounded-md hover:bg-neutral-100 transition-colors duration-150"
                                onclick={() => (showCancelReason = false)}
                                >Отмена</button
                            >
                            <button
                                class="px-4 py-2 text-sm text-white bg-alert hover:opacity-90 border-0 cursor-pointer rounded-md font-medium transition-colors duration-150"
                                onclick={confirmCancel}>Отменить заказ</button
                            >
                        </div>
                    </div>
                </div>
            {/if}

            {#if error}
                <div
                    class="mb-4 rounded-md bg-alert/10 border border-alert/20 p-3 text-sm text-alert"
                    role="alert"
                >
                    {error}
                </div>
            {/if}
            {#if success}
                <div
                    class="mb-4 rounded-md bg-mint/10 border border-mint/20 p-3 text-sm text-mint"
                >
                    {success}
                </div>
            {/if}

            <div class="space-y-6">
                <!-- 1. Client & Contacts -->
                <FormSection title="1. Клиент и контакты">
                    <FormField
                        label="Название компании / ФИО"
                        bind:value={order.company_name}
                    />
                    <FormField
                        label="Контактное лицо"
                        bind:value={order.contact_person}
                    />
                    <FormField
                        label="Телефон/WhatsApp"
                        bind:value={order.phone}
                    />
                    <FormField
                        label="Email"
                        type="email"
                        bind:value={order.email}
                    />
                </FormSection>

                <!-- 2. Core Parameters -->
                <FormSection title="2. Основные параметры" cols={3}>
                    <FormField
                        label="Дата мероприятия"
                        type="date"
                        bind:value={order.event_date}
                    />
                    <FormField
                        label="Дата окончательного согласования"
                        type="date"
                        bind:value={order.approval_date}
                    />
                    <FormField
                        label="Формат мероприятия"
                        type="select"
                        bind:value={order.format}
                        options={FORMATS}
                    />
                    <FormField
                        label="Тема мероприятия"
                        bind:value={order.theme}
                        placeholder="Конференция, выставка..."
                    />
                    <FormField
                        label="Количество гостей"
                        type="number"
                        bind:value={order.guest_count}
                    />
                    <FormField
                        label="Сколько подходов гостей к столу?"
                        type="select"
                        bind:value={order.service_rounds}
                        options={[
                            { value: "1", label: "1 подход" },
                            { value: "2", label: "2 подхода" },
                            { value: "3", label: "3 подхода" },
                            {
                                value: "непрерывно",
                                label: "в течении всего мероприятия",
                            },
                        ]}
                    />
                </FormSection>

                <!-- 3. Time -->
                <FormSection title="3. Время" cols={3}>
                    <FormField
                        label="Начало мероприятия"
                        type="time"
                        bind:value={order.start_time}
                    />
                    <FormField
                        label="Окончание мероприятия"
                        type="time"
                        bind:value={order.end_time}
                    />
                    <FormField
                        label="Прибытие официантов?"
                        type="time"
                        bind:value={order.waiter_arrival}
                    />
                    <FormField
                        label="Завоз оборудования: когда?"
                        bind:value={order.equipment_delivery}
                        cols
                    />
                </FormSection>

                <!-- 4. Location -->
                <FormSection title="4. Локация/ссылка 2ГИС">
                    <FormField label="Адрес" bind:value={order.address} cols />
                    <FormField
                        label="Пропускная система"
                        bind:value={order.access_system}
                    />
                    <FormField
                        label="Этаж / расположение"
                        bind:value={order.floor}
                    />
                    <FormField
                        label="Карта заезда"
                        bind:value={order.entry_map}
                    />
                    <FormField
                        label="Электричество"
                        bind:value={order.electricity}
                    />
                </FormSection>

                <!-- 5. Equipment -->
                <FormSection title="5. Оборудование">
                    <FormField
                        label="Коктельные столы: количество"
                        type="number"
                        bind:value={cocktailTables}
                    />
                    <FormField
                        label="Фуршетные столы: количество"
                        type="number"
                        bind:value={buffetTables}
                    />
                    <FormField
                        label="Столы: дополнительно"
                        bind:value={tablesExtra}
                        placeholder="Любая информация о столах"
                    />
                    <FormField
                        label="Подсобное помещение: есть/нету"
                        bind:value={order.utility_room}
                    />
                    <FormField
                        label="Готовность столов"
                        type="select"
                        bind:value={tablesSource}
                        options={[
                            { value: "", label: "—" },
                            { value: "от заказчика", label: "от заказчика" },
                            { value: "от кейтеринга", label: "от кейтеринга" },
                        ]}
                    />
                    {#if tablesSource === "от заказчика"}
                        <FormField
                            label="Время готовности столов от заказчика"
                            type="time"
                            bind:value={order.tables_ready}
                        />
                    {:else if tablesSource === "от кейтеринга"}
                        <FormField
                            label="Время готовности столов (устанавливает менеджер)"
                            type="time"
                            bind:value={order.tables_ready}
                        />
                    {/if}
                    <FormField
                        label="Баннер от кейтеринга"
                        type="select"
                        bind:value={order.banner}
                        options={YES_NO_OPTIONS}
                    />
                </FormSection>

                <!-- 6. Event Level -->
                <FormSection title="6. Уровень мероприятия" cols={1}>
                    <FormField
                        label="Уровень"
                        type="select"
                        bind:value={order.event_level}
                        options={EVENT_LEVELS}
                    />
                </FormSection>

                <!-- 7. Menu -->
                <FormSection title="7. Меню">
                    <div class="col-span-2">
                        <label
                            for="menu-file-upload"
                            class="flex flex-col items-center gap-2 rounded-md border-2 border-dashed border-neutral-300 px-6 py-5 text-center cursor-pointer hover:border-signal hover:bg-signal/5 transition-colors duration-150"
                        >
                            <span class="text-2xl">📎</span>
                            <span class="text-sm font-medium text-neutral-700"
                                >Прикрепить файл меню</span
                            >
                            <span class="text-xs text-neutral-400"
                                >JPEG, PNG, PDF, DOCX, XLSX — до 10 МБ</span
                            >
                            <input
                                id="menu-file-upload"
                                type="file"
                                accept=".jpg,.jpeg,.png,.pdf,.docx,.xlsx"
                                onchange={uploadFile}
                                class="hidden"
                            />
                        </label>
                        {#if uploadError}
                            <p class="mt-2 text-xs text-alert">{uploadError}</p>
                        {/if}
                    </div>
                    <FormField
                        label="Комментарий"
                        type="textarea"
                        bind:value={order.menu_comment}
                        cols
                        rows={2}
                    />
                    <!-- Attached files list -->
                    <div class="col-span-2 mt-2">
                        <p class="text-sm font-medium text-neutral-700 mb-2">
                            Прикреплённые файлы ({files.length})
                        </p>
                        {#if files.length > 0}
                            <div class="space-y-1">
                                {#each files as f}
                                    <div
                                        class="flex items-center justify-between rounded bg-neutral-100 px-3 py-1.5 text-sm"
                                    >
                                        <button
                                            class="text-ink hover:underline text-left truncate flex-1 bg-transparent border-0 p-0 cursor-pointer"
                                            onclick={() =>
                                                downloadFile(f.file_path)}
                                            >{f.file_name}</button
                                        >
                                        <span
                                            class="text-xs text-neutral-400 mx-2"
                                            >{formatBytes(f.file_size)}</span
                                        >
                                        <button
                                            class="text-alert hover:opacity-70 text-xs bg-transparent border-0 p-0 cursor-pointer"
                                            onclick={() =>
                                                deleteFile(f.id, f.file_path)}
                                            >✕</button
                                        >
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <p class="text-xs text-neutral-400">Нет файлов</p>
                        {/if}
                    </div>
                </FormSection>

                <!-- 8. Beverages -->
                <FormSection title="8. Напитки">
                    <FormField
                        label="Алкоголь"
                        bind:value={order.alcohol}
                        placeholder="Да / Нет / Какой"
                    />
                    <FormField
                        label="Вода"
                        type="select"
                        bind:value={order.water}
                        options={[
                            { value: "", label: "—" },
                            { value: "согласно меню", label: "согласно меню" },
                            { value: "от заказчика", label: "от заказчика" },
                        ]}
                    />
                    <FormField
                        label="Соки"
                        type="select"
                        bind:value={order.juices}
                        options={[
                            { value: "", label: "—" },
                            { value: "согласно меню", label: "согласно меню" },
                            { value: "от заказчика", label: "от заказчика" },
                        ]}
                    />
                    <FormField
                        label="Кофе"
                        type="select"
                        bind:value={order.coffee}
                        options={[
                            { value: "", label: "—" },
                            { value: "согласно меню", label: "согласно меню" },
                            { value: "от заказчика", label: "от заказчика" },
                        ]}
                    />
                </FormSection>

                <!-- 9. Other -->
                <FormSection title="9. Прочее">
                    <FormField
                        label="Горячее"
                        bind:value={order.hot_dishes}
                        placeholder="Да / Нет"
                    />
                    <FormField
                        label="Посуда"
                        type="select"
                        bind:value={order.dishware}
                        options={DISHWARE_TYPES}
                    />
                    <FormField
                        label="Доп. требования"
                        type="textarea"
                        bind:value={order.extra_requirements}
                        cols
                        rows={2}
                    />
                </FormSection>

                <!-- 10. Finance -->
                <FormSection title="10. Финансы">
                    <FormField
                        label="Общая стоимость (тг)"
                        type="number"
                        bind:value={order.total_cost}
                    />
                    <div>
                        <FormField
                            label="Статус оплаты"
                            bind:value={order.payment_status}
                        />
                        <!-- G11: cost per guest hint -->
                        {#if order.total_cost && order.guest_count}
                            <p class="text-xs text-neutral-400 mt-1">
                                ≈ {new Intl.NumberFormat("ru-RU").format(
                                    Math.round(
                                        order.total_cost / order.guest_count,
                                    ),
                                )} тг на гостя
                            </p>
                        {/if}
                    </div>
                </FormSection>

                <!-- G13: Important flag + G17: Reminder + G24: Comments -->
                <FormSection title="Дополнительно" cols={2}>
                    <div class="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="chk-important"
                            checked={order.is_important ?? false}
                            onchange={(e) =>
                                (order.is_important = (
                                    e.target as HTMLInputElement
                                ).checked)}
                            class="rounded border-neutral-300 text-signal focus:ring-signal"
                        />
                        <label
                            for="chk-important"
                            class="text-sm text-neutral-700 cursor-pointer select-none"
                        >
                            ⭐ Важный заказ
                        </label>
                    </div>
                    <FormField
                        label="Напомнить за N дней до мероприятия"
                        type="number"
                        bind:value={order.reminder_days}
                        placeholder="Напр. 3"
                    />
                    <FormField
                        label="Внутренние комментарии"
                        type="textarea"
                        bind:value={order.internal_notes}
                        cols
                        rows={3}
                        placeholder="Заметки для команды (не видны клиенту)"
                    />
                </FormSection>

                <!-- 11. History -->
                <section
                    class="rounded-md bg-paper p-5 shadow-card border border-neutral-200/60"
                >
                    <h3
                        class="mb-3 text-sm font-display font-semibold text-ink"
                    >
                        11. История статусов
                    </h3>
                    {#if history.length > 0}
                        <div class="space-y-1.5">
                            {#each history as h}
                                <div
                                    class="flex items-center gap-2 text-xs text-neutral-500"
                                >
                                    <span class="text-neutral-400 font-mono">
                                        {new Date(h.changed_at).toLocaleString(
                                            "ru-RU",
                                        )}
                                    </span>
                                    <span class="font-medium text-neutral-700"
                                        >→ {h.statuses?.name || "?"}</span
                                    >
                                    {#if h.profiles?.full_name}
                                        <span class="text-neutral-400"
                                            >({h.profiles.full_name})</span
                                        >
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="text-xs text-neutral-400">Нет записей</p>
                    {/if}
                </section>
            </div>

            <!-- Save + Duplicate buttons -->
            <div class="mt-6 flex gap-3">
                <div class="flex-1">
                    <Button
                        variant="primary"
                        full
                        onclick={save}
                        loading={saving}
                    >
                        {saving ? "Сохранение..." : "Сохранить"}
                    </Button>
                </div>
                <Button variant="secondary" onclick={duplicateOrder}>
                    Дублировать
                </Button>
            </div>
        </div>
    {/if}
</main>
