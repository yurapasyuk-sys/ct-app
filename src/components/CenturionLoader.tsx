import { useState, useEffect } from 'react';

export const CenturionLoader = ({ onComplete }: { onComplete: () => void }) => {
  const [progress, setProgress] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    const duration = 4000;
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

    // Turn head to profile view at 1.5s
    const turnTimer = setTimeout(() => {
      setShowProfile(true);
    }, 1500);

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
       {/* Dot Matrix Background Effect */}
       <div className="absolute inset-0 opacity-5 pointer-events-none">
         <div className="w-full h-full" style={{ 
           backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', 
           backgroundSize: '30px 30px',
           color: 'var(--foreground)'
         }}></div>
       </div>

       {/* Centurion Container */}
       <div className="mb-12 relative w-64 h-64 md:w-80 md:h-80">
         <svg className="w-full h-full" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
           <defs>
             {/* The Dot Pattern - Simulating the dithered look */}
             <pattern id="dot-pattern" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
               <circle cx="1.5" cy="1.5" r="1" className="fill-foreground" />
             </pattern>
             
             {/* Front View Mask - Helmet Shape */}
             <mask id="mask-front">
               <path d="M60,40 Q100,10 140,40 L140,120 Q140,160 100,180 Q60,160 60,120 Z" fill="white" />
               {/* T-Visor Cutout (Black) */}
               <path d="M95,60 L105,60 L105,100 L95,100 Z" fill="black" />
               <path d="M80,60 L120,60 L120,70 L80,70 Z" fill="black" />
               {/* Shading Gradient */}
               <rect x="0" y="0" width="200" height="200" fill="url(#shading-grad)" />
             </mask>

             {/* Profile View Mask - Amex Centurion Silhouette */}
             <mask id="mask-profile">
               {/* Plume */}
               <path d="M40,40 Q100,10 160,60 L150,140 Q100,100 60,140 Z" fill="white" />
               {/* Head/Helmet */}
               <path d="M70,50 L130,50 L130,90 L140,90 L140,100 L130,100 L130,130 L110,150 L90,150 L70,130 Z" fill="white" />
               {/* Face Detail (Cutouts for nose/mouth to define profile) */}
               <path d="M130,90 L140,90 L140,110 L130,110 Z" fill="black" /> {/* Eye area */}
               
               {/* Refined Profile Path */}
               <path d="M 60 60 C 60 30 100 20 140 40 C 160 50 160 80 150 100 C 150 100 150 140 140 160 C 120 180 80 180 60 160 C 50 140 50 100 60 60 Z" fill="white" />
               {/* Cutout to shape the face profile on the right */}
               <path d="M 140 40 L 200 40 L 200 200 L 140 200 L 120 150 L 130 130 L 125 125 L 130 110 L 120 110 L 120 90 L 140 90 Z" fill="black" />
               
               {/* Shading Gradient */}
               <rect x="0" y="0" width="200" height="200" fill="url(#shading-grad)" />
             </mask>

             {/* Radial Gradient for 3D Shading Effect */}
             <radialGradient id="shading-grad" cx="0.3" cy="0.3" r="0.8">
               <stop offset="0%" stopColor="white" stopOpacity="1" />
               <stop offset="80%" stopColor="white" stopOpacity="0.5" />
               <stop offset="100%" stopColor="black" stopOpacity="0.8" />
             </radialGradient>
           </defs>

           {/* The Rendered Object */}
           <g className={`transition-all duration-1000 ease-in-out transform ${showProfile ? 'opacity-0 scale-x-0' : 'opacity-100 scale-x-100'}`} style={{ transformOrigin: 'center' }}>
             <rect width="200" height="200" fill="url(#dot-pattern)" mask="url(#mask-front)" />
           </g>

           <g className={`transition-all duration-1000 ease-in-out transform ${showProfile ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'}`} style={{ transformOrigin: 'center' }}>
             <rect width="200" height="200" fill="url(#dot-pattern)" mask="url(#mask-profile)" />
             {/* Glowing Eye in Profile */}
             <circle cx="115" cy="95" r="3" className={`fill-primary blur-[1px] transition-opacity duration-1000 ${showProfile ? 'opacity-100' : 'opacity-0'}`} />
           </g>
           
           {/* Scanning Line Effect */}
           <rect width="200" height="2" className="fill-primary/30 blur-sm animate-[scan_2s_ease-in-out_infinite]" />
         </svg>
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

       <style>{`
         @keyframes scan {
           0% { transform: translateY(0); opacity: 0; }
           50% { opacity: 1; }
           100% { transform: translateY(200px); opacity: 0; }
         }
       `}</style>
    </div>
  );
};
