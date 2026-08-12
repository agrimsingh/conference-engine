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
		"The open-source alternative to Sessionboard and Sessionize. CFP to published schedule. You run it.",
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
THESIS: The product is the hero. The schedule grid diorama opens the page; refuses the tall centered hero with a screenshot in a browser frame.
OWN-WORLD: Near-black ground (#0a0a0b), off-white text, emerald #10b981 accent, red reserved for conflict/error, 1px neutral-800 borders, Geist. Canon dev-tool register at Linear/Vercel/Resend/Stripe/PostHog craft.
STORY: An organizer understands they can create and run their event in the hosted product today. The coded admin chrome is clickable across CFP, review, accept, speaker ops, schedule, and publish. Self-hosting is a supporting path.
FIRST VIEWPORT: Slim translucent nav with organizer sign-in; compact left-aligned headline "The work between the call and the first session." with one solid create-event action and one neutral demo link; full-bleed schedule grid with unscheduled rail, mid-drag emerald card, and speaker-conflict banner. Clickable admin chrome lives below.
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
