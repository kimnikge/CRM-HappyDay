<script lang="ts">
    /**
     * Tag — colored pill for format/category display.
     * E.g. <Tag format="банкет">Банкет</Tag>
     *
     * Color auto-derived from FORMAT_COLORS config mapping.
     */
    import { FORMAT_COLORS, DEFAULT_FORMAT_COLOR } from "$lib/config";

    let {
        format = "",
        children,
    }: {
        format?: string;
        children: import("svelte").Snippet;
    } = $props();

    function colorClass(fmt: string): string {
        if (!fmt) return "bg-format-default/20 text-format-default";
        const key = fmt.toLowerCase();
        const map: Record<string, string> = {
            банкет: "bg-format-banquet/15 text-format-banquet",
            фуршет: "bg-format-furshet/15 text-format-furshet",
            "кофе-брейк": "bg-format-coffee/15 text-format-coffee",
            коктейль: "bg-format-cocktail/15 text-format-cocktail",
            буфет: "bg-format-buffet/15 text-format-buffet",
        };
        return map[key] ?? "bg-format-default/20 text-format-default";
    }

    const dotMap: Record<string, string> = {
        банкет: "bg-format-banquet",
        фуршет: "bg-format-furshet",
        "кофе-брейк": "bg-format-coffee",
        коктейль: "bg-format-cocktail",
        буфет: "bg-format-buffet",
    };

    function dotClass(fmt: string): string {
        return dotMap[fmt.toLowerCase()] ?? "bg-format-default";
    }
</script>

<span
    class={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium ${colorClass(format)}`}
>
    <span
        class={`inline-block h-2 w-2 rounded-full ${dotClass(format)}`}
        aria-hidden="true"
    ></span>
    {@render children()}
</span>
