  >import React from 'react';
import { LayoutDashboard, LogOut, LogIn, User, Moon, Sun, Globe, FlaskConical, ScanSearch } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate, useLocation } from 'react-router-dom';

export const Sidebar = () => {
  const { user, profile, signInWithGoogle, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="h-screen w-64 bg-card border-r border-border flex flex-col p-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary tracking-tight">CENTURION</h1>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-mono mt-1 tracking-widest">TERMINAL</p>
          {user && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${
              profile?.tier === 'ultra' 
                ? 'bg-purple-500/20 text-purple-400 border-purple-500/20' 
                : 'bg-primary/20 text-primary border-primary/20'
            }`}>
              {profile?.tier === 'ultra' ? 'ULTRA' : 'PRO'}
            </span>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        <div 
          onClick={() => navigate('/dashboard')}
          className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${
            isActive('/dashboard') 
              ? 'bg-primary/5 text-primary' 
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <LayoutDashboard size={18} />
          <span className="text-sm font-medium">Dashboard</span>
        </div>

        <div 
          onClick={() => navigate('/dashboard/screener')}
          className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${
            isActive('/dashboard/screener') 
              ? 'bg-primary/5 text-primary' 
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <ScanSearch size={18} />
          <span className="text-sm font-medium">Screener</span>
        </div>
        
        <div 
          onClick={() => navigate('/dashboard/macro')}
          className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${
            isActive('/dashboard/macro') 
              ? 'bg-primary/5 text-primary' 
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <Globe size={18} />
          <span className="text-sm font-medium">Macro</span>
        </div>

        <div 
          onClick={() => navigate('/dashboard/labs')}
          className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${
            isActive('/dashboard/labs') 
              ? 'bg-primary/5 text-primary' 
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <FlaskConical size={18} />
          <span className="text-sm font-medium">Labs</span>
        </div>
      </nav>

      <div className="mt-auto pt-4 border-t border-border space-y-4 relative">
        <style>{`
          @keyframes patrol {
            0% { left: 0; transform: scaleX(1); }
            45% { left: calc(100% - 2rem); transform: scaleX(1); }
            50% { left: calc(100% - 2rem); transform: scaleX(-1); }
            95% { left: 0; transform: scaleX(-1); }
            100% { left: 0; transform: scaleX(1); }
          }
        `}</style>

        {/* Pixel Knight Animation */}
        <div className="absolute -top-[20px] w-8 h-8" style={{ animation: 'patrol 10s linear infinite' }}>
             <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-primary">
                {/* Helmet */}
                <path d="M9 4H15V6H17V8H19V12H17V14H15V12H9V14H7V12H5V8H7V6H9V4Z" fill="currentColor" />
                {/* Plume */}
                <path d="M11 2H13V4H11V2Z" fill="#ef4444" />
                <path d="M9 3H11V4H9V3Z" fill="#ef4444" />
                <path d="M13 3H15V4H13V3Z" fill="#ef4444" />
                {/* Eyes */}
                <path d="M11 9H13V10H11V9Z" fill="black" />
                {/* Body */}
                <path d="M7 14H17V16H19V20H17V22H15V20H9V22H7V20H5V16H7V14Z" fill="currentColor" opacity="0.8" />
                {/* Sword */}
                <path d="M19 12H21V18H19V12Z" fill="#94a3b8" />
                <path d="M18 16H22V17H18V16Z" fill="#94a3b8" />
             </svg>
        </div>

        {/* Social Links */}
        <div className="px-2 pb-2">
          <p className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider mb-3">Community</p>
          <div className="space-y-2.5">
            <a href="https://t.me/centurion_terminal" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50 group-hover:bg-blue-500 transition-colors" />
              Terminal News
            </a>
            <a href="https://t.me/alerts_ct" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 group-hover:bg-emerald-500 transition-colors" />
              Alerts Channel
            </a>
            <a href="https://t.me/borkiss_notes" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500/50 group-hover:bg-purple-500 transition-colors" />
              Borkiss Notes
            </a>
          </div>
        </div>

        <div className="flex items-center justify-between px-2">
          <span className="text-xs text-muted-foreground font-medium">Theme</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? (
              <Moon size={16} className="text-primary" />
            ) : (
              <Sun size={16} className="text-primary" />
            )}
          </Button>
        </div>

        {user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-2">
              <Avatar className={`h-8 w-8 border ${profile?.tier === 'ultra' ? 'border-purple-500/50' : 'border-border'}`}>
                <AvatarImage src={user.user_metadata.avatar_url} />
                <AvatarFallback><User size={14} /></AvatarFallback>
              </Avatar>
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-medium truncate flex items-center gap-1">
                  {user.user_metadata.full_name || 'User'}
                </span>
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
