<script lang="ts">
    let {
        label,
        type = "text" as
            | "text"
            | "number"
            | "date"
            | "time"
            | "email"
            | "password"
            | "search",
        value = $bindable("" as string | number | null),
        placeholder = "",
        required = false,
        disabled = false,
        error = "",
        hint = "",
        min,
        max,
        step,
    }: {
        label: string;
        type?:
            | "text"
            | "number"
            | "date"
            | "time"
            | "email"
            | "password"
            | "search";
        value?: string | number | null;
        placeholder?: string;
        required?: boolean;
        disabled?: boolean;
        error?: string;
        hint?: string;
        min?: number;
        max?: number;
        step?: number;
    } = $props();

    const id = `inp-${crypto.randomUUID().slice(0, 8)}`;

    function handleInput(e: Event) {
        const target = e.target as HTMLInputElement;
        if (type === "number") {
            value = target.value === "" ? null : Number(target.value);
        } else {
            value = target.value;
        }
    }
</script>

<div>
    <label for={id} class="block mb-1 text-sm font-medium text-neutral-700">
        {label}
        {#if required}
            <span aria-hidden="true" class="text-alert">*</span>
        {/if}
    </label>
    <input
        {id}
        {type}
        {placeholder}
        {disabled}
        {required}
        {min}
        {max}
        {step}
        value={value == null ? "" : String(value)}
        oninput={handleInput}
        class={`w-full rounded-md border px-3 py-2 text-sm font-body transition-colors duration-150
            placeholder:text-neutral-400
            focus:outline-none focus:ring-2 focus:ring-offset-0
            disabled:opacity-40 disabled:cursor-not-allowed
            ${
                error
                    ? "border-alert focus:ring-alert/30"
                    : "border-neutral-300 focus:border-ink focus:ring-ink/15 hover:border-neutral-400"
            }`}
    />
    {#if error}
        <p class="mt-1 text-xs text-alert">{error}</p>
    {:else if hint}
        <p class="mt-1 text-xs text-neutral-500">{hint}</p>
    {/if}
</div>
