<script lang="ts">
    import { page } from "$app/state";

    const status = $derived(page.status);

    const title = $derived(
        status === 404
            ? "Страница не найдена"
            : status === 403
              ? "Доступ запрещён"
              : status === 401
                ? "Нужно войти в систему"
                : status >= 500
                  ? "Что-то пошло не так"
                  : "Ошибка",
    );

    /** Показываем сообщение сервера, если оно осмысленное; иначе — понятный русский текст. */
    const message = $derived.by(() => {
        const serverMessage = page.error?.message?.trim() ?? "";
        if (serverMessage && serverMessage !== "Not Found") {
            return serverMessage;
        }
        return status === 404
            ? "Запрашиваемая страница не существует или была перемещена."
            : "Попробуйте обновить страницу или вернуться на главную.";
    });
</script>

<svelte:head>
    <title>{status} — Catering CRM</title>
    <meta name="robots" content="noindex" />
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
    <div
        class="w-full max-w-md rounded-md border border-neutral-200 bg-paper p-8 text-center shadow-card"
    >
        <p
            class="font-display text-4xl font-semibold text-ink"
            aria-hidden="true"
        >
            {status}
        </p>
        <h1 class="mt-2 font-display text-lg font-semibold text-ink">
            {title}
        </h1>
        <p class="mt-2 text-sm text-neutral-600">{message}</p>

        <a
            href="/"
            class="mt-6 inline-flex items-center justify-center rounded-md bg-signal px-4 py-2 text-sm font-medium text-white no-underline transition-colors duration-150 hover:bg-signal-strong"
        >
            На главную
        </a>

        <p
            class="mt-6 border-t border-neutral-200 pt-4 text-xs text-neutral-400"
        >
            Catering CRM
        </p>
    </div>
</main>
