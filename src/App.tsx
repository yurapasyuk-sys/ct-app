import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import BonusPage from "./pages/BonusPage";
import NotFound from "./pages/NotFound";
import Macro from "./pages/Macro";
import Labs from "./pages/Labs";
import { Sidebar } from "./components/Sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

const queryClient = new QueryClient();

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <main className="h-screen w-full bg-background overflow-hidden">{children}</main>;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
};

const App = () => {
  // Log analytics initialization on mount
  if (typeof window !== 'undefined') {
    console.log('Vercel Analytics active');
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                
                {/* Dashboard Routes */}
                <Route path="/dashboard" element={
                  <DashboardLayout>
                    <Dashboard />
                  </DashboardLayout>
                } />
                <Route path="/dashboard/macro" element={
                  <DashboardLayout>
                    <Macro />
                  </DashboardLayout>
                } />
                <Route path="/dashboard/labs" element={
                  <DashboardLayout>
                    <Labs />
                  </DashboardLayout>
                } />

                <Route path="/bonus" element={<BonusPage />} />
                
                {/* Redirect old routes to new dashboard */}
                <Route path="/dashboard/mtm" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/test" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/rvwap" element={<Navigate to="/dashboard" replace />} />
                
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
            <Analytics />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
