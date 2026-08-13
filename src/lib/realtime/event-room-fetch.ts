type EventRoomStub = {
	fetch(request: Request): Promise<Response>;
};

export type EventRoomMutationNamespace = {
	getByName(name: string): EventRoomStub;
};

type TransientDispatchDecision = {
	readonly retryable: boolean;
	readonly overloaded: boolean;
	readonly reference: string | null;
};

export type EventRoomMutationOptions = {
	readonly delay?: (milliseconds: number) => Promise<void>;
	readonly random?: () => number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function eventRoomDispatchDecision(error: unknown): TransientDispatchDecision {
	const structured = isRecord(error) ? error : null;
	if (structured?.overloaded === true) {
		return {
			retryable: false,
			overloaded: true,
			reference: typeof structured.reference === "string" ? structured.reference : null,
		};
	}
	if (structured?.retryable === true) {
		return {
			retryable: true,
			overloaded: false,
			reference: typeof structured.reference === "string" ? structured.reference : null,
		};
	}
	const message = error instanceof Error ? error.message : typeof error === "string" ? error : null;
	if (message === null) return { retryable: false, overloaded: false, reference: null };
	if (/\boverloaded\b/i.test(message)) return { retryable: false, overloaded: true, reference: null };
	const reference = /^internal error; reference = ([a-z0-9]+)$/i.exec(message)?.[1] ?? null;
	if (
		reference !== null
		|| /\b(?:durable object|d1)\b.*\b(?:storage reset|temporarily unavailable)\b/i.test(message)
		|| /\b(?:connection reset|network connection (?:was )?lost|network error)\b/i.test(message)
	) {
		return { retryable: true, overloaded: false, reference };
	}
	return { retryable: false, overloaded: false, reference: null };
}

function unavailableResponse(): Response {
	return Response.json({ ok: false, error: "EventRoom temporarily unavailable" }, { status: 503 });
}

function retryDelayMilliseconds(random: () => number): number {
	const sample = Math.min(Math.max(random(), 0), 0.999_999);
	return 25 + Math.floor(sample * 51);
}

function wait(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Retries a side-effect-free DO readiness probe, then dispatches a mutation exactly once.
 * EventRoom application responses, including HTTP 500, are intentionally returned unchanged.
 */
export async function fetchEventRoomMutation(
	namespace: EventRoomMutationNamespace,
	eventId: string,
	request: Request,
	options: EventRoomMutationOptions = {},
): Promise<Response> {
	const probe = (): Promise<Response> => namespace.getByName(eventId).fetch(new Request("https://event-room/health"));
	try {
		const response = await probe();
		if (response.status >= 500) throw { retryable: true, overloaded: false, reference: null };
	} catch (error) {
		const decision = eventRoomDispatchDecision(error);
		if (!decision.retryable) {
			console.warn("EventRoom readiness probe unavailable", { eventId, ...decision });
			return unavailableResponse();
		}
		console.warn("EventRoom readiness probe retry", { eventId, ...decision });
		await (options.delay ?? wait)(retryDelayMilliseconds(options.random ?? Math.random));
		try {
			const response = await probe();
			if (response.status >= 500) {
				console.warn("EventRoom readiness probe unavailable", {
					eventId,
					retryable: true,
					overloaded: false,
					reference: null,
				});
				return unavailableResponse();
			}
		} catch (retryError) {
			console.warn("EventRoom readiness probe unavailable", { eventId, ...eventRoomDispatchDecision(retryError) });
			return unavailableResponse();
		}
	}
	return namespace.getByName(eventId).fetch(request);
}
