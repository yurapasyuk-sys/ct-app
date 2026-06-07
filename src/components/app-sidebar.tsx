import { LogoIcon } from "@/components/logo";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavGroup } from "@/components/nav-group";
import { footerNavLinks, navGroups } from "@/components/app-shared";
import type { SidebarNavGroup } from "@/components/app-shared";

function withActivePath(groups: SidebarNavGroup[], activePath: string): SidebarNavGroup[] {
	return groups.map((group) => ({
		...group,
		items: group.items.map((item) => ({
			...item,
			isActive: item.path === activePath || (!activePath && item.path === "#/overview"),
		})),
	}));
}

export function AppSidebar({ activePath }: { activePath: string }) {
	const activeNavGroups = withActivePath(navGroups, activePath);

	return (
		<Sidebar collapsible="icon" variant="inset">
			<SidebarHeader className="h-14 justify-center">
				<SidebarMenuButton asChild>
					<a href="#/overview">
						<LogoIcon />
						<span className="font-medium">Centurion</span>
					</a>
				</SidebarMenuButton>
			</SidebarHeader>
			<SidebarContent>
				{activeNavGroups.map((group, index) => (
					<NavGroup key={`sidebar-group-${index}`} {...group} />
				))}
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu className="mt-2">
					{footerNavLinks.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton
								asChild
								className="text-muted-foreground"
								isActive={item.isActive}
								size="sm"
							>
								<a href={item.path}>
									{item.icon}
									<span>{item.title}</span>
								</a>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
