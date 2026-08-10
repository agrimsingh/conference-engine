import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { buttonClasses } from "@/components/ui";

export function PublicSiteNav({ ariaLabel = "Site" }: { ariaLabel?: string }) {
	return (
		<AppNav ariaLabel={ariaLabel}>
			<div className="ml-auto flex items-center gap-3 sm:gap-4">
				<Link
					href="/demo"
					className="text-sm text-neutral-400 hover:text-neutral-100"
				>
					Demo
				</Link>
				<Link href="/admin" className={buttonClasses("secondary", "sm")}>
					Create your event
				</Link>
			</div>
		</AppNav>
	);
}
