<script lang="ts">
    import { rawToFormatted } from "$lib/utils/phone-format";

    let {
        label,
        type = "text" as
            | "text"
            | "number"
            | "date"
            | "time"
            | "email"
            | "password"
            | "search"
            | "tel",
        value = $bindable("" as string | number | null),
        placeholder = "",
        required = false,
        disabled = false,
        error = "",
        hint = "",
        phone = false,
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
            | "search"
            | "tel";
        value?: string | number | null;
        placeholder?: string;
        required?: boolean;
        disabled?: boolean;
        error?: string;
        hint?: string;
        phone?: boolean;
        min?: number;
        max?: number;
        step?: number;
    } = $props();

    const id = `inp-${crypto.randomUUID().slice(0, 8)}`;

    function handleInput(e: Event) {
        const target = e.target as HTMLInputElement;
        if (type === "number") {
            value = target.value === "" ? null : Number(target.value);
        } else if (phone) {
            const cursor = target.selectionStart ?? 0;
            const oldVal = target.value;

            // Strip everything except + and digits; keep only one + at the start
            const clean = oldVal.replace(/[^+\d]/g, "");
            const plus = clean.startsWith("+") ? "+" : "";
            const digits = clean.replace(/\D/g, "");
            const raw = plus + digits;

            // Count meaningful chars (digits/+) before cursor in original value
            let meaningfulBefore = 0;
            for (let i = 0; i < Math.min(cursor, oldVal.length); i++) {
                if (oldVal[i] === "+" || /\d/.test(oldVal[i]))
                    meaningfulBefore++;
            }

            const formatted = rawToFormatted(raw);

            // Find cursor position in formatted: after `meaningfulBefore` meaningful chars
            let mc = 0;
            let newCursor = formatted.length; // default: end
            for (let i = 0; i < formatted.length; i++) {
                if (formatted[i] === "+" || /\d/.test(formatted[i])) {
                    mc++;
                    if (mc === meaningfulBefore) newCursor = i + 1;
                }
            }

            value = formatted;
            // Force DOM update (letters would otherwise persist)
            if (target.value !== formatted) {
                target.value = formatted;
            }
            requestAnimationFrame(() => {
                target.setSelectionRange(newCursor, newCursor);
            });
        } else {
            value = target.value;
        }
    }

    function handleFocus(e: FocusEvent) {
        if (!phone) return;
        const target = e.target as HTMLInputElement;
        const raw = target.value.replace(/[^+\d]/g, "");

        if (!raw || raw === "+") {
            // Empty → start with +7
            value = "+7 ";
            requestAnimationFrame(() => {
                target.setSelectionRange(3, 3);
            });
        } else if (!raw.startsWith("+")) {
            // Has digits but no + → add it
            value = rawToFormatted("+" + raw);
        } else {
            // Already has +, just apply formatting
            value = rawToFormatted(raw);
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (!phone) return;
        const target = e.target as HTMLInputElement;
        if (e.key === "Backspace") {
            const cursor = target.selectionStart ?? 0;
            const beforeChar = target.value[cursor - 1];
            // If cursor is right after a formatting char, delete the digit before it
            if (beforeChar && /[()\s-]/.test(beforeChar)) {
                e.preventDefault();
                // Count meaningful chars before (cursor - 1) → that's how many to keep
                let meaningfulBefore = 0;
                for (let i = 0; i < cursor - 1; i++) {
                    if (target.value[i] === "+" || /\d/.test(target.value[i])) {
                        meaningfulBefore++;
                    }
                }
                const raw = target.value.replace(/[^+\d]/g, "");
                const newRaw =
                    raw.slice(0, meaningfulBefore - 1) +
                    raw.slice(meaningfulBefore);
                const formatted = rawToFormatted(newRaw);
                value = formatted;
                target.value = formatted;
                // Place cursor after (meaningfulBefore - 1) meaningful chars
                let mc = 0;
                let newCursor = 0;
                for (let i = 0; i < formatted.length; i++) {
                    if (formatted[i] === "+" || /\d/.test(formatted[i])) mc++;
                    if (mc >= meaningfulBefore) break;
                    newCursor = i + 1;
                }
                requestAnimationFrame(() => {
                    target.setSelectionRange(newCursor, newCursor);
                });
            }
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
        type={phone ? "tel" : type}
        inputmode={phone ? "numeric" : undefined}
        {placeholder}
        {disabled}
        {required}
        {min}
        {max}
        {step}
        value={value == null ? "" : String(value)}
        oninput={handleInput}
        onfocus={handleFocus}
        onkeydown={handleKeydown}
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
