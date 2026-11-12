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

    // Text-like and numeric fields are bound straight through to `value`:
    // Input owns the conversion (a number field writes a number, or null when
    // empty; date/time/text stay strings), so no effect bridge is needed and
    // numeric values are never flattened to strings.
    //
    // <select> and <textarea> only speak strings, so they get a one-way
    // string view of `value` plus an explicit write on user input — still no
    // write-back effect, hence no feedback loop.
    const stringValue = $derived(value == null ? "" : String(value));

    function onSelectChange(e: Event) {
        const target = e.target;
        if (target instanceof HTMLSelectElement) value = target.value;
    }

    function onTextareaInput(e: Event) {
        value = (e.currentTarget as HTMLTextAreaElement).value;
    }

    const id = `ff-${crypto.randomUUID().slice(0, 8)}`;
</script>

<div class={cols ? "col-span-full" : ""}>
    {#if type === "select"}
        <!-- change events bubble from the native select rendered by Select -->
        <div onchange={onSelectChange}>
            <Select
                {label}
                value={stringValue}
                {required}
                {options}
                placeholder={placeholder || "—"}
            />
        </div>
    {:else if type === "textarea"}
        <label for={id} class="block mb-1 text-sm font-medium text-neutral-700"
            >{label}</label
        >
        <textarea
            {id}
            value={stringValue}
            oninput={onTextareaInput}
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
            bind:value={value}
            {required}
            {placeholder}
            {min}
        />
    {/if}
</div>
