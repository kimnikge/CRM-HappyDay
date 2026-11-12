/*
    Toast store — глобальные транзиентные уведомления.

    Usage:
      import { toasts } from '$lib/stores/toasts.svelte';
      toasts.push("Заказ сохранён");            // success
      toasts.push("Не удалось сохранить", "error");
      toasts.dismiss(id);

    Уведомление скрывается автоматически через ~4 с; закрыть можно вручную
    (ToastHost) или вызовом dismiss(id). Для ошибок валидации полей тосты
    не используются — такие сообщения остаются inline у самого поля.
*/
export type ToastType = "success" | "error" | "info";

export interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

/** Автоскрытие по умолчанию, мс. */
const DEFAULT_DURATION = 4000;

class ToastStore {
    /** Активные уведомления в порядке появления. */
    toasts = $state<Toast[]>([]);

    private nextId = 1;
    private timers = new Map<number, ReturnType<typeof setTimeout>>();

    /** Показать уведомление. Возвращает id (для dismiss). */
    push(
        message: string,
        type: ToastType = "success",
        duration = DEFAULT_DURATION,
    ): number {
        const text = message.trim();
        const id = this.nextId++;
        if (!text) return id;

        this.toasts = [...this.toasts, { id, message: text, type }];

        if (duration > 0) {
            this.timers.set(
                id,
                setTimeout(() => this.dismiss(id), duration),
            );
        }
        return id;
    }

    dismiss(id: number) {
        const timer = this.timers.get(id);
        if (timer !== undefined) {
            clearTimeout(timer);
            this.timers.delete(id);
        }
        this.toasts = this.toasts.filter((toast) => toast.id !== id);
    }

    /** Скрыть все уведомления и снять таймеры. */
    clear() {
        for (const timer of this.timers.values()) clearTimeout(timer);
        this.timers.clear();
        this.toasts = [];
    }
}

export const toasts = new ToastStore();
