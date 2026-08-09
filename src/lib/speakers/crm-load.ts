import type { SpeakerCrmDetail } from "./crm";

type SpeakerCrmLoadPayload = {
	readonly ok?: boolean;
	readonly crm?: SpeakerCrmDetail;
	readonly error?: string;
};

export type SpeakerCrmLoadResult =
	| { readonly kind: "loaded"; readonly crm: SpeakerCrmDetail }
	| { readonly kind: "failure"; readonly error: string };

export function resolveSpeakerCrmLoad(
	responseOk: boolean,
	payload: SpeakerCrmLoadPayload,
): SpeakerCrmLoadResult {
	if (responseOk && payload.ok && payload.crm) return { kind: "loaded", crm: payload.crm };
	return { kind: "failure", error: payload.error ?? "Could not load speaker CRM" };
}
