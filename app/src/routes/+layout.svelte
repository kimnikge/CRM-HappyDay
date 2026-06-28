<script lang="ts">
	import "../app.css";

	let { children } = $props();
</script>

<svelte:head>
	<title>Catering CRM</title>
</svelte:head>

{@render children()}
