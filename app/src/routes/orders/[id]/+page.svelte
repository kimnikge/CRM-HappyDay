<script lang="ts">
    import { onMount, untrack } from "svelte";
    import { supabase } from "$lib/supabase";
    import { beforeNavigate, goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { toasts } from "$lib/stores/toasts.svelte";
    import FormSection from "$lib/components/form/FormSection.svelte";
    import FormField from "$lib/components/form/FormField.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { updateOrderSchema, validateFile } from "$lib/schemas";
    import { generateOrderPDF } from "$lib/pdf/generate-order-pdf";
    import {
        FORMATS,
        EVENT_LEVELS,
        DISHWARE_TYPES,
        YES_NO_OPTIONS,
    } from "$lib/config";

    // ---- State ----
    let order: any = $state(null);
    let statuses: any[] = $state([]);
    let files: any[] = $state([]);
    let history: any[] = $state([]);
    let saving = $state(false);
    // error — только ошибка загрузки страницы (inline-баннер). Транзиентные
    // ошибки действий показываются toast'ом, чтобы не дублировать сообщения.
    let error = $state("");
    // uploadError — только ошибки валидации файла (inline рядом с полем)
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
    // Select статуса — двусторонний: при отмене модалки/ошибке возвращаем реальный статус заказа
    let selectedStatusId = $state<string | null>(null);

    // ---- Модалка «Причина отмены»: фокус-трап, Escape, возврат фокуса на селект ----
    let cancelModalPanel = $state<HTMLDivElement | null>(null);
    let cancelModalTrigger = $state<HTMLElement | null>(null);
    let wasCancelModalOpen = false;
    /** Ссылка на <select> статуса — чтобы вернуть на него фокус после закрытия модалки. */
    let statusSelect = $state<HTMLSelectElement | null>(null);

    const FOCUSABLE =
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function focusableIn(root: HTMLElement | null): HTMLElement[] {
        if (!root) return [];
        return Array.from(
            root.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter(
            (el) =>
                el.getAttribute("tabindex") !== "-1" &&
                el.getClientRects().length > 0,
        );
    }

    const id = $derived($page.params.id);

    // Числовые поля таблицы orders: из HTML-инпутов приходят строки
    const NUMERIC_ORDER_FIELDS = new Set([
        "guest_count",
        "service_rounds",
        "total_cost",
        "reminder_days",
    ]);

    const SERVICE_ROUND_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => ({
        value: String(n),
        label: `${n} ${n === 1 ? "подход" : n < 5 ? "подхода" : "подходов"}`,
    }));

    /**
     * Варианты «подходов к столу»: в БД это INTEGER, поэтому только числа.
     * Устаревшее нечисловое значение (например «непрерывно») показываем отдельной
     * опцией, чтобы селект не выглядел пустым; при сохранении оно уйдёт в null.
     */
    const serviceRoundsOptions = $derived.by(() => {
        const current = order?.service_rounds;
        if (current == null || current === "") return SERVICE_ROUND_OPTIONS;
        const value = String(current);
        if (SERVICE_ROUND_OPTIONS.some((o) => o.value === value)) {
            return SERVICE_ROUND_OPTIONS;
        }
        return [
            { value, label: `устаревшее значение: ${value}` },
            ...SERVICE_ROUND_OPTIONS,
        ];
    });

    /** id заказа, данные которого уже загружены (защита от двойной загрузки) */
    let loadedOrderId: string | undefined = undefined;

    /** Канонический снимок полей после load()/save() — основа dirty */
    let savedSnapshot = $state("");
    /** true, когда навигацию инициировало само приложение (guard не спрашивает) */
    let bypassUnsavedGuard = false;

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

    /** Приводим числовое значение из HTML-инпута к number или null */
    function toNullableNumber(value: unknown): number | null {
        if (value == null) return null;
        if (typeof value === "number") return Number.isFinite(value) ? value : null;
        const str = String(value).trim();
        if (str === "") return null;
        const num = Number(str);
        return Number.isFinite(num) ? num : null;
    }

    /** Приводим значения из HTML-инпутов к типам Postgres: пустые строки → null, числа → number */
    function normalizeOrderValue(key: string, value: unknown): unknown {
        if (NUMERIC_ORDER_FIELDS.has(key)) return toNullableNumber(value);
        if (typeof value === "string") return value.trim() === "" ? null : value;
        return value;
    }

    function buildUpdateBody(
        order: Record<string, unknown>,
    ): Record<string, unknown> {
        const body: Record<string, unknown> = {};
        for (const key of getOrderFieldNames()) {
            if (order[key] !== undefined) {
                body[key] = normalizeOrderValue(key, order[key]);
            }
        }
        return body;
    }

    /** Каноническая форма tables_info для сравнения (числа как числа) */
    function canonicalTablesInfo(raw: string | null): unknown {
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            const obj: Record<string, unknown> = {};
            if (parsed.c != null) obj.c = Number(parsed.c);
            if (parsed.f != null) obj.f = Number(parsed.f);
            if (parsed.x) obj.x = String(parsed.x);
            return Object.keys(obj).length > 0 ? obj : null;
        } catch {
            return raw;
        }
    }

    /**
     * Канонический снимок редактируемых полей: то же, что уйдёт в
     * buildUpdateBody, плюс tables_info. Сравниваем через него, чтобы
     * number→string от HTML-инпутов не давал ложный dirty.
     */
    function captureFormSnapshot(): string {
        if (!order) return "";
        const body = buildUpdateBody(order);
        body.tables_info = canonicalTablesInfo(serializeTablesInfo());
        return JSON.stringify(body);
    }

    /** Есть ли несохранённые изменения относительно последнего load()/save() */
    const dirty = $derived(
        !!order &&
            savedSnapshot !== "" &&
            captureFormSnapshot() !== savedSnapshot,
    );

    /** Переход, инициированный приложением: guard не должен его блокировать */
    function bypassGuardGoto(path: string) {
        bypassUnsavedGuard = true;
        goto(path);
    }

    // Защита от потери несохранённых изменений при любом уходе со страницы
    beforeNavigate(({ cancel }) => {
        if (bypassUnsavedGuard) {
            bypassUnsavedGuard = false;
            return;
        }
        if (!dirty) return;
        if (!confirm("Есть несохранённые изменения. Уйти без сохранения?")) {
            cancel();
        }
    });

    /** Сброс локального состояния при переходе на другой заказ */
    function resetViewState() {
        order = null;
        statuses = [];
        files = [];
        history = [];
        error = "";
        savedSnapshot = "";
        uploadError = "";
        formLinkCopied = false;
        showCancelReason = false;
        cancelReason = "";
        pendingStatusId = null;
        selectedStatusId = null;
        saving = false;
        sendingPDF = false;
        tablesSource = "";
        cocktailTables = null;
        buffetTables = null;
        tablesExtra = "";
    }

    // ---- Data loading ----
    async function load() {
        const currentId = id;
        const { data, error: loadErr } = await supabase
            .from("orders")
            .select("*, clients(*, orders(count)), statuses(*)")
            .eq("id", currentId)
            .single();
        // Пока грузились, пользователь мог уйти на другой заказ
        if (currentId !== id) return;
        if (loadErr || !data) {
            if (!data) {
                bypassGuardGoto("/");
            } else {
                error = `Не удалось загрузить заказ: ${loadErr!.message}`;
            }
            return;
        }

        const [stRes, flRes, histRes] = await Promise.all([
            supabase.from("statuses").select("*").order("order_index"),
            supabase
                .from("files")
                .select("*")
                .eq("order_id", currentId)
                .order("uploaded_at", { ascending: false }),
            supabase
                .from("status_history")
                .select(
                    "*, statuses:new_status_id(name), profiles:changed_by(full_name)",
                )
                .eq("order_id", currentId)
                .order("changed_at", { ascending: false }),
        ]);
        if (currentId !== id) return;

        order = data;
        selectedStatusId = order.status_id ?? null;
        statuses = stRes.data ?? [];
        files = flRes.data ?? [];
        history = histRes.data ?? [];

        // Parse tables_info JSON into local sub-fields
        parseTablesInfo(data.tables_info);

        // Снимок для отслеживания несохранённых изменений
        savedSnapshot = captureFormSnapshot();
    }

    /**
     * SvelteKit переиспользует компонент при /orders/A → /orders/B,
     * поэтому onMount(load) сам по себе данные B не загрузит.
     */
    $effect(() => {
        const currentId = id;
        if (!currentId) return;
        if (loadedOrderId === undefined) {
            loadedOrderId = currentId; // первый рендер загружает onMount(load)
            return;
        }
        if (loadedOrderId === currentId) return;
        loadedOrderId = currentId;
        resetViewState();
        void load();
    });

    // ---- Actions ----
    async function save() {
        saving = true;

        const body = buildUpdateBody(order);
        body.tables_info = serializeTablesInfo();
        // Снимок именно того, что уходит в БД: если пользователь продолжит
        // править поля во время запроса, dirty не «потеряется»
        const persistedSnapshot = JSON.stringify({
            ...body,
            tables_info: canonicalTablesInfo(
                body.tables_info as string | null,
            ),
        });

        const { error: err } = await supabase
            .from("orders")
            .update(body)
            .eq("id", id);

        if (err) {
            toasts.push(`Не удалось сохранить заказ: ${err.message}`, "error");
        } else {
            toasts.push("Заказ сохранён");
            // Сохранённое состояние становится «чистым»
            savedSnapshot = persistedSnapshot;
        }
        saving = false;
    }

    async function changeStatus(statusId: string) {
        // G2: если статус «Отменён» — запросить причину
        const targetStatus = statuses.find((s) => s.id === statusId);
        if (targetStatus?.order_index === 6) {
            // запоминаем, куда вернуть фокус после закрытия модалки
            cancelModalTrigger =
                statusSelect ??
                (document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null);
            pendingStatusId = statusId;
            cancelReason = "";
            showCancelReason = true;
            return;
        }
        await doChangeStatus(statusId, null);
    }

    /** Закрыть модалку причины отмены без изменения статуса */
    function dismissCancelModal() {
        showCancelReason = false;
        pendingStatusId = null;
        selectedStatusId = order?.status_id ?? null;
    }

    /**
     * Модалка причины отмены ведёт себя как диалог:
     *  - фокус при открытии — в textarea;
     *  - Tab/Shift+Tab циклятся внутри;
     *  - Escape = «Отмена» (статус не меняется, селект возвращается к реальному статусу);
     *  - после закрытия фокус возвращается на селект статуса.
     */
    $effect(() => {
        if (!showCancelReason) {
            if (!wasCancelModalOpen) return;
            wasCancelModalOpen = false;
            const trigger = untrack(() => cancelModalTrigger);
            cancelModalTrigger = null;
            if (trigger?.isConnected) trigger.focus();
            return;
        }

        if (!cancelModalPanel) return;
        const panel: HTMLDivElement = cancelModalPanel;
        wasCancelModalOpen = true;

        const initial = focusableIn(panel);
        (initial[0] ?? panel).focus();

        function onKeydown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                dismissCancelModal();
                return;
            }
            if (event.key !== "Tab") return;

            const items = focusableIn(panel);
            if (items.length === 0) {
                event.preventDefault();
                panel.focus();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement as HTMLElement | null;
            const inside = active !== null && panel.contains(active);

            if (event.shiftKey) {
                if (!inside || active === first) {
                    event.preventDefault();
                    last.focus();
                }
            } else if (!inside || active === last) {
                event.preventDefault();
                first.focus();
            }
        }

        document.addEventListener("keydown", onKeydown, true);
        return () => document.removeEventListener("keydown", onKeydown, true);
    });

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

        if (rpcErr) {
            toasts.push(
                `Не удалось изменить статус: ${rpcErr.message}`,
                "error",
            );
            // Возвращаем селект к реальному статусу заказа
            selectedStatusId = order?.status_id ?? null;
            return;
        }

        if (cancelReasonText) {
            // Also save cancel_reason on the order
            const { error: reasonErr } = await supabase
                .from("orders")
                .update({ cancel_reason: cancelReasonText })
                .eq("id", id);
            if (reasonErr) {
                toasts.push(
                    `Статус изменён, но причину отмены сохранить не удалось: ${reasonErr.message}`,
                    "error",
                );
            }
        }

        // Перезагрузка заказа заодно сбрасывает dirty
        await load();
    }

    async function confirmCancel() {
        const statusId = pendingStatusId;
        showCancelReason = false;
        pendingStatusId = null;
        if (statusId) {
            await doChangeStatus(statusId, cancelReason || null);
        }
    }

    function getFormLink(): string {
        return `${location.origin}/form/${order.form_token}`;
    }

    async function copyFormLink() {
        try {
            if (!navigator.clipboard) {
                throw new Error("Clipboard API недоступен");
            }
            await navigator.clipboard.writeText(getFormLink());
            formLinkCopied = true;
            setTimeout(() => (formLinkCopied = false), 2000);
        } catch {
            // fallback: показываем ссылку, чтобы её можно было скопировать вручную
            toasts.push(
                `Не удалось скопировать ссылку. Скопируйте вручную: ${getFormLink()}`,
                "error",
            );
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

        try {
            // 1. Generate PDF blob
            const pdfBlob = await generateOrderPDF(order);
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
                toasts.push(
                    "PDF скачан — перетащите его в чат WhatsApp",
                    "info",
                );
            }

            load();
        } catch (err: any) {
            toasts.push(err.message || "Не удалось отправить PDF", "error");
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
            toasts.push(
                `Не удалось дублировать заказ: ${dupErr.message}`,
                "error",
            );
        } else if (newOrder) {
            // Программный переход после дублирования guard не блокирует
            bypassGuardGoto(`/orders/${newOrder.id}`);
        }
    }

    async function uploadFile(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        const v = validateFile(file);
        if (!v.valid) {
            uploadError = v.error!;
            input.value = "";
            return;
        }
        uploadError = "";

        const path = `${id}/${Date.now()}_${file.name}`;
        // Сначала грузим в Storage и только при успехе создаём запись в files
        const { error: storageErr } = await supabase.storage
            .from("order-files")
            .upload(path, file);
        if (storageErr) {
            toasts.push(
                `Не удалось загрузить файл: ${storageErr.message}`,
                "error",
            );
            input.value = "";
            return;
        }

        const {
            data: { session },
        } = await supabase.auth.getSession();
        const { error: insertErr } = await supabase.from("files").insert({
            order_id: id,
            file_name: file.name,
            file_path: path,
            file_size: file.size,
            mime_type: file.type,
            uploaded_by: session?.user?.id,
        });
        if (insertErr) {
            toasts.push(
                `Файл загружен, но запись о нём не сохранилась: ${insertErr.message}`,
                "error",
            );
        }
        input.value = "";
        await load();
    }

    async function deleteFile(fileId: string, filePath: string) {
        const { error: removeErr } = await supabase.storage
            .from("order-files")
            .remove([filePath]);
        if (removeErr) {
            toasts.push(
                `Не удалось удалить файл: ${removeErr.message}`,
                "error",
            );
            return;
        }

        const { error: dbErr } = await supabase
            .from("files")
            .delete()
            .eq("id", fileId);
        if (dbErr) {
            toasts.push(
                `Файл удалён из хранилища, но запись осталась: ${dbErr.message}`,
                "error",
            );
        }
        await load();
    }

    /** Открыть ссылку под именем файла (download-атрибут не теряет оригинальное имя) */
    function openFileUrl(url: string, fileName: string) {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.target = "_blank";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    async function downloadFile(filePath: string, fileName: string) {
        // Бакет order-files приватный — публичный URL отдаёт 403, берём signed URL
        const { data, error: signErr } = await supabase.storage
            .from("order-files")
            .createSignedUrl(filePath, 60);
        if (!signErr && data?.signedUrl) {
            openFileUrl(data.signedUrl, fileName);
            return;
        }

        // Fallback: если подписать не удалось, пробуем публичную ссылку
        const { data: pub } = supabase.storage
            .from("order-files")
            .getPublicUrl(filePath);
        if (pub?.publicUrl) {
            openFileUrl(pub.publicUrl, fileName);
            return;
        }

        toasts.push(
            `Не удалось скачать файл: ${signErr?.message ?? "не удалось подписать ссылку"}`,
            "error",
        );
    }

    function formatBytes(bytes: number | null | undefined): string {
        if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
        if (bytes < 1024) return `${bytes} B`;
        const units = ["KB", "MB", "GB", "TB"];
        let value = bytes / 1024;
        let unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit++;
        }
        return `${value.toFixed(1)} ${units[unit]}`;
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
                bind:this={statusSelect}
                bind:value={selectedStatusId}
                onchange={(e) =>
                    changeStatus((e.target as HTMLSelectElement).value)}
                class="rounded-md border border-neutral-300 px-2 py-1 text-xs font-body
                       focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink
                       hover:border-neutral-400 transition-colors duration-150 bg-paper"
                aria-label="Изменить статус заказа"
            >
                {#each statuses as s}
                    <option value={s.id}>{s.name}</option>
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
            <div
                class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            >
                <!-- Клик по фону = «Отмена»; пропускается Tab'ом (есть кнопки и Escape) -->
                <button
                    type="button"
                    tabindex="-1"
                    class="absolute inset-0 w-full h-full border-0 p-0 bg-black/40 cursor-default"
                    aria-label="Закрыть окно"
                    onclick={dismissCancelModal}
                ></button>

                <div
                    bind:this={cancelModalPanel}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="cancel-reason-title"
                    tabindex="-1"
                    class="relative z-10 bg-paper rounded-t-xl sm:rounded-md shadow-lg p-4 sm:p-6 w-full max-w-sm max-h-[80vh] overflow-y-auto"
                >
                    <div class="sm:hidden flex justify-center mb-2">
                        <span
                            class="block w-10 h-1 rounded-full bg-neutral-300"
                        ></span>
                    </div>
                    <h3
                        id="cancel-reason-title"
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
                            onclick={dismissCancelModal}
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

        <div class="space-y-6">
            <!-- Client & Contacts -->
            <!-- Связь с клиентом: переход в его карточку и история обращений -->
            {#if order.client_id && order.clients}
                <div
                    class="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500"
                >
                    <span>Клиент:</span>
                    <a
                        href={`/clients/${order.client_id}`}
                        class="font-medium text-ink hover:text-signal no-underline"
                        >{order.clients.name}</a
                    >
                    {#if (order.clients.orders?.[0]?.count ?? 0) > 1}
                        <span
                            class="rounded-full bg-mint/15 px-2 py-0.5 font-medium text-mint"
                            >повторный · {order.clients.orders[0].count}
                            заказа</span
                        >
                    {/if}
                    <a
                        href={`/clients/${order.client_id}`}
                        class="text-signal hover:underline no-underline"
                        >история обращений →</a
                    >
                </div>
            {/if}

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
                    options={serviceRoundsOptions}
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
                                            downloadFile(
                                                f.file_path,
                                                f.file_name,
                                            )}
                                        >{f.file_name}</button
                                    >
                                    <span
                                        class="text-xs text-neutral-400 mx-2"
                                        >{formatBytes(f.file_size)}</span
                                    >
                                    <button
                                        class="text-alert hover:opacity-70 text-xs bg-transparent border-0 p-0 cursor-pointer"
                                        aria-label={`Удалить файл ${f.file_name}`}
                                        title="Удалить файл"
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
