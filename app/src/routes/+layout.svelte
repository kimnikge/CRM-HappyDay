<script lang="ts">
	import { onMount } from "svelte";
	import { browser } from "$app/environment";
	import "../app.css";

	let { children } = $props();

	onMount(() => {
		// Register PWA service worker
		if (browser && "serviceWorker" in navigator) {
			navigator.serviceWorker
				.register("/sw.js", { scope: "/" })
				.catch(() => {
					// Service worker registration failed — silent fallback
				});
		}
	});
</script>

<svelte:head>
	<title>Catering CRM</title>
</svelte:head>

{@render children()}
