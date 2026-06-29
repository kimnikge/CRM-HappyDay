<script lang="ts">
    import Input from "$lib/components/ui/Input.svelte";
    import Select from "$lib/components/ui/Select.svelte";

    interface Option {
        value: string;
        label: string;
    }

    let {
        label,
        type = "text",
        value = $bindable("" as string | number | null),
        required = false,
        placeholder = "",
        options = [] as readonly Option[],
        cols = false,
        rows = 2,
        phone = false,
        min,
    }: {
        label: string;
        type?:
            | "text"
            | "number"
            | "date"
            | "time"
            | "email"
            | "select"
            | "textarea";
        value?: string | number | null;
        required?: boolean;
        placeholder?: string;
        options?: readonly Option[];
        cols?: boolean;
        rows?: number;
        phone?: boolean;
        min?: number;
    } = $props();

    // Bridge: HTML inputs work with strings, convert null ↔ ""
    // NOTE: never pass undefined through bind: — Svelte 5 throws props_invalid_value
    // when bind:value={undefined} is used on a prop with a fallback value.
    let inputValue = $state(value == null ? "" : String(value));
    $effect(() => {
        inputValue = value == null ? "" : String(value);
    });
    $effect(() => {
        value = inputValue === "" ? null : inputValue;
    });

    const id = `ff-${crypto.randomUUID().slice(0, 8)}`;
</script>

<div class={cols ? "col-span-full" : ""}>
    {#if type === "select"}
        <Select
            {label}
            bind:value={inputValue}
            {required}
            {options}
            placeholder={placeholder || "—"}
        />
    {:else if type === "textarea"}
        <label for={id} class="block mb-1 text-sm font-medium text-neutral-700"
            >{label}</label
        >
        <textarea
            {id}
            bind:value={inputValue}
            {rows}
            class="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-body
                   placeholder:text-neutral-400
                   focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink
                   hover:border-neutral-400 transition-colors duration-150"
        ></textarea>
    {:else}
        <Input
            {label}
            {type}
            {phone}
            bind:value={inputValue}
            {required}
            {placeholder}
            {min}
        />
    {/if}
</div>
