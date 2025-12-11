import { ArrowRight, Terminal, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TechnicalGrid } from './TechnicalGrid';
import { DataStream } from './DataStream';

export const NewHero = () => {
  return (
    <section className="relative min-h-[95vh] flex items-center bg-[#050505] overflow-hidden border-b border-white/5">
      <TechnicalGrid />
      <DataStream />
      
      {/* Decorative flow lines (abstract) - localized to keep it strict */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-white/5 rounded-full blur-[150px] opacity-10 pointer-events-none mix-blend-screen" />

      <div className="container mx-auto px-6 relative z-10 w-full h-full flex flex-col justify-center">
        
        {/* Top Meta Line */}
        <div className="flex items-center gap-4 mb-8 text-[10px] md:text-xs font-mono text-neutral-500 tracking-widest uppercase">
          <div className="h-[1px] w-12 bg-neutral-700"></div>
          <span>EST. 2025</span>
          <span className="text-neutral-700">//</span>
          <span>GEN-3 INFRASTRUCTURE</span>
        </div>

        {/* Main Typography */}
        <div className="max-w-6xl mb-16">
          <h1 className="text-7xl md:text-9xl font-bold tracking-tighter text-white leading-[0.9]">
            CENTURION
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-300 to-neutral-500">
              ECOSYSTEM
            </span>
          </h1>
        </div>

        {/* Grid Layout for Content */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start border-t border-white/10 pt-8">
          
          {/* Specs Column */}
          <div className="md:col-span-3 space-y-4 font-mono text-xs text-neutral-400">
            <div className="flex items-center gap-2">
              <span className="text-emerald-500">/</span> 50µs Latency Core
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-500">/</span> 20,000 TPS Throughput
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-500">/</span> Rust-based Architecture
            </div>
          </div>

          {/* Description Column */}
          <div className="md:col-span-5 text-neutral-400 text-sm md:text-base leading-relaxed max-w-md">
            The unfair advantage for <span className="text-white italic font-serif">institutional</span> retail traders. 
            Architecting the next generation of execution infrastructure with precision and speed.
          </div>

          {/* Actions Column */}
          <div className="md:col-span-4 flex flex-col items-start md:items-end gap-4">
            {/* Products Links */}
            <div className="flex flex-col gap-3 w-full md:w-auto">
              <Link 
                to="/dashboard" 
                className="group flex items-center justify-between w-full md:w-64 bg-white/5 border border-white/10 px-6 py-4 text-sm font-bold tracking-wider hover:bg-white/10 hover:border-white/20 transition-all uppercase"
              >
                <div className="flex items-center gap-3">
                  <Terminal className="w-4 h-4 text-emerald-500" />
                  <span>Centurion Terminal</span>
                </div>
                <ArrowRight className="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors" />
              </Link>

              <Link 
                to="/dashboard/screener" 
                className="group flex items-center justify-between w-full md:w-64 bg-white/5 border border-white/10 px-6 py-4 text-sm font-bold tracking-wider hover:bg-white/10 hover:border-white/20 transition-all uppercase"
              >
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 text-purple-500" />
                  <span>Centurion Screener</span>
                </div>
                <ArrowRight className="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors" />
              </Link>
            </div>

            <div className="mt-4 text-[10px] font-mono text-neutral-600 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full border border-neutral-600"></span>
              ENCRYPTION: AES-256
            </div>
          </div>
        </div>

      </div>

      {/* Version Tag */}
      <div className="absolute bottom-6 right-6 font-mono text-[10px] text-neutral-700">
        V.2.0.4 [STABLE]
      </div>
      
      {/* Access Tag */}
      <div className="absolute top-6 right-6 font-mono text-[10px] text-neutral-500 flex items-center gap-2">
        [ ACCESS ]
      </div>

    </section>
  );
};
