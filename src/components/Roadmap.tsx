import { useRef, useEffect } from "react";
import { Zap, Database, Globe, Cpu, Flag, Activity, Terminal, Layers } from "lucide-react";

const milestones = [
  {
    quarter: "Q1 2026",
    title: "Metric Explosion",
    description: "Expanding the intelligence layer with a vast range of market, behavioral, and sentiment-based indicators.",
    details: ["+100 New Metrics", "Deep Insight Layer", "Unified Dashboard"],
    type: "database",
    icon: Database
  },
  {
    quarter: "Q2 2026",
    title: "Amex Heart Core",
    description: "Next-generation analytics core in Rust for speed, safety, and precision execution.",
    details: ["50µs Latency", "Risk Guard", "Memory Safety"],
    type: "heart",
    icon: Activity
  },
  {
    quarter: "Q3 2026",
    title: "Terminal V2",
    description: "Institutional-grade experience for retail. Performance-optimized front-end with new layout.",
    details: ["Native Execution", "Liquidity Zones", "Advanced Charting"],
    type: "terminal",
    icon: Terminal
  },
  {
    quarter: "Q4 2026",
    title: "Data Fusion API",
    description: "Launch of ultra-fast data engine. Rust-powered low-latency API aggregates raw data.",
    details: ["Sub-10ms Response", "AWS Lambda/EKS", "ML Pipeline Ready"],
    type: "api",
    icon: Zap
  },
  {
    quarter: "Strategic",
    title: "Ecosystem Expansion",
    description: "Deep AWS integration and open SDK for custom analytics.",
    details: ["Compute Hosting", "Open SDK", "Fintech Integration"],
    type: "ecosystem",
    icon: Globe
  }
];

const HeartAnimation = () => (
  <div className="relative w-24 h-24 flex items-center justify-center">
    <div className="absolute inset-0 border border-white/10 rounded-full animate-ping" />
    <div className="absolute inset-4 border border-white/20 rounded-full animate-pulse" />
    <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.5)]" />
    {/* EKG Line */}
    <svg className="absolute inset-0 w-full h-full text-white/40" viewBox="0 0 100 100">
      <path d="M0 50 H30 L40 20 L50 80 L60 50 H100" fill="none" stroke="currentColor" strokeWidth="0.5" className="animate-[dash_2s_linear_infinite]" strokeDasharray="100" strokeDashoffset="100" />
    </svg>
  </div>
);

const DatabaseAnimation = () => (
  <div className="relative w-24 h-24 flex flex-col items-center justify-center gap-2 perspective-500">
    {[...Array(3)].map((_, i) => (
      <div 
        key={i} 
        className="w-20 h-4 border border-white/20 bg-white/5 rounded-[50%] relative overflow-hidden transform rotate-x-12"
        style={{ animation: `float 3s ease-in-out infinite ${i * 0.5}s` }}
      >
        <div className="absolute inset-0 bg-white/10 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
        <div className="absolute top-0 left-[-100%] w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
      </div>
    ))}
  </div>
);

const TerminalAnimation = () => (
  <div className="relative w-24 h-20 border border-white/20 bg-black/80 rounded-sm p-3 flex flex-col gap-1 overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.05)]">
    <div className="w-full h-[1px] bg-white/10" />
    <div className="font-mono text-[8px] text-white/80 leading-none">
      <span className="text-white/40">{">"}</span> INIT_CORE<br/>
      <span className="text-white/40">{">"}</span> LOAD_MODULES<br/>
      <span className="text-white/40">{">"}</span> OPTIMIZING...<br/>
      <span className="animate-pulse text-white">{">"} _</span>
    </div>
  </div>
);

const ApiAnimation = () => (
  <div className="relative w-24 h-24 flex items-center justify-center">
    <div className="absolute w-20 h-20 border border-white/10 rounded-full animate-[spin_10s_linear_infinite]" />
    <div className="absolute w-16 h-16 border-t border-b border-white/30 rounded-full animate-[spin_3s_linear_infinite]" />
    <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_10px_white]" />
    {[...Array(4)].map((_, i) => (
      <div 
        key={i} 
        className="absolute w-[1px] h-10 bg-gradient-to-b from-white/40 to-transparent"
        style={{ transform: `rotate(${i * 90}deg) translateY(-20px)` }} 
      />
    ))}
  </div>
);

const EcosystemAnimation = () => (
  <div className="relative w-24 h-24">
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1 p-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="border border-white/10 bg-white/5 relative overflow-hidden rounded-sm group-hover:border-white/30 transition-colors">
           <div className="absolute inset-0 bg-white/5 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
        </div>
      ))}
    </div>
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-28 h-[1px] bg-white/10 rotate-45" />
      <div className="w-28 h-[1px] bg-white/10 -rotate-45" />
      <div className="w-2 h-2 bg-white rounded-full animate-ping" />
    </div>
  </div>
);

const getAnimation = (type: string) => {
  switch (type) {
    case 'heart': return <HeartAnimation />;
    case 'database': return <DatabaseAnimation />;
    case 'terminal': return <TerminalAnimation />;
    case 'api': return <ApiAnimation />;
    case 'ecosystem': return <EcosystemAnimation />;
    default: return <div className="w-12 h-12 border border-white/20" />;
  }
};

export const Roadmap = () => {
  return (
    <section className="py-32 relative bg-[#050505] overflow-hidden" id="roadmap">
      {/* Background Grid - Subtle */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:60px_60px]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-transparent to-[#050505]" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="mb-32 flex flex-col items-start">
          <div className="inline-flex items-center gap-3 mb-8">
            <div className="h-[1px] w-12 bg-white/20"></div>
            <span className="text-[10px] font-mono text-white/40 tracking-[0.3em] uppercase">Strategic Vision</span>
          </div>
          
          <h2 className="text-5xl md:text-7xl font-bold text-white mb-8 tracking-tighter leading-none">
            DEVELOPMENT<br />
            <span className="text-neutral-600">ROADMAP</span>
          </h2>
          
          <p className="text-neutral-400 max-w-xl text-lg font-light leading-relaxed border-l border-white/10 pl-6">
            Executing a phased rollout of high-performance infrastructure. 
            From metric expansion to institutional-grade execution core.
          </p>
        </div>

        <div className="relative space-y-24">
          {/* Vertical Line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-[1px] bg-gradient-to-b from-white/20 via-white/5 to-transparent hidden md:block" />

          {milestones.map((item, idx) => (
            <div 
              key={idx} 
              className="group relative grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-16 items-center"
            >
              {/* Timeline Node */}
              <div className="hidden md:flex col-span-1 justify-center relative">
                <div className="w-10 h-10 rounded-full border border-white/10 bg-[#050505] flex items-center justify-center z-10 group-hover:border-white/40 transition-colors duration-500">
                  <div className="w-2 h-2 bg-white/20 rounded-full group-hover:bg-white transition-colors duration-500" />
                </div>
              </div>

              {/* Content - Full Width / Open Space */}
              <div className="col-span-11 grid grid-cols-1 md:grid-cols-2 gap-12 items-center border-b border-white/5 pb-12 group-hover:border-white/10 transition-colors duration-500">
                
                {/* Text Content */}
                <div className="space-y-6">
                  <div className="font-mono text-xs text-white/40 tracking-widest uppercase">
                    {item.quarter}
                  </div>
                  
                  <h3 className="text-3xl md:text-4xl font-bold text-white tracking-tight group-hover:translate-x-2 transition-transform duration-500">
                    {item.title}
                  </h3>
                  
                  <p className="text-neutral-400 text-base leading-relaxed max-w-md">
                    {item.description}
                  </p>

                  <div className="flex flex-wrap gap-4 pt-4">
                    {item.details.map((detail, dIdx) => (
                      <div key={dIdx} className="flex items-center gap-2 text-xs font-mono text-neutral-500 border border-white/5 px-3 py-1 rounded-full">
                        <div className="w-1 h-1 bg-white/20 rounded-full" />
                        {detail}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Animation / Visual */}
                <div className="flex justify-center md:justify-end opacity-50 group-hover:opacity-100 transition-all duration-700 transform group-hover:scale-110 grayscale group-hover:grayscale-0">
                  {getAnimation(item.type)}
                </div>

              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

