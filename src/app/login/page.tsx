import { safeNextPath } from "@/lib/security/safe-next-path";
import { OrganizerLoginForm } from "./organizer-login-form";

type Props = {
	searchParams: Promise<{ email?: string; next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
	const params = await searchParams;
	const next = safeNextPath(params.next);
	const initialError =
		params.error === "expired"
			? "That sign-in link expired. Request a fresh one below."
			: null;

	return (
		<main className="mx-auto max-w-lg px-4 py-10">
			<OrganizerLoginForm
				initialEmail={params.email ?? ""}
				next={next}
				initialError={initialError}
			/>
		</main>
	);
}
