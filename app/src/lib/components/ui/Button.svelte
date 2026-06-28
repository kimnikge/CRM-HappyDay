<script lang="ts">
    let {
        variant = "primary" as "primary" | "secondary" | "ghost" | "danger",
        size = "md" as "sm" | "md" | "lg",
        type = "button" as "submit" | "button" | "reset",
        disabled = false,
        loading = false,
        full = false,
        href = "",
        onclick,
        children,
    }: {
        variant?: "primary" | "secondary" | "ghost" | "danger";
        size?: "sm" | "md" | "lg";
        type?: "submit" | "button" | "reset";
        disabled?: boolean;
        loading?: boolean;
        full?: boolean;
        href?: string;
        onclick?: (e: MouseEvent) => void;
        children: import("svelte").Snippet;
    } = $props();

    const base =
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-40 disabled:cursor-not-allowed rounded-md select-none";

    const sizeMap: Record<string, string> = {
        sm: "px-3 py-1.5 text-xs",
        md: "px-4 py-2 text-sm",
        lg: "px-6 py-2.5 text-base",
    };

    const variantMap: Record<string, string> = {
        primary:
            "bg-signal text-white hover:bg-signal-strong active:scale-[0.98]",
        secondary: "bg-steel text-ink hover:bg-neutral-300 active:scale-[0.98]",
        ghost: "bg-transparent text-neutral-600 hover:bg-neutral-100 hover:text-ink",
        danger: "bg-alert text-white hover:opacity-90 active:scale-[0.98]",
    };
</script>

{#if href}
    <a
        {href}
        class={`${base} ${sizeMap[size]} ${variantMap[variant]} ${full ? "w-full" : ""} no-underline`}
    >
        {#if loading}
            <span aria-hidden="true" class="i-spinner"></span>
        {/if}
        {@render children()}
    </a>
{:else}
    <button
        {type}
        {disabled}
        {onclick}
        class={`${base} ${sizeMap[size]} ${variantMap[variant]} ${full ? "w-full" : ""}`}
    >
        {#if loading}
            <span aria-hidden="true" class="i-spinner animate-spin"></span>
        {/if}
        {@render children()}
    </button>
{/if}
