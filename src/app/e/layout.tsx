export default function PublicEventLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <div className="min-h-dvh bg-neutral-50">{children}</div>;
}
