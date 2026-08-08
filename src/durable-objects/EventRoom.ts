import { DurableObject } from "cloudflare:workers";

export class EventRoom extends DurableObject<CloudflareEnv> {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === "POST" && url.pathname === "/broadcast") {
			const body = await request.text();
			this.broadcast(body || JSON.stringify({ type: "invalidate" }));
			return new Response("ok");
		}

		const upgrade = request.headers.get("Upgrade");
		if (upgrade?.toLowerCase() !== "websocket") {
			return new Response("Expected WebSocket upgrade", { status: 426 });
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.ctx.acceptWebSocket(server);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	broadcast(json: string): void {
		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(json);
			} catch {
				// drop broken sockets; hibernation API cleans them up on close
			}
		}
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		if (typeof message !== "string") return;
		if (message === "ping") {
			ws.send("pong");
		}
	}

	async webSocketClose(
		ws: WebSocket,
		code: number,
		reason: string,
		_wasClean: boolean,
	): Promise<void> {
		ws.close(code, reason);
	}
}
