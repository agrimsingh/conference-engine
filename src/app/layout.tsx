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
	description: "Build and run your conference program today: CFP, review, speakers, schedule, and publishing in one live workspace.",
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
THESIS: The product is the hero — a live schedule grid catching a speaker conflict opens the page; refuses the tall centered hero with a screenshot in a browser frame.
OWN-WORLD: Near-black ground (#0a0a0b), off-white text, emerald #10b981 accent, red reserved for the single conflict banner, 1px neutral-800 borders, dotted hour grid, Geist. Canon dev-tool register at Linear/Vercel/Resend/Stripe/PostHog craft.
STORY: An organizer understands they can create and run their event in the hosted product today, with the live demo and self-hosting as supporting proof and secondary paths.
FIRST VIEWPORT: Slim translucent nav with organizer sign-in; compact left-aligned headline band "Build your event. From CFP to stage." with one solid create-event action and one neutral demo link; below, a borderless coded schedule builder (~70% viewport) — unscheduled rail, three room lanes, mid-drag card, red speaker-conflict banner, bottom fade.
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
