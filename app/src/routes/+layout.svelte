<script lang="ts">
	import { onMount } from "svelte";
	import { browser } from "$app/environment";
	import { page } from "$app/state";
	import Header from "$lib/components/Header.svelte";
	import "../app.css";

	let { children } = $props();

	/**
	 * App shell: Header + <main> rendered once for every authenticated screen.
	 * Public screens (/login, /form/[token]) render standalone, and error pages
	 * provide their own full-screen <main>, so the shell is skipped there to
	 * avoid a nested <main>.
	 */
	const isPublicRoute = $derived(
		page.url.pathname === "/login" ||
			page.url.pathname.startsWith("/form/"),
	);
	const showShell = $derived(!isPublicRoute && page.error === null);

	let updateReady = $state(false);
	let waitingWorker = $state<ServiceWorker | null>(null);
	// Set only when the user explicitly accepts the update, so we reload once
	// the new worker takes control (and not on the very first install).
	let reloadOnControllerChange = false;

	function applyUpdate() {
		const worker = waitingWorker;
		if (!worker) return;
		reloadOnControllerChange = true;
		worker.postMessage({ type: "SKIP_WAITING" });
	}

	onMount(() => {
		if (!browser || !("serviceWorker" in navigator)) return;

		let registration: ServiceWorkerRegistration | null = null;

		function showUpdate(worker: ServiceWorker | null) {
			if (!worker) return;
			waitingWorker = worker;
			updateReady = true;
		}

		function watchRegistration(reg: ServiceWorkerRegistration) {
			// An update may already be waiting when the page loads.
			if (reg.waiting) showUpdate(reg.waiting);

			const trackWorker = (worker: ServiceWorker | null) => {
				if (!worker) return;
				const onStateChange = () => {
					// A worker installed while another one controls the page
					// means there is a new version waiting to be activated.
					if (
						worker.state === "installed" &&
						navigator.serviceWorker.controller
					) {
						showUpdate(reg.waiting ?? worker);
					}
				};
				// Listen first, then check immediately: the worker may have
				// reached "installed" before the listener was attached.
				worker.addEventListener("statechange", onStateChange);
				onStateChange();
			};

			reg.addEventListener("updatefound", () => trackWorker(reg.installing));
			trackWorker(reg.installing);
		}

		// Check for a new version when the tab becomes visible again
		// (e.g. the user returns to the installed app hours later).
		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				registration?.update().catch(() => {});
			}
		};

		const onControllerChange = () => {
			if (reloadOnControllerChange) window.location.reload();
		};

		document.addEventListener("visibilitychange", onVisibilityChange);
		navigator.serviceWorker.addEventListener(
			"controllerchange",
			onControllerChange,
		);

		navigator.serviceWorker
			.register("/sw.js", { scope: "/" })
			.then((reg) => {
				registration = reg;
				watchRegistration(reg);
			})
			.catch(() => {
				// Registration unsupported/blocked (private mode, disabled storage,
				// older browser) — the app keeps working without a service worker.
			});

		return () => {
			document.removeEventListener("visibilitychange", onVisibilityChange);
			navigator.serviceWorker.removeEventListener(
				"controllerchange",
				onControllerChange,
			);
		};
	});
</script>

<svelte:head>
	<title>Catering CRM</title>
</svelte:head>

{#if showShell}
	<Header />
	<main class="min-h-screen bg-neutral-50">
		{@render children()}
	</main>
{:else}
	{@render children()}
{/if}

{#if updateReady}
	<div
		class="fixed inset-x-0 bottom-0 z-[400] flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-neutral-200 bg-paper/95 px-4 pt-3 text-sm text-ink shadow-card backdrop-blur"
		style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));"
		role="status"
		aria-live="polite"
	>
		<span class="text-neutral-600">Доступно обновление</span>
		<span aria-hidden="true" class="hidden text-neutral-400 sm:inline">·</span>
		<button
			type="button"
			class="rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-signal-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
			onclick={applyUpdate}
		>
			Обновить
		</button>
	</div>
{/if}
