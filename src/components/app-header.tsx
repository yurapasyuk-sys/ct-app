"use client";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { navLinks } from "@/components/app-shared";

export function AppHeader({ activePath }: { activePath: string }) {
	const activeItem = navLinks.find((item) => item.path === activePath) ?? navLinks[0];

	return (
		<header
			className={cn(
				"sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 md:px-6"
			)}
		>
			<div className="flex items-center gap-3">
				<CustomSidebarTrigger />
				<Separator
					className="mr-2 h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<AppBreadcrumbs page={activeItem} />
			</div>
			<div className="flex items-center gap-3">
				<div className="flex items-center gap-2 text-xs text-muted-foreground font-mono bg-secondary/50 px-3 py-1 rounded-full border border-border/40">
					<span className="size-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
					SYSTEM ONLINE
				</div>
			</div>
		</header>
	);
}
