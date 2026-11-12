<script lang="ts">
    import { onMount, untrack } from "svelte";
    import { supabase } from "$lib/supabase";
    import { toasts } from "$lib/stores/toasts.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Input from "$lib/components/ui/Input.svelte";

    let clients = $state<any[]>([]);
    let search = $state("");
    let loading = $state(true);
    let error = $state("");
    let showCreate = $state(false);
    let editId = $state<string | null>(null);

    // Form state
    let name = $state("");
    let contactPerson = $state("");
    let phone = $state("");
    let email = $state("");
    let notes = $state("");
    let formError = $state("");
    let saving = $state(false);

    // ---- Модалка create/edit: фокус-трап, Escape, начальный/возвратный фокус ----
    let modalPanel = $state<HTMLDivElement | null>(null);
    let modalTrigger = $state<HTMLElement | null>(null);
    let wasModalOpen = false;

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

    /**
     * Запоминаем кнопку, открывшую модалку, чтобы вернуть на неё фокус.
     * currentTarget надёжнее document.activeElement: Safari не фокусирует
     * кнопки по клику, и activeElement там остаётся на body.
     */
    function rememberTrigger(event?: Event) {
        const currentTarget = event?.currentTarget;
        if (currentTarget instanceof HTMLElement) {
            modalTrigger = currentTarget;
            return;
        }
        modalTrigger =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
    }

    const filtered = $derived(
        search
            ? clients.filter(
                  (c) =>
                      c.name.toLowerCase().includes(search.toLowerCase()) ||
                      (c.contact_person || "")
                          .toLowerCase()
                          .includes(search.toLowerCase()) ||
                      (c.phone || "").includes(search),
              )
            : clients,
    );

    async function load() {
        loading = true;
        const { data, error: err } = await supabase
            .from("clients")
            .select("*, orders(count), client_activities(count)")
            .order("name");
        clients = data ?? [];
        if (err) error = err.message;
        loading = false;
    }

    function openCreate(event?: MouseEvent) {
        rememberTrigger(event);
        showCreate = true;
        editId = null;
        name = "";
        contactPerson = "";
        phone = "";
        email = "";
        notes = "";
        formError = "";
    }

    function openEdit(c: any, event?: MouseEvent) {
        rememberTrigger(event);
        showCreate = true;
        editId = c.id;
        name = c.name || "";
        contactPerson = c.contact_person || "";
        phone = c.phone || "";
        email = c.email || "";
        notes = c.notes || "";
        formError = "";
    }

    function closeForm() {
        showCreate = false;
        editId = null;
    }

    /**
     * Модалка ведёт себя как настоящий диалог:
     *  - начальный фокус — первое поле ввода;
     *  - Tab/Shift+Tab циклятся внутри панели;
     *  - Escape закрывает;
     *  - после закрытия фокус возвращается на кнопку-триггер.
     */
    $effect(() => {
        if (!showCreate) {
            if (!wasModalOpen) return;
            wasModalOpen = false;
            const trigger = untrack(() => modalTrigger);
            modalTrigger = null;
            if (trigger?.isConnected) trigger.focus();
            return;
        }

        if (!modalPanel) return;
        const panel: HTMLDivElement = modalPanel;
        wasModalOpen = true;

        const initial = focusableIn(panel);
        (initial[0] ?? panel).focus();

        function onKeydown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                closeForm();
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

    async function save(e: SubmitEvent) {
        e.preventDefault();
        if (!name.trim()) {
            // Ошибка поля — остаётся inline у формы
            formError = "Название обязательно";
            return;
        }
        saving = true;
        formError = "";

        const isEdit = editId !== null;
        const payload = {
            name: name.trim(),
            contact_person: contactPerson || null,
            phone: phone || null,
            email: email || null,
            notes: notes || null,
        };

        let saveError = "";
        if (editId) {
            const { error: err } = await supabase
                .from("clients")
                .update(payload)
                .eq("id", editId);
            if (err) saveError = err.message;
        } else {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            const { error: err } = await supabase
                .from("clients")
                .insert({ ...payload, created_by: session?.user?.id });
            if (err) saveError = err.message;
        }

        saving = false;
        if (saveError) {
            toasts.push(
                `Не удалось сохранить клиента: ${saveError}`,
                "error",
            );
        } else {
            closeForm();
            toasts.push(isEdit ? "Клиент сохранён" : "Клиент добавлен");
            await load();
        }
    }

    async function deleteClient(id: string, clientName: string) {
        if (!confirm(`Удалить клиента «${clientName}»?`)) return;
        const { error: err } = await supabase
            .from("clients")
            .delete()
            .eq("id", id);
        if (err) {
            toasts.push(
                `Не удалось удалить клиента: ${err.message}`,
                "error",
            );
        } else {
            toasts.push(`Клиент «${clientName}» удалён`);
            await load();
        }
    }

    onMount(load);
</script>

<div class="mx-auto max-w-4xl px-3 sm:px-6 py-4 sm:py-6">
    <!-- Toolbar -->
    <div
        class="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
    >
        <div>
            <h2
                class="text-lg sm:text-xl font-display font-semibold text-ink"
            >
                Клиенты
            </h2>
            <p class="text-xs sm:text-sm text-neutral-500">
                {clients.length} клиентов
            </p>
        </div>
        <div class="flex items-center gap-2 sm:gap-3">
            <input
                type="search"
                bind:value={search}
                placeholder="Поиск..."
                class="w-full sm:w-56 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-body placeholder:text-neutral-400
                       focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink hover:border-neutral-400
                       transition-colors duration-150"
            />
            <Button variant="primary" onclick={openCreate}>+ Клиент</Button>
        </div>
    </div>

    {#if error}
        <div
            class="mb-4 rounded-md bg-alert/10 border border-alert/20 p-3 text-sm text-alert"
        >
            {error}
        </div>
    {/if}

    {#if loading}
        <p class="text-sm text-neutral-400 py-10 text-center">
            Загрузка...
        </p>
    {:else if filtered.length === 0}
        <p class="text-sm text-neutral-400 py-10 text-center">
            Нет клиентов
        </p>
    {:else}
        <div
            class="table-responsive rounded-md bg-paper border border-neutral-200/60 shadow-card"
        >
            <table class="w-full text-sm">
                <thead>
                    <tr
                        class="border-b border-neutral-200 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider"
                    >
                        <th class="px-3 sm:px-4 py-2.5 sm:py-3">Название</th
                        >
                        <th
                            class="px-3 sm:px-4 py-2.5 sm:py-3 hidden sm:table-cell"
                            >Контакт</th
                        >
                        <th class="px-3 sm:px-4 py-2.5 sm:py-3">Телефон</th>
                        <th
                            class="px-3 sm:px-4 py-2.5 sm:py-3 hidden md:table-cell"
                            >Email</th
                        >
                        <th
                            class="px-3 sm:px-4 py-2.5 sm:py-3 hidden sm:table-cell text-right"
                            >Заказов</th
                        >
                        <th class="px-3 sm:px-4 py-2.5 sm:py-3 w-1"></th>
                    </tr>
                </thead>
                <tbody>
                    {#each filtered as c (c.id)}
                        <tr
                            class="border-b border-neutral-100 hover:bg-neutral-50 transition-colors duration-100"
                        >
                            <td class="px-3 sm:px-4 py-2.5">
                                <a
                                    href={`/clients/${c.id}`}
                                    class="text-ink hover:text-signal text-left no-underline font-medium text-sm"
                                    >{c.name}</a
                                >
                                <!-- Show contact person inline on mobile -->
                                <span
                                    class="block text-xs text-neutral-500 sm:hidden mt-0.5"
                                >
                                    {c.contact_person || "—"}
                                </span>
                            </td>
                            <td
                                class="px-3 sm:px-4 py-2.5 text-neutral-600 hidden sm:table-cell"
                                >{c.contact_person || "—"}</td
                            >
                            <td
                                class="px-3 sm:px-4 py-2.5 text-neutral-600 text-xs sm:text-sm"
                                >{c.phone || "—"}</td
                            >
                            <td
                                class="px-3 sm:px-4 py-2.5 text-neutral-600 hidden md:table-cell text-xs sm:text-sm"
                                >{c.email || "—"}</td
                            >
                            <td
                                class="px-3 sm:px-4 py-2.5 hidden sm:table-cell text-right text-neutral-600 text-xs sm:text-sm tabular-nums"
                                >{c.orders?.[0]?.count ?? 0}</td
                            >
                            <td class="px-2 sm:px-4 py-2.5 whitespace-nowrap">
                                <button
                                    class="text-neutral-500 hover:text-signal text-xs bg-transparent border-0 p-0 cursor-pointer min-w-8 min-h-8 mr-1"
                                    onclick={(event) => openEdit(c, event)}
                                    title="Редактировать"
                                    aria-label={`Редактировать клиента ${c.name}`}
                                    >✎</button
                                >
                                <button
                                    class="text-alert hover:opacity-70 text-xs bg-transparent border-0 p-0 cursor-pointer min-w-8 min-h-8"
                                    onclick={() =>
                                        deleteClient(c.id, c.name)}
                                    title="Удалить"
                                    aria-label={`Удалить клиента ${c.name}`}
                                    >✕</button
                                >
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}

    <!-- Create/Edit modal -->
    {#if showCreate}
        <div
            bind:this={modalPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clients-modal-title"
            tabindex="-1"
            class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
            <!-- Клик по фону закрывает; пропускается Tab'ом (для этого есть «Отмена» и Escape) -->
            <button
                type="button"
                tabindex="-1"
                class="absolute inset-0 w-full h-full border-0 p-0 bg-black/40 cursor-default"
                aria-label="Закрыть окно"
                onclick={closeForm}
            ></button>

            <form
                onsubmit={save}
                class="relative z-10 bg-paper rounded-t-xl sm:rounded-md shadow-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
            >
                <!-- Drag handle for mobile sheet -->
                <div class="sm:hidden flex justify-center mb-2">
                    <span class="block w-10 h-1 rounded-full bg-neutral-300"
                    ></span>
                </div>
                <h3
                    id="clients-modal-title"
                    class="text-base sm:text-lg font-display font-semibold text-ink mb-3 sm:mb-4"
                >
                    {editId ? "Редактировать клиента" : "Новый клиент"}
                </h3>

                {#if formError}
                    <div
                        class="mb-3 rounded-md bg-alert/10 border border-alert/20 p-2 text-xs text-alert"
                    >
                        {formError}
                    </div>
                {/if}

                <label
                    for="cl-name"
                    class="block mb-1 text-sm font-medium text-neutral-700"
                    >Название *</label
                >
                <input
                    id="cl-name"
                    type="text"
                    bind:value={name}
                    required
                    class="mb-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-body
                           placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink
                           hover:border-neutral-400 transition-colors duration-150"
                />

                <label
                    for="cl-contact"
                    class="block mb-1 text-sm font-medium text-neutral-700"
                    >Контактное лицо</label
                >
                <input
                    id="cl-contact"
                    type="text"
                    bind:value={contactPerson}
                    class="mb-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-body
                           placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink
                           hover:border-neutral-400 transition-colors duration-150"
                />

                <Input label="Телефон" bind:value={phone} phone />

                <label
                    for="cl-email"
                    class="block mb-1 text-sm font-medium text-neutral-700"
                    >Email</label
                >
                <input
                    id="cl-email"
                    type="email"
                    bind:value={email}
                    class="mb-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-body
                           placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink
                           hover:border-neutral-400 transition-colors duration-150"
                />

                <label
                    for="cl-notes"
                    class="block mb-1 text-sm font-medium text-neutral-700"
                    >Заметки</label
                >
                <textarea
                    id="cl-notes"
                    bind:value={notes}
                    rows={2}
                    class="mb-4 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-body
                           placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink
                           hover:border-neutral-400 transition-colors duration-150"
                ></textarea>

                <div class="flex gap-2 justify-end">
                    <button
                        type="button"
                        class="px-4 py-2 text-sm text-neutral-600 hover:text-ink bg-transparent border-0 cursor-pointer rounded-md hover:bg-neutral-100 transition-colors duration-150"
                        onclick={closeForm}>Отмена</button
                    >
                    <Button
                        type="submit"
                        variant="primary"
                        loading={saving}
                    >
                        {saving ? "Сохранение..." : "Сохранить"}
                    </Button>
                </div>
            </form>
        </div>
    {/if}
</div>
