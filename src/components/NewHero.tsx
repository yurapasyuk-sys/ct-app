import { ArrowRight, Terminal, Cpu, Zap, Globe } from "lucide-react";
import { Link } from "react-router-dom";
import { TechnicalGrid } from "./TechnicalGrid";
import { DataStream } from "./DataStream";
import { Hero3D } from "./Hero3D";

export const NewHero = () => {
  return (
    <section className="relative min-h-screen flex items-center bg-[#050505] overflow-hidden selection:bg-white/20 selection:text-white">
      {/* Background 3D Layer */}
      <div className="absolute inset-0 z-0">
        <Hero3D />
      </div>

      {/* Overlay Gradient for Readability */}
      <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#050505] via-[#050505]/80 to-transparent pointer-events-none" />

      <TechnicalGrid />
      <DataStream />

      {/* Ambient Glow - Neutral/White */}
      <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-white/5 rounded-full blur-[120px] pointer-events-none mix-blend-screen z-0" />

      <div className="container mx-auto px-6 relative z-10 pt-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-10">
            {/* Badge - Minimalist */}
            <div className="inline-flex items-center gap-3">
              <div className="h-[1px] w-8 bg-white/40"></div>
              <span className="text-[10px] font-mono text-white/60 tracking-[0.2em] uppercase">
                Gen-3 Analytics Engine
              </span>
            </div>

            {/* Main Title - Strict Typography */}
            <div className="relative">
              <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-white leading-[0.9]">
                CENTURION
                <br />
                <span className="text-neutral-500">ECOSYSTEM</span>
              </h1>
            </div>

            {/* Description */}
            <p className="text-neutral-400 text-lg md:text-xl leading-relaxed max-w-xl font-light">
              The unfair advantage for{" "}
              <span className="text-white font-medium">institutional</span>{" "}
              retail traders. Architecting the next generation of execution
              infrastructure with precision and speed.
            </p>

            {/* Stats Grid - Minimal */}
            <div className="grid grid-cols-3 gap-8 py-8 border-t border-white/10">
              <div className="space-y-2">
                <div className="text-3xl font-mono text-white tracking-tighter">
                  50µs
                </div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-widest">
                  Latency
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-mono text-white tracking-tighter">
                  20k+
                </div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-widest">
                  TPS
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-mono text-white tracking-tighter">
                  99.9%
                </div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-widest">
                  Uptime
                </div>
              </div>
            </div>

            {/* Actions - LT Space Button */}
            <div className="flex flex-col sm:flex-row gap-4 mt-12">
              <Link
                to="/dashboard"
                className="group relative px-10 py-5 bg-white text-black font-bold text-lg tracking-widest transition-all hover:bg-neutral-200 hover:scale-105 shadow-[0_0_40px_rgba(255,255,255,0.3)]"
              >
                <div className="relative flex items-center gap-4">
                  <Terminal className="w-6 h-6" />
                  <span>LT SPACE</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            </div>
          </div>

          {/* Right Column - Empty now as 3D is background */}
          <div className="hidden lg:block h-[800px] w-full pointer-events-none"></div>
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
