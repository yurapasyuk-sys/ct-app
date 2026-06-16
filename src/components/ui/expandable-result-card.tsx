import { type ReactNode, useEffect, useState } from "react";
import { Maximize2Icon, Minimize2Icon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ExpandableResultCardProps {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  expandedContentClassName?: string;
  headerClassName?: string;
  title: ReactNode;
  titleClassName?: string;
}

export function ExpandableResultCard({
  actions,
  children,
  className,
  contentClassName,
  expandedContentClassName,
  headerClassName,
  title,
  titleClassName,
}: ExpandableResultCardProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  return (
    <Card
      className={cn(
        "min-w-0 shrink-0 rounded-lg",
        expanded
          ? "fixed inset-4 z-50 flex max-h-[calc(100vh-2rem)] min-w-0 flex-col overflow-hidden bg-background shadow-2xl"
          : "overflow-hidden",
        className,
      )}
    >
      <CardHeader
        className={cn(
          "flex flex-col gap-3 space-y-0 pb-4 sm:flex-row sm:items-center sm:justify-between",
          expanded && "shrink-0",
          headerClassName,
        )}
      >
        <CardTitle className={cn("min-w-0 text-lg", titleClassName)}>{title}</CardTitle>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
            onClick={() => setExpanded((value) => !value)}
            title={expanded ? "Закрити розгорнутий вигляд" : "Розгорнути вікно результату"}
          >
            {expanded ? <Minimize2Icon className="size-4" /> : <Maximize2Icon className="size-4" />}
            <span>{expanded ? "Закрити" : "Розгорнути"}</span>
          </button>
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          "min-w-0",
          expanded ? "min-h-0 flex-1 overflow-auto" : "overflow-hidden",
          contentClassName,
          expanded && expandedContentClassName,
        )}
      >
        {children}
      </CardContent>
    </Card>
  );
}
