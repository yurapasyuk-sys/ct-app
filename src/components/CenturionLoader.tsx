import { useState, useEffect } from 'react';
import logo from '../assets/logo228123.jpg';

export const CenturionLoader = ({ onComplete }: { onComplete: () => void }) => {
  const [progress, setProgress] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [statusText, setStatusText] = useState('INITIALIZING KERNEL');

  useEffect(() => {
    const duration = 1000;
    const interval = 10;
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
    setTimeout(() => setStatusText('LOADING MODULES'), 200);
    setTimeout(() => setStatusText('VERIFYING INTEGRITY'), 400);
    setTimeout(() => setStatusText('ESTABLISHING UPLINK'), 600);
    setTimeout(() => setStatusText('SYSTEM READY'), 800);

    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, duration - 200);

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
    <div className={`fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center transition-opacity duration-500 ${isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
       
       {/* Background Grid */}
       <div className="absolute inset-0 opacity-20 pointer-events-none" 
            style={{ 
              backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)', 
              backgroundSize: '40px 40px' 
            }}>
       </div>

       {/* Main Loader Graphic */}
       <div className="relative w-64 h-64 mb-8 flex items-center justify-center">
         <img src={logo} alt="Loading..." className="w-full h-full object-contain" />
       </div>

       {/* Typography */}
       <div className="relative z-10 text-center space-y-4">
         <h1 className="text-4xl md:text-5xl font-bold text-white font-mono tracking-tighter">
           CENTURION
         </h1>
         
         <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
                <span className="text-white/40 font-mono text-sm tracking-[0.5em] uppercase">TERMINAL</span>
                <span className="px-1.5 py-0.5 border border-white/20 rounded bg-white/5 text-[10px] font-mono text-white/60">v1 alpha</span>
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
       <div className="mt-8 w-64 h-[2px] bg-white/10 rounded-full overflow-hidden relative">
         <div 
           className="absolute top-0 left-0 h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-100 ease-out"
           style={{ width: `${progress}%` }}
         />
       </div>
       
       <div className="mt-2 font-mono text-[10px] text-white/30">
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

