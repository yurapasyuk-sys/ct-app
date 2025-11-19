import React from 'react';
import { LayoutDashboard, Terminal, Settings, FileText, LogOut } from 'lucide-react';

export const Sidebar = () => {
  return (
    <div className="h-screen w-64 bg-card border-r border-border flex flex-col p-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary tracking-tight">CENTURION</h1>
        <p className="text-xs text-muted-foreground font-mono mt-1 tracking-widest">TERMINAL</p>
      </div>

      <nav className="flex-1 space-y-2">
        <div className="flex items-center gap-3 px-3 py-2 bg-primary/5 text-primary rounded-md cursor-pointer">
          <LayoutDashboard size={18} />
          <span className="text-sm font-medium">Dashboard</span>
        </div>
        
        <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:bg-muted/50 rounded-md cursor-pointer transition-colors">
          <Terminal size={18} />
          <span className="text-sm font-medium">Trade</span>
        </div>

        <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:bg-muted/50 rounded-md cursor-pointer transition-colors">
          <FileText size={18} />
          <span className="text-sm font-medium">Trading Journal</span>
        </div>

        <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:bg-muted/50 rounded-md cursor-pointer transition-colors">
          <Settings size={18} />
          <span className="text-sm font-medium">Settings</span>
        </div>
      </nav>

      <div className="mt-auto pt-4 border-t border-border">
        <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-destructive cursor-pointer transition-colors">
          <LogOut size={18} />
          <span className="text-sm font-medium">Logout</span>
        </div>
      </div>
    </div>
  );
};
