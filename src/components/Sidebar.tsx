import React from 'react';
import { LayoutDashboard, Terminal, Settings, FileText, LogOut, LogIn, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export const Sidebar = () => {
  const { user, signInWithGoogle, signOut } = useAuth();

  return (
    <div className="h-screen w-64 bg-card border-r border-border flex flex-col p-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary tracking-tight">CENTURION</h1>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-mono mt-1 tracking-widest">TERMINAL</p>
          {user && (
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-mono border border-primary/20">PRO</span>
          )}
        </div>
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

      <div className="mt-auto pt-4 border-t border-border space-y-4">
        {user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-2">
              <Avatar className="h-8 w-8 border border-border">
                <AvatarImage src={user.user_metadata.avatar_url} />
                <AvatarFallback><User size={14} /></AvatarFallback>
              </Avatar>
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-medium truncate">{user.user_metadata.full_name || 'User'}</span>
                <span className="text-[10px] text-muted-foreground truncate">{user.email}</span>
              </div>
            </div>
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => signOut()}
            >
              <LogOut size={18} />
              <span className="text-sm font-medium">Logout</span>
            </Button>
          </div>
        ) : (
          <Button 
            variant="outline" 
            className="w-full justify-start gap-3 border-primary/20 hover:bg-primary/5 hover:text-primary"
            onClick={() => signInWithGoogle()}
          >
            <LogIn size={18} />
            <span className="text-sm font-medium">Login with Google</span>
          </Button>
        )}
      </div>
    </div>
  );
};
