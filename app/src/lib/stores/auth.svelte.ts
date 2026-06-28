/*
    Auth store — reactive session manager.
    Handles: init race, token refresh, error states, session expiry.

    Usage:
      import { auth } from '$lib/stores/auth.svelte';
      auth.session  — reactive session (null until init)
      auth.ready    — true when init complete
      auth.error    — init/auth error message, null if OK
*/
import { browser } from "$app/environment";
    import { supabase } from "$lib/supabase";
    import { goto } from "$app/navigation";

    type Session = Awaited<
        ReturnType<typeof supabase.auth.getSession>
    >["data"]["session"];

    class AuthStore {
        session = $state<Session | null>(null);
        loading = $state(true);
        error = $state<string | null>(null);
        ready = $state(false);
        role = $state<string | null>(null); // 'admin' | 'pending' | null

        private initPromise: Promise<void> | null = null;
        private unsubscribe: (() => void) | null = null;

        constructor() {
            if (browser) {
                this.initPromise = this.init();
            }
        }

        /** Wait for init to complete. Safe to call multiple times. */
        async waitForInit(): Promise<void> {
            if (this.initPromise) await this.initPromise;
        }

        private async init() {
            try {
                const {
                    data: { session },
                    error: sessionError,
                } = await supabase.auth.getSession();

                if (sessionError) {
                    this.error = "Ошибка подключения к серверу авторизации";
                    console.error("[Auth] getSession failed:", sessionError);
                }

                this.session = session;

                // Check role for returning users
                if (session) {
                    const err = await this.checkAccess();
                    if (err) {
                        await supabase.auth.signOut();
                        this.session = null;
                        this.error = err;
                    }
                }

                const { data } = supabase.auth.onAuthStateChange(
                    (event, session) => {
                        if (event === "SIGNED_OUT") {
                            this.session = null;
                        } else if (session) {
                            this.session = session;
                        }
                    },
                );

                this.unsubscribe = data.subscription.unsubscribe;
            } catch (err) {
                this.error =
                    "Не удалось подключиться к серверу. Проверьте соединение.";
                console.error("[Auth] init failed:", err);
            } finally {
                this.loading = false;
                this.ready = true;
            }
        }

        async signIn(
            email: string,
            password: string,
        ): Promise<string | null> {
            try {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) {
                    if (error.message?.includes("Invalid login")) {
                        return "Неверный email или пароль";
                    }
                    return error.message || "Ошибка входа";
                }

                // Wait for onAuthStateChange to update session
                await this.waitForSession();

                // Check if user is approved
                const accessError = await this.checkAccess();
                if (accessError) {
                    await supabase.auth.signOut();
                    this.session = null;
                    return accessError;
                }

                goto("/");
                return null;
            } catch {
                return "Сетевая ошибка. Проверьте соединение.";
            }
        }

        /**
         * Passwordless login via magic link (one-time code).
         * Sends an email with a login link. When the user clicks it,
         * they are redirected back and the session is established.
         *
         * Returns null on success, error message string on failure.
         */
        async signInWithOtp(email: string): Promise<string | null> {
            try {
                const { error } = await supabase.auth.signInWithOtp({
                    email,
                    options: {
                        emailRedirectTo: `${location.origin}/`,
                    },
                });

                if (error) {
                    return error.message || "Ошибка отправки ссылки";
                }

                return null; // success — email sent
            } catch {
                return "Сетевая ошибка. Проверьте соединение.";
            }
        }

        async signOut() {
            try {
                await supabase.auth.signOut();
            } catch {
                // Still clear local state even if server call fails
            }
            this.session = null;
            goto("/login");
        }

        /** Poll until session is available (post-login redirect) */
        private async waitForSession(timeoutMs = 3000): Promise<void> {
            const start = Date.now();
            while (!this.session && Date.now() - start < timeoutMs) {
                await new Promise((r) => setTimeout(r, 50));
            }
        }

        /** Check if user's role allows access. Returns error message or null. */
        async checkAccess(): Promise<string | null> {
            if (!this.session?.user?.id) return null;

            try {
                const { data } = await supabase
                    .from("profiles")
                    .select("role")
                    .eq("id", this.session.user.id)
                    .single();

                this.role = data?.role ?? null;

                if (this.role === "pending") {
                    return "Ваша учётная запись ожидает подтверждения администратором.";
                }

                return null;
            } catch {
                return null;
            }
        }

        destroy() {
            this.unsubscribe?.();
        }
    }

export const auth = new AuthStore();
