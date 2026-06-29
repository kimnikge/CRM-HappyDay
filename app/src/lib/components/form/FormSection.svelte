<script lang="ts">
    import { type Snippet } from "svelte";

    let {
        title,
        cols = 2,
        children,
    }: {
        title: string;
        cols?: number;
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
</script>

<section
    class="rounded-md bg-paper p-4 sm:p-6 shadow-card border border-neutral-200/60"
>
    <h2
        class="mb-3 sm:mb-4 text-sm sm:text-base font-display font-semibold text-ink"
    >
        {title}
    </h2>
    <div class="grid gap-3 sm:gap-4 {gridClass}">
        {@render children()}
    </div>
</section>
