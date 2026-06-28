<script lang="ts">
    interface Option {
        value: string;
        label: string;
    }

    let {
        label,
        value = $bindable(""),
        options = [] as readonly Option[],
        required = false,
        disabled = false,
        error = "",
        placeholder = "",
    }: {
        label: string;
        value?: string;
        options?: readonly Option[];
        required?: boolean;
        disabled?: boolean;
        error?: string;
        placeholder?: string;
    } = $props();

    const id = `sel-${crypto.randomUUID().slice(0, 8)}`;
</script>

<div>
    <label for={id} class="block mb-1 text-sm font-medium text-neutral-700">
        {label}
        {#if required}
            <span aria-hidden="true" class="text-alert">*</span>
        {/if}
    </label>
    <select
        {id}
        bind:value
        {disabled}
        {required}
        class={`w-full rounded-md border px-3 py-2 text-sm font-body transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-offset-0
            disabled:opacity-40 disabled:cursor-not-allowed
            ${
                error
                    ? "border-alert focus:ring-alert/30"
                    : "border-neutral-300 focus:border-ink focus:ring-ink/15 hover:border-neutral-400"
            }`}
    >
        {#if placeholder}
            <option value="">{placeholder}</option>
        {/if}
        {#each options as opt}
            <option value={opt.value}>{opt.label}</option>
        {/each}
    </select>
    {#if error}
        <p class="mt-1 text-xs text-alert">{error}</p>
    {/if}
</div>
