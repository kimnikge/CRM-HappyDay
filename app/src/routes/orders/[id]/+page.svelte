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
    import { generateOrderPDF } from "$lib/pdf/generate-order-pdf";
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
    let sendingPDF = $state(false);

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

    async function sendPDFToWhatsApp() {
        if (!order?.phone || sendingPDF) return;
        sendingPDF = true;
        error = "";

        try {
            // 1. Generate PDF blob
            const pdfBlob = generateOrderPDF(order);
            const safeName = order.company_name
                .replace(/[^a-zA-Z0-9]/g, "_")
                .replace(/_+/g, "_")
                .replace(/^_|_$/g, "")
                || "order";
            const fileName = `Order_${order.order_number}_${safeName}.pdf`;
            const file = new File([pdfBlob], fileName, { type: "application/pdf" });

            // 2. Upload to Supabase Storage + record in DB
            const filePath = `${order.id}/${Date.now()}_${fileName}`;
            const { error: uploadError } = await supabase.storage
                .from("order-files")
                .upload(filePath, file);
            if (uploadError) throw new Error(uploadError.message || "Ошибка загрузки PDF");

            const { data: { session } } = await supabase.auth.getSession();
            await supabase.from("files").insert({
                order_id: order.id,
                file_name: fileName,
                file_path: filePath,
                file_size: file.size,
                mime_type: file.type,
                uploaded_by: session?.user?.id,
            });

            // 3. Try native share sheet (sends PDF directly to WhatsApp on mobile)
            if (navigator.share && navigator.canShare?.({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: `Заказ №${order.order_number} — ${order.company_name}`,
                });
            } else {
                // 4. Fallback: download PDF to device
                const url = URL.createObjectURL(pdfBlob);
                const a = document.createElement("a");
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                success = "PDF скачан — перетащите его в чат WhatsApp";
                setTimeout(() => (success = ""), 3000);
            }

            load();
        } catch (err: any) {
            error = err.message || "Не удалось отправить PDF";
        }
        sendingPDF = false;
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

    /** Map format name to accent bar background class */
    function getFormatAccent(fmt: string): string {
        const map: Record<string, string> = {
            банкет: "bg-format-banquet",
            фуршет: "bg-format-furshet",
            "кофе-брейк": "bg-format-coffee",
            коктейль: "bg-format-cocktail",
            буфет: "bg-format-buffet",
        };
        return map[fmt.toLowerCase()] ?? "bg-format-default";
    }

    /** Map status order_index to temperature class for the status pill */
    function statusTempClass(idx: number): string {
        const map: Record<number, string> = {
            0: "bg-neutral-200 text-neutral-600",
            1: "bg-blue-100 text-blue-700",
            2: "bg-teal-100 text-teal-700",
            3: "bg-signal/15 text-signal",
            4: "bg-orange-100 text-orange-700",
            5: "bg-mint/15 text-mint",
            6: "bg-neutral-200 text-neutral-500",
        };
        return map[idx] ?? "bg-neutral-200 text-neutral-600";
    }

    onMount(load);
</script>

<main class="min-h-screen bg-neutral-50">
    <Header />

    {#if order}
        <!-- Snippets -->
        {#snippet statusPill()}
            {@const currentStatus = statuses.find(
                (s) => s.id === order.status_id,
            )}
            {@const idx = currentStatus?.order_index ?? 0}
            <div class="flex items-center gap-1.5">
                <span
                    class={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusTempClass(idx)}`}
                >
                    <span
                        class={`inline-block h-1.5 w-1.5 rounded-full ${idx === 3 || idx === 4 ? "bg-signal animate-pulse" : "bg-current opacity-40"}`}
                        aria-hidden="true"
                    ></span>
                    {currentStatus?.name ?? "—"}
                </span>
                <select
                    value={order.status_id}
                    onchange={(e) =>
                        changeStatus((e.target as HTMLSelectElement).value)}
                    class="rounded-md border border-neutral-300 px-2 py-1 text-xs font-body
                           focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink
                           hover:border-neutral-400 transition-colors duration-150 bg-paper"
                    aria-label="Изменить статус заказа"
                >
                    {#each statuses as s}
                        <option value={s.id} selected={s.id === order.status_id}
                            >{s.name}</option
                        >
                    {/each}
                </select>
            </div>
        {/snippet}

        <div class="mx-auto max-w-4xl px-3 sm:px-6 py-4 sm:py-6">
            <button
                onclick={() => goto("/")}
                class="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-ink mb-3 sm:mb-4 cursor-pointer bg-transparent border-0 p-0 transition-colors duration-150"
            >
                ← Назад к заказам
            </button>
            <!-- Header -->
            <div
                class="mb-4 sm:mb-6 rounded-lg bg-paper shadow-card border border-neutral-200/60 overflow-hidden"
            >
                <!-- Format accent bar -->
                <div
                    class={`h-1 w-full ${order.format ? getFormatAccent(order.format) : "bg-neutral-300"}`}
                    aria-hidden="true"
                ></div>
                <div class="p-3 sm:p-4">
                    <div
                        class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                        <div>
                            <h2
                                class="text-lg sm:text-xl font-display font-semibold text-ink"
                            >
                                Заказ №{order.order_number}
                            </h2>
                            <p class="text-sm text-neutral-500">
                                {order.company_name}
                            </p>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                            <!-- Status pill -->
                            {@render statusPill()}
                            <!-- G1: Form link + WhatsApp -->
                            <div class="flex flex-wrap items-center gap-1.5">
                                {#if order.form_token}
                                    {#if order.form_submitted}
                                        <span
                                            class="text-xs text-mint bg-mint/10 rounded px-2 py-1 inline-flex items-center gap-1"
                                        >
                                            <span class="text-[10px]">✓</span>
                                            Заполнена
                                        </span>
                                    {:else}
                                        <button
                                            class="text-xs text-signal hover:underline bg-signal/8 rounded px-2 py-1 cursor-pointer border-0 transition-colors duration-150"
                                            onclick={copyFormLink}
                                            title="Скопировать ссылку на форму"
                                        >
                                            {formLinkCopied
                                                ? "Скопировано ✓"
                                                : "📋 Форма"}
                                        </button>
                                    {/if}
                                {/if}
                                {#if order.phone}
                                    <button
                                        class="text-xs text-green-600 hover:underline bg-green-50 rounded px-2 py-1 cursor-pointer border-0 transition-colors duration-150"
                                        onclick={openWhatsApp}
                                        title="Написать в WhatsApp"
                                    >
                                        💬 WA
                                    </button>
                                    <button
                                        class="text-xs text-ink hover:underline bg-neutral-100 rounded px-2 py-1 cursor-pointer border-0 transition-colors duration-150 disabled:opacity-40"
                                        onclick={sendPDFToWhatsApp}
                                        disabled={sendingPDF}
                                        title="Отправить PDF заказа в WhatsApp"
                                    >
                                        {sendingPDF ? "⏳" : "📄"} PDF
                                    </button>
                                {/if}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- G2: Cancel reason modal -->
            {#if showCancelReason}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
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
                        class="bg-paper rounded-t-xl sm:rounded-md shadow-lg p-4 sm:p-6 w-full max-w-sm max-h-[80vh] overflow-y-auto"
                        onclick={(e: MouseEvent) => e.stopPropagation()}
                        onkeydown={(e: KeyboardEvent) => {
                            if (e.key === "Escape") e.stopPropagation();
                        }}
                    >
                        <div class="sm:hidden flex justify-center mb-2">
                            <span
                                class="block w-10 h-1 rounded-full bg-neutral-300"
                            ></span>
                        </div>
                        <h3
                            class="text-base sm:text-lg font-display font-semibold text-ink mb-3"
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
                <!-- Client & Contacts -->
                <FormSection title="Клиент и контакты" accent="ink">
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
                        phone
                    />
                    <FormField
                        label="Email"
                        type="email"
                        bind:value={order.email}
                    />
                </FormSection>

                <!-- Core Parameters -->
                <FormSection
                    title="Основные параметры"
                    cols={3}
                    accent="signal"
                >
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

                <!-- Time -->
                <FormSection title="Время" cols={3} accent="signal">
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

                <!-- Location -->
                <FormSection title="Локация" accent="steel">
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

                <!-- Equipment -->
                <FormSection title="Оборудование" accent="steel">
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

                <!-- Event Level -->
                <FormSection
                    title="Уровень мероприятия"
                    cols={1}
                    accent="signal"
                >
                    <FormField
                        label="Уровень"
                        type="select"
                        bind:value={order.event_level}
                        options={EVENT_LEVELS}
                    />
                </FormSection>

                <!-- Menu -->
                <FormSection title="Меню" accent="mint">
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

                <!-- Beverages -->
                <FormSection title="Напитки" accent="mint">
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

                <!-- Other -->
                <FormSection title="Прочее" accent="mint">
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

                <!-- Finance -->
                <FormSection title="Финансы" accent="mint">
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

                <!-- History: visual timeline -->
                <section
                    class="rounded-lg bg-paper shadow-card border border-neutral-200/60 overflow-hidden"
                >
                    <div class="p-4 sm:p-5">
                        <h3
                            class="mb-4 text-sm font-display font-semibold text-ink tracking-tight"
                        >
                            История статусов
                        </h3>
                        {#if history.length > 0}
                            <div class="relative">
                                <!-- Timeline vertical line -->
                                <div
                                    class="absolute left-2 top-1 bottom-1 w-px bg-neutral-200"
                                    aria-hidden="true"
                                ></div>
                                <div class="space-y-3">
                                    {#each history as h, i}
                                        {@const hStatus = statuses.find(
                                            (s) => s.id === h.new_status_id,
                                        )}
                                        {@const hIdx =
                                            hStatus?.order_index ?? -1}
                                        <div class="flex gap-3 relative">
                                            <!-- Timeline dot -->
                                            <div
                                                class={`relative z-10 mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-paper ${hIdx >= 0 ? statusTempClass(hIdx).split(" ")[0] : "bg-neutral-300"} ${i === 0 ? "ring-2 ring-signal/20" : ""}`}
                                                aria-hidden="true"
                                            >
                                                {#if i === 0}
                                                    <span
                                                        class="size-1 rounded-full bg-paper"
                                                    ></span>
                                                {/if}
                                            </div>
                                            <!-- Content -->
                                            <div class="flex-1 min-w-0">
                                                <div
                                                    class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                                                >
                                                    <span
                                                        class="text-xs font-medium text-ink"
                                                    >
                                                        → {h.statuses?.name ??
                                                            "?"}
                                                    </span>
                                                    {#if h.profiles?.full_name}
                                                        <span
                                                            class="text-xs text-neutral-400"
                                                        >
                                                            {h.profiles
                                                                .full_name}
                                                        </span>
                                                    {/if}
                                                </div>
                                                <p
                                                    class="text-2xs text-neutral-400 font-mono mt-0.5"
                                                >
                                                    {new Date(
                                                        h.changed_at,
                                                    ).toLocaleString("ru-RU", {
                                                        day: "numeric",
                                                        month: "short",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </p>
                                                {#if h.comment}
                                                    <p
                                                        class="text-xs text-neutral-500 mt-1 italic"
                                                    >
                                                        {h.comment}
                                                    </p>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {:else}
                            <p class="text-xs text-neutral-400">
                                История изменений статуса появится здесь
                            </p>
                        {/if}
                    </div>
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
