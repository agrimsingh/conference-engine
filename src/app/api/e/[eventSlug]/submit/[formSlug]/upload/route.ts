import { NextResponse } from "next/server";
import { isCfpOpenNow } from "@/lib/cfp/closes-at";
import { effectiveUploadMaxBytes, storeCfpFieldUpload } from "@/lib/cfp/file-upload";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getAuthSecret, getDb, getFilesBucket } from "@/lib/db/cloudflare";
import { DemoEventWriteError, assertEventWritable } from "@/lib/events/writability";
import { MultipartBodyTooLargeError, readBoundedMultipartFormData } from "@/lib/security/bounded-multipart";
import { consumeFixedWindowRateLimit } from "@/lib/security/rate-limit";

type RouteContext = {
	params: Promise<{ eventSlug: string; formSlug: string }>;
};

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 + 512 * 1024;

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug, formSlug } = await context.params;
	const url = new URL(request.url);
	const fieldKey = url.searchParams.get("fieldKey")?.trim() ?? "";
	if (!fieldKey) {
		return NextResponse.json({ ok: false, error: "fieldKey is required" }, { status: 400 });
	}

	const db = await getDb();
	const loaded = await loadCfpForm(db, eventSlug, formSlug, { requireOpen: true });
	if (!loaded) {
		return NextResponse.json({ ok: false, error: "CFP form not found or closed" }, { status: 404 });
	}
	try {
		assertEventWritable(loaded.event);
	} catch (error) {
		if (error instanceof DemoEventWriteError) {
			return NextResponse.json({ ok: false, error: "This form is read-only" }, { status: 403 });
		}
		throw error;
	}
	if (!isCfpOpenNow(loaded.form, Date.now())) {
		return NextResponse.json({ ok: false, error: "CFP is not accepting uploads right now" }, { status: 403 });
	}

	const field = loaded.fields.find((item) => item.key === fieldKey);
	if (!field || field.config.kind !== "file_upload") {
		return NextResponse.json({ ok: false, error: "Upload field not found" }, { status: 404 });
	}

	let form: FormData;
	try {
		form = await readBoundedMultipartFormData(request, MAX_UPLOAD_BYTES);
	} catch (error) {
		if (error instanceof MultipartBodyTooLargeError) {
			return NextResponse.json({ ok: false, error: "Upload too large (max 25MB)" }, { status: 413 });
		}
		return NextResponse.json({ ok: false, error: "Expected multipart form" }, { status: 400 });
	}
	const fileValue = form.get("file");
	if (!(fileValue instanceof File)) {
		return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
	}

	const secret = await getAuthSecret();
	const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
	const [fieldAllowed, ipAllowed] = await Promise.all([
		consumeFixedWindowRateLimit(db, { secret, bucket: "cfp-upload-field", subject: `${loaded.form.id}:${fieldKey}:${ip}`, limit: 12, windowMs: 60 * 60_000 }),
		consumeFixedWindowRateLimit(db, { secret, bucket: "cfp-upload-ip", subject: ip, limit: 30, windowMs: 60 * 60_000 }),
	]);
	if (!fieldAllowed || !ipAllowed) {
		return NextResponse.json({ ok: false, error: "Too many upload attempts; try again later" }, { status: 429 });
	}

	const files = await getFilesBucket();
	const result = await storeCfpFieldUpload(db, files, {
		eventId: loaded.event.id,
		formId: loaded.form.id,
		fieldKey,
		file: fileValue,
		maxBytes: effectiveUploadMaxBytes(field.config),
		allowedContentTypes: field.config.accept,
	});
	if (!result.ok) {
		return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
	}

	return NextResponse.json({ ok: true, upload: result.answer });
}
