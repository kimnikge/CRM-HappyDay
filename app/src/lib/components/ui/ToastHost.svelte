<script lang="ts">
    import { toasts, type ToastType } from "$lib/stores/toasts.svelte";

    /**
     * Единственный экземпляр смонтирован в корневом +layout.svelte,
     * поэтому уведомления видны на любом экране.
     * raised — поднимает хост над нижней плашкой «Доступно обновление»,
     * чтобы они не перекрывались.
     */
    let { raised = false }: { raised?: boolean } = $props();

    const ACCENT: Record<ToastType, string> = {
        success: "border-l-mint",
        error: "border-l-alert",
        info: "border-l-signal",
    };
    const ICON: Record<ToastType, string> = {
        success: "✓",
        error: "!",
        info: "i",
    };
    const ICON_COLOR: Record<ToastType, string> = {
        success: "text-mint",
        error: "text-alert",
        info: "text-signal",
    };
</script>

<div
    class="pointer-events-none fixed left-4 right-4 z-[500] flex flex-col items-stretch gap-2 sm:left-auto sm:w-96"
    style={`bottom: ${raised
        ? "calc(4.75rem + env(safe-area-inset-bottom))"
        : "calc(1rem + env(safe-area-inset-bottom))"};`}
>
    {#each toasts.toasts as toast (toast.id)}
        <div
            class="toast-in pointer-events-auto flex w-full items-start gap-2.5 rounded-md border border-neutral-200/60 border-l-4 bg-paper px-3 py-2.5 text-sm text-ink shadow-card {ACCENT[
                toast.type
            ]}"
            role={toast.type === "error" ? "alert" : "status"}
            aria-live={toast.type === "error" ? "assertive" : "polite"}
            aria-atomic="true"
        >
            <span
                class="mt-0.5 shrink-0 text-xs font-bold {ICON_COLOR[toast.type]}"
                aria-hidden="true">{ICON[toast.type]}</span
            >
            <span class="min-w-0 flex-1 break-words">{toast.message}</span>
            <button
                type="button"
                class="shrink-0 rounded p-0.5 text-neutral-400 transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                aria-label="Закрыть уведомление"
                onclick={() => toasts.dismiss(toast.id)}>✕</button
            >
        </div>
    {/each}
</div>

<style>
    /* Появление снизу; при prefers-reduced-motion анимация отключается. */
    .toast-in {
        animation: toast-in 180ms var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1))
            both;
    }

    @keyframes toast-in {
        from {
            opacity: 0;
            transform: translateY(8px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .toast-in {
            animation: none;
        }
    }
</style>
