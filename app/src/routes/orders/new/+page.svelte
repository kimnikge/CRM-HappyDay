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
                companyName = client.name || "";
                contactPerson = client.contact_person || "";
                phone = client.phone || "";
                email = client.email || "";
            }
        }
    });

    async function create() {
        if (!companyName.trim()) {
            error = "Название компании обязательно";
            return;
        }
        loading = true;
        error = "";

        // Get draft status ID first
        const { data: draftStatus } = await supabase
            .from("statuses")
            .select("id")
            .eq("name", "Черновик")
            .single();

        // If new client name is typed but no client selected, create client first
        let cId = clientId;
        if (!cId && companyName.trim()) {
            const { data: client } = await supabase
                .from("clients")
                .insert({
                    name: companyName.trim(),
                    contact_person: contactPerson,
                    phone,
                    email,
                })
                .select("id")
                .single();
            if (client) cId = client.id;
        }

        // If existing client selected, update their contact info (phone may have changed)
        if (cId) {
            await supabase
                .from("clients")
                .update({
                    contact_person: contactPerson || null,
                    phone: phone || null,
                    email: email || null,
                })
                .eq("id", cId);
        }

        const { data: order, error: err } = await supabase
            .from("orders")
            .insert({
                client_id: cId || null,
                company_name: companyName.trim(),
                contact_person: contactPerson,
                phone,
                email,
                event_date: eventDate || null,
                format: format || null,
                guest_count: guestCount,
                status_id: draftStatus?.id ?? null,
            })
            .select("id")
            .single();

        if (err) {
            error = err.message;
            loading = false;
            return;
        }

        // Record initial status in history
        if (draftStatus && order) {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            await supabase.from("status_history").insert({
                order_id: order.id,
                new_status_id: draftStatus.id,
                changed_by: session?.user?.id,
            });
        }

        goto(`/orders/${order!.id}`);
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
        <h2 class="mb-4 sm:mb-6 text-lg sm:text-xl font-display font-semibold text-ink">
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
                <Input label="Телефон" bind:value={phone} />
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
