import { useState, useEffect } from 'react';

export const CenturionLoader = ({ onComplete }: { onComplete: () => void }) => {
  const [progress, setProgress] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    const duration = 3500;
    const interval = 50;
    const steps = duration / interval;
    const increment = 100 / steps;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return prev + increment;
      });
    }, interval);

    // Turn head to profile view at 2.5s
    const turnTimer = setTimeout(() => {
      setShowProfile(true);
    }, 2500);

    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, duration - 500);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, duration);

    return () => {
      clearInterval(timer);
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
      clearTimeout(turnTimer);
    };
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center transition-opacity duration-500 ${isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
       {/* Pixel Background Effect */}
       <div className="absolute inset-0 opacity-10 pointer-events-none">
         <div className="w-full h-full" style={{ 
           backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', 
           backgroundSize: '20px 20px',
           color: 'var(--muted-foreground)'
         }}></div>
       </div>

       {/* Helmet Container */}
       <div className="mb-8 relative w-32 h-32">
         {/* Front View - High Detail Aggressive */}
         <div className={`absolute inset-0 transition-all duration-500 transform ${showProfile ? 'opacity-0 scale-90 rotate-y-90' : 'opacity-100 scale-100 rotate-y-0'}`} style={{ backfaceVisibility: 'hidden' }}>
           <svg viewBox="0 0 24 24" className="w-full h-full" style={{ imageRendering: 'pixelated' }}>
             {/* Crest (Red/Accent usually, but using foreground for strict theme) */}
             <rect x="11" y="2" width="2" height="2" className="fill-foreground/90" />
             <rect x="10" y="3" width="4" height="1" className="fill-foreground/90" />
             <rect x="9" y="4" width="6" height="1" className="fill-foreground/80" />
             
             {/* Helmet Dome */}
             <rect x="7" y="5" width="10" height="1" className="fill-foreground" />
             <rect x="6" y="6" width="12" height="2" className="fill-foreground" />
             <rect x="5" y="8" width="14" height="1" className="fill-foreground" />
             
             {/* Cheek Guards & Jaw */}
             <rect x="5" y="9" width="3" height="8" className="fill-foreground" />
             <rect x="16" y="9" width="3" height="8" className="fill-foreground" />
             <rect x="6" y="17" width="2" height="1" className="fill-foreground" />
             <rect x="16" y="17" width="2" height="1" className="fill-foreground" />
             
             {/* Nose Guard (Aggressive T-Shape) */}
             <rect x="11" y="9" width="2" height="5" className="fill-foreground" />
             <rect x="10" y="8" width="4" height="1" className="fill-foreground" />
             
             {/* Shading/Detail */}
             <rect x="6" y="6" width="1" height="2" className="fill-background/20" />
             <rect x="17" y="6" width="1" height="2" className="fill-background/20" />
             <rect x="11" y="10" width="2" height="3" className="fill-background/10" />
           </svg>
         </div>

         {/* Side View - High Detail Profile */}
         <div className={`absolute inset-0 transition-all duration-500 transform ${showProfile ? 'opacity-100 scale-100 rotate-y-0' : 'opacity-0 scale-90 -rotate-y-90'}`} style={{ backfaceVisibility: 'hidden' }}>
           <svg viewBox="0 0 24 24" className="w-full h-full" style={{ imageRendering: 'pixelated' }}>
             {/* Crest Profile (Flowing back) */}
             <rect x="4" y="2" width="10" height="1" className="fill-foreground/90" />
             <rect x="3" y="3" width="12" height="1" className="fill-foreground/90" />
             <rect x="3" y="4" width="13" height="1" className="fill-foreground/80" />
             <rect x="15" y="5" width="2" height="1" className="fill-foreground/80" />
             
             {/* Helmet Dome Profile */}
             <rect x="5" y="5" width="10" height="1" className="fill-foreground" />
             <rect x="4" y="6" width="12" height="2" className="fill-foreground" />
             <rect x="4" y="8" width="12" height="1" className="fill-foreground" />
             
             {/* Face Guard Profile */}
             <rect x="4" y="9" width="4" height="8" className="fill-foreground" /> {/* Back of head */}
             <rect x="12" y="9" width="4" height="2" className="fill-foreground" /> {/* Brow */}
             <rect x="13" y="11" width="3" height="6" className="fill-foreground" /> {/* Cheek guard */}
             <rect x="12" y="16" width="4" height="1" className="fill-foreground" /> {/* Jaw line */}
             
             {/* Eye Slit Detail */}
             <rect x="8" y="9" width="4" height="1" className="fill-background/10" />
           </svg>
         </div>
       </div>
       
       <div className="relative z-10 text-center flex flex-col items-center gap-1">
         <h1 className="text-5xl md:text-7xl font-bold text-foreground font-mono tracking-tighter">
           CENTURION
         </h1>
         <div className="flex items-center gap-3">
            <span className="text-muted-foreground font-mono text-lg tracking-[0.3em] uppercase">Terminal</span>
            <div className="px-2 py-0.5 border border-primary/30 rounded bg-primary/5">
                <span className="text-primary font-mono text-[10px] tracking-wider font-bold">BETA</span>
            </div>
         </div>
       </div>
       
       {/* Progress Bar */}
       <div className="mt-12 w-64 h-1 bg-secondary rounded-full overflow-hidden">
         <div 
           className="h-full bg-primary transition-all duration-100 ease-linear"
           style={{ width: `${progress}%` }}
         />
       </div>
       
       <div className="mt-4 text-muted-foreground/60 font-mono text-xs animate-pulse">
         INITIALIZING SYSTEM...
       </div>
    </div>
  );
};
