import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "conference-engine",
	description:
		"The work between the open call and the first session. CFP, review, decisions, speaker ops, schedule, and publish in one workspace.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<head>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml"></link>
			</head>
			<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
				<div
					hidden
					dangerouslySetInnerHTML={{
						__html: `<!--
IMPECCABLE CONTRACT (seed f223cb45)
THESIS: The product is the hero. Organizer release-decisions chrome opens the page; refuses the tall centered hero with a screenshot in a browser frame.
OWN-WORLD: Near-black ground (#0a0a0b), off-white text, emerald #10b981 accent, red reserved for conflict/error, 1px neutral-800 borders, Geist. Canon dev-tool register at Linear/Vercel/Resend/Stripe/PostHog craft.
STORY: An organizer understands they can create and run their event in the hosted product today, with playable read-only demo surfaces and self-hosting as supporting proof and secondary paths.
FIRST VIEWPORT: Slim translucent nav with organizer sign-in; compact left-aligned headline "The work between the call and the first session." with one solid create-event action and one neutral demo link; coded admin chrome for staged accept/decline with a left-aligned Release decisions action, three principles beside it (one programme, after accept, nothing leaks).
FORM: Category standard played straight — user-chosen standing exit; approved comp 3 (.impeccable/mocks/comp-3-productfirst.png).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`,
					}}
				/>
				{children}
			</body>
		</html>
	);
}
