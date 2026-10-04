// Applies the saved edition before first paint. Kept as a file (not inline) so the CSP needs no exception.
try {
	var t = localStorage.getItem('fm-theme');
	if (t === 'paper' || t === 'blueprint') document.documentElement.dataset.theme = t;
} catch (e) {}
