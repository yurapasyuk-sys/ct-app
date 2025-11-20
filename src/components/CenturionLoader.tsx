import { useState, useEffect } from 'react';

export const CenturionLoader = ({ onComplete }: { onComplete: () => void }) => {
  const [progress, setProgress] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [statusText, setStatusText] = useState('INITIALIZING KERNEL');

  useEffect(() => {
    const duration = 3500;
    const interval = 30;
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

    // Status text sequence
    setTimeout(() => setStatusText('LOADING MODULES'), 800);
    setTimeout(() => setStatusText('VERIFYING INTEGRITY'), 1600);
    setTimeout(() => setStatusText('ESTABLISHING UPLINK'), 2400);
    setTimeout(() => setStatusText('SYSTEM READY'), 3200);

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
    };
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center transition-opacity duration-500 ${isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
       
       {/* Background Grid */}
       <div className="absolute inset-0 opacity-20 pointer-events-none" 
            style={{ 
              backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.05) 1px, transparent 1px)', 
              backgroundSize: '40px 40px' 
            }}>
       </div>

       {/* Main Loader Graphic */}
       <div className="relative w-64 h-64 mb-8">
         {/* Outer Ring - Dashed */}
         <div className="absolute inset-0 border border-black/10 rounded-full animate-[spin_10s_linear_infinite]"></div>
         <div className="absolute inset-2 border border-t-black/40 border-r-transparent border-b-black/40 border-l-transparent rounded-full animate-[spin_3s_linear_infinite]"></div>
         
         {/* Inner Ring - Reverse Spin */}
         <div className="absolute inset-8 border-2 border-t-primary border-r-transparent border-b-transparent border-l-transparent rounded-full animate-[spin_2s_linear_infinite_reverse]"></div>
         
         {/* Center Core */}
         <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 bg-black/5 rounded-full backdrop-blur-sm flex items-center justify-center border border-black/10 relative overflow-hidden">
                {/* Scanning Line */}
                <div className="absolute w-full h-[2px] bg-primary/50 blur-[2px] animate-[scan_2s_ease-in-out_infinite]"></div>
                
                {/* Central Symbol - Centurion Helmet */}
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-black animate-pulse">
                    {/* Crest */}
                    <path d="M12 2L15 7H9L12 2Z" fill="currentColor" className="opacity-20" />
                    <path d="M12 2L15 7H9L12 2Z" />
                    {/* Helmet Dome */}
                    <path d="M5 7C5 7 4 10 4 13C4 17 8 21 12 21C16 21 20 17 20 13C20 10 19 7 19 7H5Z" />
                    {/* Nose Guard / Center Line */}
                    <path d="M12 7V21" />
                    {/* Eye Slit */}
                    <path d="M4 13H20" />
                </svg>
            </div>
         </div>

         {/* Orbiting Particles */}
         <div className="absolute inset-0 animate-[spin_4s_linear_infinite]">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]"></div>
         </div>
       </div>

       {/* Typography */}
       <div className="relative z-10 text-center space-y-4">
         <h1 className="text-4xl md:text-5xl font-bold text-black font-mono tracking-tighter">
           CENTURION
         </h1>
         
         <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
                <span className="text-black/40 font-mono text-sm tracking-[0.5em] uppercase">TERMINAL</span>
                <span className="px-1.5 py-0.5 border border-black/20 rounded bg-black/5 text-[10px] font-mono text-black/60">v0.5 beta</span>
            </div>
            
            {/* Dynamic Status Text */}
            <div className="h-6 flex items-center justify-center">
                <span className="font-mono text-xs text-primary tracking-widest uppercase animate-pulse">
                    {`> ${statusText}...`}
                </span>
            </div>
         </div>
       </div>

       {/* Progress Bar */}
       <div className="mt-8 w-64 h-[2px] bg-black/10 rounded-full overflow-hidden relative">
         <div 
           className="absolute top-0 left-0 h-full bg-black shadow-[0_0_10px_rgba(0,0,0,0.2)] transition-all duration-100 ease-out"
           style={{ width: `${progress}%` }}
         />
       </div>
       
       <div className="mt-2 font-mono text-[10px] text-black/30">
            {Math.round(progress)}%
       </div>

       <style>{`
         @keyframes scan {
           0% { transform: translateY(-40px); opacity: 0; }
           50% { opacity: 1; }
           100% { transform: translateY(40px); opacity: 0; }
         }
       `}</style>
    </div>
  );
};

