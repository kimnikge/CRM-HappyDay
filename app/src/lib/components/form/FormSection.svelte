<script lang="ts">
    import { type Snippet } from "svelte";

    let {
        title,
        cols = 2,
        accent = "" as "" | "signal" | "mint" | "steel" | "ink",
        children,
    }: {
        title: string;
        cols?: number;
        accent?: "" | "signal" | "mint" | "steel" | "ink";
        children: Snippet;
    } = $props();

    // Map cols to responsive Tailwind grid classes
    const gridClass = $derived(
        cols === 1
            ? "grid-cols-1"
            : cols === 2
              ? "grid-cols-1 sm:grid-cols-2"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    );

    const accentBar = $derived(
        accent === "signal"
            ? "bg-signal"
            : accent === "mint"
              ? "bg-mint"
              : accent === "steel"
                ? "bg-neutral-400"
                : accent === "ink"
                  ? "bg-ink"
                  : "",
    );
</script>

<section
    class="rounded-lg bg-paper shadow-card border border-neutral-200/60 overflow-hidden"
>
    {#if accentBar}
        <div class={`h-1 w-full ${accentBar}`} aria-hidden="true"></div>
    {/if}
    <div class="p-4 sm:p-5 {accentBar ? '' : ''}">
        <h2
            class="mb-3 sm:mb-4 text-sm sm:text-base font-display font-semibold text-ink tracking-tight"
        >
            {title}
        </h2>
        <div class="grid gap-3 sm:gap-4 {gridClass}">
            {@render children()}
        </div>
    </div>
</section>
