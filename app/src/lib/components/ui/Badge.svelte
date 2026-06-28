<script lang="ts">
    let {
        variant = "neutral" as "neutral" | "success" | "warning" | "danger",
        children,
    }: {
        variant?: "neutral" | "success" | "warning" | "danger";
        children: import("svelte").Snippet;
    } = $props();

    const variantMap: Record<string, string> = {
        neutral: "bg-neutral-100 text-neutral-700",
        success: "bg-mint/15 text-mint",
        warning: "bg-signal/15 text-signal",
        danger: "bg-alert/15 text-alert",
    };
</script>

<span
    class={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium ${variantMap[variant]}`}
>
    {@render children()}
</span>
