<script lang="ts">
    import { onMount } from "svelte";
    import { supabase } from "$lib/supabase";
    import { auth } from "$lib/stores/auth.svelte";
    import Header from "$lib/components/Header.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Input from "$lib/components/ui/Input.svelte";

    let fullName = $state("");
    let phone = $state("");
    let loading = $state(true);
    let saving = $state(false);
    let error = $state("");
    let success = $state("");

    async function load() {
        const { data } = await supabase
            .from("profiles")
            .select("full_name, phone")
            .eq("id", auth.session?.user?.id)
            .single();
        if (data) {
            fullName = data.full_name || "";
            phone = data.phone || "";
        }
        loading = false;
    }

    async function save(e: SubmitEvent) {
        e.preventDefault();
        saving = true;
        error = "";
        success = "";

        const { error: err } = await supabase
            .from("profiles")
            .update({ full_name: fullName, phone: phone || null })
            .eq("id", auth.session?.user?.id);

        if (err) {
            error = err.message;
        } else {
            success = "Сохранено";
            setTimeout(() => (success = ""), 2000);
        }
        saving = false;
    }

    onMount(load);
</script>

<main class="min-h-screen bg-neutral-50">
    <Header />

    <div class="mx-auto max-w-md px-3 sm:px-6 py-4 sm:py-6">
        <h2
            class="text-lg sm:text-xl font-display font-semibold text-ink mb-4 sm:mb-6"
        >
            Профиль
        </h2>

        {#if loading}
            <p class="text-sm text-neutral-400">Загрузка...</p>
        {:else}
            <form onsubmit={save} class="space-y-4">
                {#if error}
                    <div
                        class="rounded-md bg-alert/10 border border-alert/20 p-3 text-sm text-alert"
                    >
                        {error}
                    </div>
                {/if}
                {#if success}
                    <div
                        class="rounded-md bg-mint/10 border border-mint/20 p-3 text-sm text-mint"
                    >
                        {success}
                    </div>
                {/if}

                <div>
                    <label
                        for="pf-email"
                        class="block mb-1 text-sm font-medium text-neutral-700"
                        >Email</label
                    >
                    <input
                        id="pf-email"
                        type="email"
                        value={auth.session?.user?.email ?? ""}
                        disabled
                        class="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-body bg-neutral-100 text-neutral-500 cursor-not-allowed"
                    />
                </div>

                <div>
                    <label
                        for="pf-name"
                        class="block mb-1 text-sm font-medium text-neutral-700"
                        >ФИО</label
                    >
                    <input
                        id="pf-name"
                        type="text"
                        bind:value={fullName}
                        class="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-body
                               placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink
                               hover:border-neutral-400 transition-colors duration-150"
                    />
                </div>

                <div>
                    <Input label="Телефон" bind:value={phone} phone />
                </div>

                <Button type="submit" variant="primary" full loading={saving}>
                    {saving ? "Сохранение..." : "Сохранить"}
                </Button>
            </form>
        {/if}
    </div>
</main>
