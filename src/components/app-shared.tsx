import type { ReactNode } from "react";
import { ActivityIcon, ChartCandlestickIcon, FileBarChartIcon } from "lucide-react";

export type SidebarNavItem = {
	title: string;
	path?: string;
	icon?: ReactNode;
	isActive?: boolean;
	subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
};

export const navGroups: SidebarNavGroup[] = [
	{
		label: "Analytics",
		items: [
			{
				title: "Market Overview",
				path: "#/overview",
				icon: (
					<ChartCandlestickIcon
					/>
				),
			},
			{
				title: "Backtest Reports",
				path: "#/backtest-reports",
				icon: (
					<FileBarChartIcon
					/>
				),
			},
		],
	},
];

export const footerNavLinks: SidebarNavItem[] = [
	{
		title: "System Status",
		path: "#/status",
		icon: (
			<ActivityIcon
			/>
		),
	},
];

export const navLinks: SidebarNavItem[] = [
	...navGroups.flatMap((group) =>
		group.items.flatMap((item) =>
			item.subItems?.length ? [item, ...item.subItems] : [item]
		)
	),
	...footerNavLinks,
];
