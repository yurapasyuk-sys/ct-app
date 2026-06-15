import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppShell } from "@/components/app-shell";
import Dashboard from "./pages/Dashboard";
import BacktestReports from "./pages/BacktestReports";
import StrategyExperiments from "./pages/StrategyExperiments";
import { useEffect, useState } from "react";

const queryClient = new QueryClient();

const App = () => {
  const [activePath, setActivePath] = useState(() => window.location.hash || "#/overview");

  useEffect(() => {
    const handleHashChange = () => {
      setActivePath(window.location.hash || "#/overview");
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AppShell activePath={activePath}>
            {activePath === "#/backtest-reports" ? (
              <BacktestReports />
            ) : activePath === "#/strategy-experiments" ? (
              <StrategyExperiments />
            ) : (
              <Dashboard />
            )}
          </AppShell>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
