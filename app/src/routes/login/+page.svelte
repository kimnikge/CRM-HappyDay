<script lang="ts">
    import { auth } from "$lib/stores/auth.svelte";
    import { supabase } from "$lib/supabase";
    import Button from "$lib/components/ui/Button.svelte";

    type LoginMode = "password" | "magic-link" | "register";

    let mode = $state<LoginMode>("password");
    let email = $state("");
    let password = $state("");
    let fullName = $state("");
    let error = $state("");
    let success = $state("");
    let loading = $state(false);
    let resetSent = $state(false); // G20

    function switchMode(newMode: LoginMode) {
        mode = newMode;
        error = "";
        success = "";
        resetSent = false;
        password = "";
    }

    async function loginWithPassword(e: SubmitEvent) {
        e.preventDefault();
        loading = true;
        error = "";

        const errMsg = await auth.signIn(email, password);
        if (errMsg) {
            error = errMsg;
            loading = false;
        }
    }

    async function sendMagicLink(e: SubmitEvent) {
        e.preventDefault();
        loading = true;
        error = "";
        success = "";

        const errMsg = await auth.signInWithOtp(email);
        if (errMsg) {
            error = errMsg;
            loading = false;
        } else {
            success = "Ссылка для входа отправлена на почту. Проверьте письмо.";
            loading = false;
        }
    }

    // Регистрация нового пользователя
    async function register(e: SubmitEvent) {
        e.preventDefault();
        if (!fullName.trim()) {
            error = "Введите имя";
            return;
        }
        loading = true;
        error = "";
        success = "";

        const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName.trim() },
                emailRedirectTo: `${location.origin}/`,
            },
        });

        if (signUpError) {
            error = signUpError.message || "Ошибка регистрации";
            loading = false;
        } else {
            success = "Регистрация успешна! Проверьте почту для подтверждения.";
            loading = false;
        }
    }

    // G20: Password reset
    async function resetPassword() {
        if (!email) {
            error = "Введите email";
            return;
        }
        loading = true;
        error = "";
        success = "";

        try {
            const { error: err } = await supabase.auth.resetPasswordForEmail(
                email,
                { redirectTo: `${location.origin}/login` },
            );
            if (err) {
                error = err.message || "Ошибка отправки";
            } else {
                resetSent = true;
                success = "Инструкция по восстановлению пароля отправлена на почту.";
            }
        } catch {
            error = "Сетевая ошибка";
        }
        loading = false;
    }

    function handleSubmit(e: SubmitEvent) {
        if (mode === "register") register(e);
        else if (mode === "password") loginWithPassword(e);
        else sendMagicLink(e);
    }
</script>

<main class="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
    <form
        onsubmit={handleSubmit}
        class="w-full max-w-sm rounded-md bg-paper p-8 shadow-card border border-neutral-200"
    >
        <div class="mb-8 text-center">
            <span class="text-3xl" aria-hidden="true">🍽️</span>
            <h1 class="mt-2 text-xl font-display font-semibold text-ink">
                Catering CRM
            </h1>
            <p class="mt-1 text-sm text-neutral-500">
                Управление заказами кейтеринга
            </p>
        </div>

        <!-- Tab switcher -->
        <div class="mb-6 flex rounded-md bg-neutral-100 p-1" role="tablist">
            <button
                type="button"
                role="tab"
                aria-selected={mode === "password"}
                class={`flex-1 rounded-sm px-2 py-2 text-xs font-medium transition-colors duration-150
                    ${mode === "password" ? "bg-paper text-ink shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
                onclick={() => switchMode("password")}
            >
                Пароль
            </button>
            <button
                type="button"
                role="tab"
                aria-selected={mode === "magic-link"}
                class={`flex-1 rounded-sm px-2 py-2 text-xs font-medium transition-colors duration-150
                    ${mode === "magic-link" ? "bg-paper text-ink shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
                onclick={() => switchMode("magic-link")}
            >
                Без пароля
            </button>
            <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                class={`flex-1 rounded-sm px-2 py-2 text-xs font-medium transition-colors duration-150
                    ${mode === "register" ? "bg-paper text-ink shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
                onclick={() => switchMode("register")}
            >
                Регистрация
            </button>
        </div>

        {#if error}
            <div
                class="mb-4 rounded-md bg-alert/10 border border-alert/20 p-3 text-sm text-alert"
                role="alert"
            >
                {error}
            </div>
        {/if}

        {#if success}
            <div
                class="mb-4 rounded-md bg-mint/10 border border-mint/20 p-3 text-sm text-mint"
                role="status"
            >
                {success}
            </div>
        {/if}

        {#if mode === "register"}
            <label
                for="reg-name"
                class="mb-1.5 block text-sm font-medium text-neutral-700"
            >
                ФИО
            </label>
            <input
                id="reg-name"
                type="text"
                bind:value={fullName}
                required
                class="mb-4 w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm font-body
                       placeholder:text-neutral-400
                       focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink
                       hover:border-neutral-400 transition-colors duration-150"
                placeholder="Иванов Иван"
            />
        {/if}

        <label
            for="login-email"
            class="mb-1.5 block text-sm font-medium text-neutral-700"
        >
            Email
        </label>
        <input
            id="login-email"
            type="email"
            bind:value={email}
            required
            autocomplete="email"
            class="mb-4 w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm font-body
                   placeholder:text-neutral-400
                   focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink
                   hover:border-neutral-400 transition-colors duration-150"
            placeholder="manager@catering.ru"
        />

        {#if mode === "password" || mode === "register"}
            <label
                for="login-password"
                class="mb-1.5 block text-sm font-medium text-neutral-700"
            >
                Пароль
            </label>
            <input
                id="login-password"
                type="password"
                bind:value={password}
                required
                autocomplete={mode === "register" ? "new-password" : "current-password"}
                class="mb-2 w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm font-body
                       placeholder:text-neutral-400
                       focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink
                       hover:border-neutral-400 transition-colors duration-150"
                placeholder="••••••"
            />
        {/if}

        {#if mode === "password"}
            <!-- G20: Forgot password -->
            <button
                type="button"
                class="mb-4 text-xs text-signal hover:underline bg-transparent border-0 p-0 cursor-pointer"
                onclick={() => resetPassword()}
            >
                {resetSent ? "Отправить ещё раз" : "Забыли пароль?"}
            </button>

            <Button type="submit" variant="primary" full {loading}>
                {loading ? "Вход..." : "Войти"}
            </Button>
        {:else if mode === "register"}
            <p class="mb-4 text-xs text-neutral-500 leading-relaxed">
                После регистрации на почту придёт письмо для подтверждения.
            </p>

            <Button type="submit" variant="primary" full {loading}>
                {loading ? "Регистрация..." : "Зарегистрироваться"}
            </Button>
        {:else}
            <p class="mb-6 text-xs text-neutral-500 leading-relaxed">
                Введите email — мы отправим на него одноразовую ссылку для
                входа. Пароль не нужен.
            </p>

            <Button type="submit" variant="primary" full {loading}>
                {loading ? "Отправка..." : "Получить ссылку для входа"}
            </Button>
        {/if}
    </form>
</main>
