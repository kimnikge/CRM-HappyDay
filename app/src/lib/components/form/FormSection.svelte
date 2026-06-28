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
</script>

<section
    class="rounded-md bg-paper p-6 shadow-card border border-neutral-200/60"
>
    <h2 class="mb-4 text-base font-display font-semibold text-ink">{title}</h2>
    <div
        class="grid gap-4"
        style="grid-template-columns: repeat({cols}, minmax(0, 1fr))"
    >
        {@render children()}
    </div>
</section>
