type Context = { params: Promise<{ eventSlug: string; embedSlug: string }> };

export async function GET(_request: Request, context: Context) {
	const { eventSlug, embedSlug } = await context.params;
	const targetPath = `/embed/${encodeURIComponent(eventSlug)}/widgets/${encodeURIComponent(embedSlug)}`;
	const script = `(() => {
  if (customElements.get("conference-engine-embed")) return;
  const allowedOrigin = new URL(import.meta.url).origin;
  const defaultSource = new URL(${JSON.stringify(targetPath)}, allowedOrigin).href;
  class ConferenceEngineEmbed extends HTMLElement {
    connectedCallback() {
      if (this.firstElementChild) return;
      let source;
      try {
        source = new URL(this.getAttribute("src") || defaultSource, document.baseURI);
      } catch {
        return;
      }
      if (source.origin !== allowedOrigin || !source.pathname.startsWith("/embed/")) return;
      const iframe = document.createElement("iframe");
      iframe.src = source.href;
      iframe.title = this.getAttribute("title") || "Event widget";
      iframe.loading = "lazy";
      iframe.width = "100%";
      iframe.height = this.getAttribute("height") || "640";
      iframe.style.border = "0";
      iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
      this.append(iframe);
    }
  }
  customElements.define("conference-engine-embed", ConferenceEngineEmbed);
})();`;

	return new Response(script, {
		headers: {
			"Content-Type": "text/javascript; charset=utf-8",
			"Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
			"X-Content-Type-Options": "nosniff",
			"Access-Control-Allow-Origin": "*",
		},
	});
}
