import { ArrowRight, Terminal, Activity, Cpu, Zap, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TechnicalGrid } from './TechnicalGrid';
import { DataStream } from './DataStream';

const HeroAnimation = () => (
  <div className="relative w-full h-full min-h-[400px] flex items-center justify-center perspective-1000">
    {/* Central Core - Monochrome Data Flow */}
    <div className="relative w-64 h-64 md:w-96 md:h-96">
      {/* Outer Ring - Static */}
      <div className="absolute inset-0 border border-white/10 rounded-full" />
      
      {/* Rotating Data Rings - Slow & Elegant */}
      <div className="absolute inset-0 rounded-full border-t border-white/30 animate-[spin_8s_linear_infinite]" />
      <div className="absolute inset-8 rounded-full border-b border-white/20 animate-[spin_12s_linear_infinite_reverse]" />
      
      {/* Core Glow - White/Neutral */}
      <div className="absolute inset-0 bg-white/5 rounded-full blur-3xl animate-pulse" />
      
      {/* Central Orb - Glass & Data */}
      <div className="absolute inset-0 m-auto w-32 h-32 bg-black/90 backdrop-blur-md rounded-full border border-white/20 flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.05)]">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-white/10 to-transparent animate-pulse" />
        <div className="absolute inset-0 flex flex-col items-center justify-center font-mono text-[10px] text-white/80 tracking-widest gap-1">
          <span>SYSTEM</span>
          <span className="w-1 h-1 bg-white rounded-full animate-ping" />
          <span>ACTIVE</span>
        </div>
      </div>

      {/* Floating Particles - Data Packets */}
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-white rounded-full"
          style={{
            top: '50%',
            left: '50%',
            transform: `rotate(${i * 45}deg) translateY(-160px)`,
            animation: `pulse 3s infinite ${i * 0.2}s`,
            opacity: 0.6
          }}
        />
      ))}
      
      {/* Connecting Lines */}
      {[...Array(4)].map((_, i) => (
        <div
          key={`line-${i}`}
          className="absolute top-1/2 left-1/2 w-[200px] h-[1px] bg-gradient-to-r from-white/20 to-transparent origin-left"
          style={{
            transform: `rotate(${i * 90 + 45}deg)`,
          }}
        />
      ))}
    </div>
  </div>
);

export const NewHero = () => {
  return (
    <section className="relative min-h-screen flex items-center bg-[#050505] overflow-hidden selection:bg-white/20 selection:text-white">
      <TechnicalGrid />
      <DataStream />
      
      {/* Ambient Glow - Neutral/White */}
      <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-white/5 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />

      <div className="container mx-auto px-6 relative z-10 pt-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* Left Content */}
          <div className="space-y-10">
            {/* Badge - Minimalist */}
            <div className="inline-flex items-center gap-3">
              <div className="h-[1px] w-8 bg-white/40"></div>
              <span className="text-[10px] font-mono text-white/60 tracking-[0.2em] uppercase">Gen-3 Analytics Engine</span>
            </div>

            {/* Main Title - Strict Typography */}
            <div className="relative">
              <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-white leading-[0.9]">
                CENTURION
                <br />
                <span className="text-neutral-500">
                  ECOSYSTEM
                </span>
              </h1>
            </div>

            {/* Description */}
            <p className="text-neutral-400 text-lg md:text-xl leading-relaxed max-w-xl font-light">
              The unfair advantage for <span className="text-white font-medium">institutional</span> retail traders. 
              Architecting the next generation of execution infrastructure with precision and speed.
            </p>

            {/* Stats Grid - Minimal */}
            <div className="grid grid-cols-3 gap-8 py-8 border-t border-white/10">
              <div className="space-y-2">
                <div className="text-3xl font-mono text-white tracking-tighter">50µs</div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-widest">Latency</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-mono text-white tracking-tighter">20k+</div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-widest">TPS</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-mono text-white tracking-tighter">99.9%</div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-widest">Uptime</div>
              </div>
            </div>

            {/* Actions - Monochrome Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link 
                to="/dashboard" 
                className="group relative px-8 py-4 bg-white text-black font-bold tracking-wider transition-all hover:bg-neutral-200"
              >
                <div className="relative flex items-center gap-3">
                  <Terminal className="w-5 h-5" />
                  <span>LAUNCH TERMINAL</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              <Link 
                to="/dashboard/screener" 
                className="group px-8 py-4 bg-transparent border border-white/20 hover:bg-white/5 text-white font-bold tracking-wider transition-all"
              >
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-white" />
                  <span>SCREENER</span>
                </div>
              </Link>
            </div>
          </div>

          {/* Right Animation */}
          <div className="hidden lg:block h-[600px] w-full">
            <HeroAnimation />
          </div>

        </div>
      </div>

      {/* Bottom Bar - Strict */}
      <div className="absolute bottom-0 left-0 w-full border-t border-white/10 bg-black/80 backdrop-blur-md py-4">
        <div className="container mx-auto px-6 flex justify-between items-center text-[10px] font-mono text-neutral-500">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 text-white/80">
              <div className="w-1 h-1 rounded-full bg-white animate-pulse" />
              SYSTEM ONLINE
            </span>
            <span className="text-neutral-700">|</span>
            <span>V.2.0.4 [STABLE]</span>
          </div>
          <div className="flex items-center gap-6">
            <span>ENCRYPTION: AES-256</span>
            <span className="text-neutral-700">|</span>
            <span>SECURE CONNECTION</span>
          </div>
        </div>
      </div>

    </section>
  );
};
