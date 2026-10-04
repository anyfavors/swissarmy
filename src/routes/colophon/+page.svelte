<svelte:head>
	<title>Colophon · Field Manual</title>
</svelte:head>

<article class="prose">
	<p class="label">Colophon</p>
	<h1>How this manual handles your data</h1>

	<h2><span class="sec">§1</span> Everything runs locally</h2>
	<p>
		Every tool is plain JavaScript running in your browser. There is no backend, no analytics and no
		cookies. Input is kept in the URL fragment (the part after <code>#</code>) so links can be
		shared; browsers never send the fragment to a server. Tokens, keys, passwords and certificates
		are never written there.
	</p>

	<h2><span class="sec">§2</span> The browser enforces it</h2>
	<p>
		The site ships a Content-Security-Policy that limits outgoing connections to this site plus the
		DNS-over-HTTPS resolvers <code>cloudflare-dns.com</code> and <code>dns.google</code>. Any other
		request is blocked by the browser itself, so a bug or a compromised dependency cannot quietly
		send data elsewhere.
	</p>

	<h2><span class="sec">§3</span> Network use is marked</h2>
	<p>
		A tool that needs the network (currently only the DNS lookup) carries a <strong>Network</strong>
		stamp naming the host and what is sent. It only makes the request when you press its button, never
		while you type. Every other tool carries a <strong>Local only</strong> stamp.
	</p>

	<h2><span class="sec">§4</span> Works offline</h2>
	<p>
		After your first visit the whole manual is stored by your browser, so every tool except the DNS
		lookup works without a connection. You can also install it as an app from the browser menu.
	</p>

	<h2><span class="sec">§5</span> Type</h2>
	<p>
		Set in Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono by the Braille Institute,
		chosen because they keep 0/O, 1/l/I and rn/m apart. Fonts are served from this site.
	</p>
</article>

<style>
	.prose {
		max-width: 44rem;
	}
	h1 {
		font-size: clamp(2rem, 6vw, 3rem);
		margin: 0.25rem 0 1.5rem;
	}
	h2 {
		font-size: 1.125rem;
		margin: 2rem 0 0.5rem;
		padding-top: 0.75rem;
		border-top: 2px solid var(--rule);
	}
	.sec {
		font-family: var(--font-mono);
		color: var(--signal);
		margin-right: 0.35rem;
	}
</style>
