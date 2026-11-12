<script lang="ts">
    import { onMount } from "svelte";
    import { supabase } from "$lib/supabase";
    import { goto } from "$app/navigation";
    import Header from "$lib/components/Header.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Input from "$lib/components/ui/Input.svelte";
    import Select from "$lib/components/ui/Select.svelte";
    import { FORMATS } from "$lib/config";

    let clients: any[] = $state([]);
    let clientId = $state("");
    let companyName = $state("");
    let contactPerson = $state("");
    let phone = $state("");
    let email = $state("");
    let eventDate = $state("");
    let format = $state("");
    let guestCount = $state<number | null>(null);
    let loading = $state(false);
    let error = $state("");

    // Snapshot of the selected client's persisted contact data. Only fields the
    // user actually changed are written back on submit — never wipe real data
    // with empty inputs.
    let selectedClient: any = null;

    const formats = FORMATS.map((f) => f.value).filter(Boolean);

    async function loadClients() {
        const { data } = await supabase
            .from("clients")
            .select("id, name, contact_person, phone, email")
            .order("name");
        clients = data || [];
    }

    // Auto-fill fields when an existing client is selected
    $effect(() => {
        if (clientId) {
            const client = clients.find((c) => c.id === clientId);
            if (client) {
                selectedClient = client;
                companyName = client.name || "";
                contactPerson = client.contact_person || "";
                phone = client.phone || "";
                email = client.email || "";
            }
        } else {
            selectedClient = null;
        }
    });

    async function create() {
        if (!companyName.trim()) {
            error = "Название компании обязательно";
            return;
        }
        loading = true;
        error = "";

        const {
            data: { session },
        } = await supabase.auth.getSession();
        const managerId = session?.user?.id ?? null;

        // Without a manager the order would show «?» initials and never match
        // the manager filter — don't create it in a broken state.
        if (!managerId) {
            error =
                "Сессия не найдена. Войдите заново, чтобы создать заказ.";
            loading = false;
            return;
        }

        // Resolve the draft status first — an order with a null status would
        // silently disappear from the kanban, so abort instead of inserting it.
        const { data: draftStatus, error: statusErr } = await supabase
            .from("statuses")
            .select("id")
            .eq("name", "Черновик")
            .single();

        if (statusErr || !draftStatus) {
            error =
                "Не удалось определить начальный статус «Черновик». Заказ не создан — обратитесь к администратору.";
            loading = false;
            return;
        }

        // New client: create it first (with the author).
        let cId = clientId;
        let createdClient = false;
        if (!cId) {
            const { data: client, error: clientErr } = await supabase
                .from("clients")
                .insert({
                    name: companyName.trim(),
                    contact_person: contactPerson,
                    phone,
                    email,
                    created_by: managerId,
                })
                .select("id")
                .single();

            if (clientErr || !client) {
                error =
                    clientErr?.message || "Не удалось создать клиента";
                loading = false;
                return;
            }
            cId = client.id;
            createdClient = true;
            // Keep the new client referenced so a retry doesn't duplicate it.
            clientId = cId;
            selectedClient = {
                id: cId,
                name: companyName.trim(),
                contact_person: contactPerson,
                phone,
                email,
            };
        }

        // Existing client: patch only the contact fields the user edited.
        // Empty/unchanged inputs must not overwrite stored data.
        if (!createdClient) {
            const original = selectedClient?.id === cId ? selectedClient : null;
            const patch: Record<string, string | null> = {};
            if (!original || contactPerson !== (original.contact_person || "")) {
                patch.contact_person = contactPerson || null;
            }
            if (!original || phone !== (original.phone || "")) {
                patch.phone = phone || null;
            }
            if (!original || email !== (original.email || "")) {
                patch.email = email || null;
            }
            if (Object.keys(patch).length > 0) {
                const { error: patchErr } = await supabase
                    .from("clients")
                    .update(patch)
                    .eq("id", cId);
                if (patchErr) {
                    error = `Не удалось обновить контакты клиента: ${patchErr.message}`;
                    loading = false;
                    return;
                }
            }
        }

        const { data: order, error: err } = await supabase
            .from("orders")
            .insert({
                client_id: cId,
                company_name: companyName.trim(),
                contact_person: contactPerson,
                phone,
                email,
                event_date: eventDate || null,
                format: format || null,
                guest_count: guestCount,
                status_id: draftStatus.id,
                manager_id: managerId,
            })
            .select("id")
            .single();

        if (err || !order) {
            error = createdClient
                ? `Клиент «${companyName.trim()}» уже сохранён, но заказ создать не удалось: ${err?.message ?? "неизвестная ошибка"}. При повторной попытке клиент не задублируется.`
                : err?.message || "Не удалось создать заказ";
            loading = false;
            return;
        }

        // Record initial status in history. A failure here must not block the
        // order creation that already succeeded.
        try {
            const { error: historyErr } = await supabase
                .from("status_history")
                .insert({
                    order_id: order.id,
                    new_status_id: draftStatus.id,
                    changed_by: managerId,
                });
            if (historyErr) {
                console.warn(
                    "[orders/new] status_history insert failed:",
                    historyErr.message,
                );
            }
        } catch (historyErr) {
            console.warn(
                "[orders/new] status_history insert failed:",
                historyErr,
            );
        }

        goto(`/orders/${order.id}`);
    }

    onMount(() => {
        loadClients();
    });
</script>

<main class="min-h-screen bg-neutral-50">
    <Header />

    <div class="mx-auto max-w-2xl px-3 sm:px-6 py-4 sm:py-6">
        <button
            onclick={() => goto("/")}
            class="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-ink mb-3 sm:mb-4 cursor-pointer bg-transparent border-0 p-0 transition-colors duration-150"
        >
            ← Назад к заказам
        </button>
        <h2
            class="mb-4 sm:mb-6 text-lg sm:text-xl font-display font-semibold text-ink"
        >
            Новый заказ
        </h2>

        {#if error}
            <div
                class="mb-4 rounded-md bg-alert/10 border border-alert/20 p-3 text-sm text-alert"
                role="alert"
            >
                {error}
            </div>
        {/if}

        <div
            class="space-y-3 sm:space-y-4 rounded-md bg-paper p-4 sm:p-6 shadow-card border border-neutral-200/60"
        >
            <!-- Client -->
            <Select
                label="Клиент (существующий)"
                bind:value={clientId}
                placeholder="— Новый клиент —"
                options={clients.map((c: any) => ({
                    value: c.id,
                    label: c.name,
                }))}
            />

            <Input
                label="Название компании / ФИО"
                bind:value={companyName}
                required
                placeholder="ООО «Компания» или Иванов Иван"
            />

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Контактное лицо" bind:value={contactPerson} />
                <Input label="Телефон" bind:value={phone} phone />
            </div>

            <Input label="Email" type="email" bind:value={email} />

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                    label="Дата мероприятия"
                    type="date"
                    bind:value={eventDate}
                />
                <Select
                    label="Формат"
                    bind:value={format}
                    placeholder="—"
                    options={formats.map((f: string) => ({
                        value: f,
                        label: f,
                    }))}
                />
                <Input
                    label="Гостей"
                    type="number"
                    bind:value={guestCount}
                    min={1}
                />
            </div>

            <Button variant="primary" full onclick={create} {loading}>
                {loading ? "Создание..." : "Создать заказ"}
            </Button>
        </div>
    </div>
</main>
