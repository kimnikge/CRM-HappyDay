<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import FormSection from "$lib/components/form/FormSection.svelte";
    import FormField from "$lib/components/form/FormField.svelte";
    import {
        FORMATS,
        EVENT_LEVELS,
        WATER_TYPES,
        COFFEE_TYPES,
        DISHWARE_TYPES,
        YES_NO_OPTIONS,
    } from "$lib/config";

    const token = $derived($page.params.token);

    let loading = $state(true);
    let submitted = $state(false);
    let companyName = $state("");
    let error = $state("");
    let formErrors: string[] = $state([]);

    // All form fields in a single reactive object
    let f = $state<Record<string, string | number | null>>({
        event_date: "",
        approval_date: "",
        format: "",
        theme: "",
        guest_count: null,
        service_rounds: null,
        start_time: "",
        end_time: "",
        waiter_arrival: "",
        equipment_delivery: "",
        tables_ready: "",
        address: "",
        access_system: "",
        floor: "",
        entry_map: "",
        electricity: "",
        tables_info: "",
        utility_room: "",
        banner: "",
        event_level: "",
        alcohol: "",
        water: "",
        juices: "",
        coffee: "",
        hot_dishes: "",
        dishware: "",
        extra_requirements: "",
        menu_comment: "",
    });

    onMount(async () => {
        try {
            const res = await fetch(`/api/form/${token}`);
            if (!res.ok) {
                const err = await res.json();
                error =
                    err.error ||
                    "Заказ не найден. Проверьте ссылку или обратитесь к менеджеру.";
            } else {
                const data = await res.json();
                companyName = data.company_name;
            }
        } catch {
            error = "Не удалось загрузить форму. Проверьте соединение.";
        }
        loading = false;
    });

    async function handleSubmit(e: Event) {
        e.preventDefault();
        formErrors = [];
        loading = true;

        const body: Record<string, unknown> = {
            ...f,
            guest_count: f.guest_count ?? undefined,
            service_rounds: f.service_rounds ?? undefined,
        };
        for (const key of Object.keys(body)) {
            if (body[key] === null || body[key] === "") delete body[key];
        }

        try {
            const res = await fetch(`/api/form/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const result = await res.json();
            if (!res.ok) {
                if (result.details)
                    formErrors = result.details.map((d: any) => d.message);
                else error = result.error || "Ошибка при отправке.";
            } else {
                submitted = true;
            }
        } catch {
            error =
                "Ошибка при отправке. Попробуйте ещё раз или свяжитесь с менеджером.";
        }
        loading = false;
    }
</script>

<svelte:head>
    <title>Catering CRM — Заполнение формы</title>
</svelte:head>

<main class="min-h-screen bg-neutral-50">
    {#if loading && !submitted}
        <div class="flex min-h-screen items-center justify-center">
            <p class="text-neutral-500 animate-pulse">Загрузка формы...</p>
        </div>
    {:else if error && !submitted}
        <div class="flex min-h-screen items-center justify-center p-4">
            <div
                class="max-w-md rounded-md bg-paper p-8 text-center shadow-card border border-neutral-200/60"
            >
                <p class="text-alert text-lg">⚠️</p>
                <p class="mt-3 text-neutral-700">{error}</p>
            </div>
        </div>
    {:else if submitted}
        <div class="flex min-h-screen items-center justify-center p-4">
            <div
                class="max-w-md rounded-md bg-paper p-8 text-center shadow-card border border-neutral-200/60"
            >
                <p class="text-5xl">✅</p>
                <h1 class="mt-4 text-2xl font-display font-semibold text-ink">
                    Форма отправлена
                </h1>
                <p class="mt-2 text-neutral-500">
                    {companyName ? `Спасибо, ${companyName}!` : "Спасибо!"}
                    <br />Менеджер свяжется с вами для подтверждения.
                </p>
            </div>
        </div>
    {:else}
        <div class="mx-auto max-w-3xl px-3 sm:px-4 py-6 sm:py-8">
            <div class="mb-6 sm:mb-8 text-center">
                <h1 class="text-xl sm:text-2xl font-display font-semibold text-ink">
                    Форма заказа кейтеринг
                </h1>
                {#if companyName}
                    <p class="mt-1 text-neutral-500">{companyName}</p>
                {/if}
            </div>

            {#if formErrors.length > 0}
                <div
                    class="mb-6 rounded-md bg-alert/10 border border-alert/20 p-4 text-sm text-alert"
                >
                    <p class="font-medium mb-1">
                        Пожалуйста, исправьте ошибки:
                    </p>
                    <ul class="list-disc pl-4">
                        {#each formErrors as e}<li>{e}</li>{/each}
                    </ul>
                </div>
            {/if}

            <form onsubmit={handleSubmit} class="space-y-6">
                <!-- 1. Основные параметры -->
                <FormSection title="Основные параметры">
                    <FormField
                        label="Дата мероприятия *"
                        type="date"
                        bind:value={f.event_date}
                        required
                    />
                    <FormField
                        label="Дата согласования"
                        type="date"
                        bind:value={f.approval_date}
                    />
                    <FormField
                        label="Формат"
                        type="select"
                        bind:value={f.format}
                        options={FORMATS}
                    />
                    <FormField
                        label="Тема мероприятия"
                        bind:value={f.theme}
                        placeholder="Конференция, выставка, открытие..."
                    />
                    <FormField
                        label="Количество человек *"
                        type="number"
                        bind:value={f.guest_count}
                        required
                        min={1}
                    />
                    <FormField
                        label="Количество заходов"
                        type="number"
                        bind:value={f.service_rounds}
                        min={1}
                    />
                </FormSection>

                <!-- 2. Время -->
                <FormSection title="Время">
                    <FormField
                        label="Время начала *"
                        type="time"
                        bind:value={f.start_time}
                        required
                    />
                    <FormField
                        label="Время окончания"
                        type="time"
                        bind:value={f.end_time}
                    />
                    <FormField
                        label="Прибытие официантов"
                        type="time"
                        bind:value={f.waiter_arrival}
                    />
                    <FormField
                        label="Готовность столов"
                        type="time"
                        bind:value={f.tables_ready}
                    />
                    <FormField
                        label="Когда необходимо завезти оборудование"
                        bind:value={f.equipment_delivery}
                        cols
                    />
                </FormSection>

                <!-- 3. Локация -->
                <FormSection title="Локация">
                    <FormField
                        label="Адрес *"
                        bind:value={f.address}
                        required
                        cols
                    />
                    <FormField
                        label="Пропускная система"
                        bind:value={f.access_system}
                    />
                    <FormField
                        label="Расположение в здании"
                        bind:value={f.floor}
                        placeholder="Этаж, лифт, расстояния"
                    />
                    <FormField label="Карта заезда" bind:value={f.entry_map} />
                    <FormField
                        label="Электропитание"
                        bind:value={f.electricity}
                    />
                </FormSection>

                <!-- 4. Оборудование и уровень -->
                <FormSection title="Оборудование и уровень">
                    <FormField label="Столы" bind:value={f.tables_info} />
                    <FormField
                        label="Подсобное помещение"
                        bind:value={f.utility_room}
                    />
                    <FormField
                        label="Размещение баннера"
                        type="select"
                        bind:value={f.banner}
                        options={YES_NO_OPTIONS}
                    />
                    <FormField
                        label="Уровень мероприятия"
                        type="select"
                        bind:value={f.event_level}
                        options={EVENT_LEVELS}
                    />
                </FormSection>

                <!-- 5. Напитки -->
                <FormSection title="Напитки">
                    <FormField
                        label="Алкоголь"
                        bind:value={f.alcohol}
                        placeholder="Да / Нет / Какой"
                    />
                    <FormField
                        label="Вода"
                        type="select"
                        bind:value={f.water}
                        options={WATER_TYPES}
                    />
                    <FormField
                        label="Соки"
                        bind:value={f.juices}
                        placeholder="Да / Нет"
                    />
                    <FormField
                        label="Кофе"
                        type="select"
                        bind:value={f.coffee}
                        options={COFFEE_TYPES}
                    />
                </FormSection>

                <!-- 6. Прочее -->
                <FormSection title="Прочее">
                    <FormField
                        label="Горячее"
                        bind:value={f.hot_dishes}
                        placeholder="Да / Нет"
                    />
                    <FormField
                        label="Посуда"
                        type="select"
                        bind:value={f.dishware}
                        options={DISHWARE_TYPES}
                    />
                    <FormField
                        label="Дополнительные требования"
                        type="textarea"
                        bind:value={f.extra_requirements}
                        cols
                        rows={3}
                    />
                    <FormField
                        label="Комментарий к меню"
                        type="textarea"
                        bind:value={f.menu_comment}
                        cols
                        rows={2}
                    />
                </FormSection>

                <button
                    type="submit"
                    disabled={loading}
                    class="w-full rounded-md bg-signal py-3.5 text-base font-medium text-white hover:bg-signal-strong disabled:opacity-50 transition-colors duration-150"
                >
                    {loading ? "Отправка..." : "Отправить форму"}
                </button>
                <p class="text-center text-xs text-neutral-400">
                    * — обязательные поля. После отправки форма будет
                    заблокирована.
                </p>
            </form>
        </div>
    {/if}
</main>
