import { useRef, useEffect } from "react";
import { Zap, Database, Globe, Cpu, Flag } from "lucide-react";

const milestones = [
  {
    quarter: "Q1 2026",
    title: "Metric Explosion",
    description: "Expanding the intelligence layer with a vast range of market, behavioral, and sentiment-based indicators.",
    details: ["+100 New Metrics", "Deep Insight Layer", "Unified Dashboard"],
    type: "database"
  },
  {
    quarter: "Q2 2026",
    title: "Amex Heart Core",
    description: "Next-generation analytics core in Rust for speed, safety, and precision execution.",
    details: ["50µs Latency", "Risk Guard", "Memory Safety"],
    type: "heart"
  },
  {
    quarter: "Q3 2026",
    title: "Terminal V2",
    description: "Institutional-grade experience for retail. Performance-optimized front-end with new layout.",
    details: ["Native Execution", "Liquidity Zones", "Advanced Charting"],
    type: "terminal"
  },
  {
    quarter: "Q4 2026",
    title: "Data Fusion API",
    description: "Launch of ultra-fast data engine. Rust-powered low-latency API aggregates raw data.",
    details: ["Sub-10ms Response", "AWS Lambda/EKS", "ML Pipeline Ready"],
    type: "api"
  },
  {
    quarter: "Strategic",
    title: "Ecosystem Expansion",
    description: "Deep AWS integration and open SDK for custom analytics.",
    details: ["Compute Hosting", "Open SDK", "Fintech Integration"],
    type: "ecosystem"
  }
];

const HeartAnimation = () => (
  <div className="relative w-16 h-16 flex items-center justify-center">
    <div className="absolute inset-0 border border-white/20 transform rotate-45 animate-pulse" />
    <div className="absolute inset-2 border border-white/40 transform rotate-45" />
    <div className="w-2 h-2 bg-neutral-200 rounded-full animate-ping" />
    {/* Data lines flowing out */}
    <div className="absolute top-1/2 left-1/2 w-full h-[1px] bg-white/20 -translate-x-1/2 -translate-y-1/2 rotate-0 animate-spin-slow" />
    <div className="absolute top-1/2 left-1/2 w-full h-[1px] bg-white/20 -translate-x-1/2 -translate-y-1/2 rotate-90 animate-spin-slow" />
  </div>
);

const DatabaseAnimation = () => (
  <div className="relative w-16 h-16 flex flex-col items-center justify-center gap-1">
    {[...Array(3)].map((_, i) => (
      <div key={i} className="w-12 h-3 border border-white/30 rounded-[100%] relative overflow-hidden">
        <div className="absolute inset-0 bg-white/5 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
        <div className="absolute top-0 left-[-100%] w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
      </div>
    ))}
  </div>
);

const TerminalAnimation = () => (
  <div className="relative w-16 h-12 border border-white/30 bg-black/50 p-1 flex flex-col gap-1 overflow-hidden">
    <div className="w-full h-[1px] bg-white/20" />
    <div className="font-mono text-[6px] text-white/70 leading-none">
      {">"} INIT_SEQ<br/>
      {">"} LOADING...<br/>
      <span className="animate-pulse">{">"} _</span>
    </div>
  </div>
);

const ApiAnimation = () => (
  <div className="relative w-16 h-16 flex items-center justify-center">
    <div className="absolute w-12 h-12 border border-white/30 rounded-full animate-spin-slow-reverse" />
    <div className="absolute w-8 h-8 border border-white/50 rounded-full animate-spin-slow" />
    <div className="w-2 h-2 bg-white rounded-full" />
    {[...Array(4)].map((_, i) => (
      <div 
        key={i} 
        className="absolute w-1 h-8 bg-gradient-to-b from-white/30 to-transparent"
        style={{ transform: `rotate(${i * 90}deg) translateY(-12px)` }} 
      />
    ))}
  </div>
);

const EcosystemAnimation = () => (
  <div className="relative w-16 h-16">
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1 p-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="border border-white/10 relative overflow-hidden">
           <div className="absolute inset-0 bg-white/5 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
        </div>
      ))}
    </div>
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-20 h-[1px] bg-white/10 rotate-45" />
      <div className="w-20 h-[1px] bg-white/10 -rotate-45" />
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
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:24px_24px]" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="mb-24 flex flex-col items-start border-l-2 border-white/10 pl-8">
          <div className="text-xs font-mono text-neutral-500 mb-2 uppercase tracking-widest">Strategic Vision</div>
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-4">
            Development<br />Roadmap
          </h2>
          <p className="text-neutral-400 max-w-xl text-sm leading-relaxed">
            Executing a phased rollout of high-performance infrastructure. 
            From metric expansion to institutional-grade execution core.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {milestones.map((item, idx) => (
            <div 
              key={idx} 
              className="group relative bg-white/[0.02] border border-white/5 p-8 hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300 flex flex-col justify-between min-h-[300px]"
            >
              {/* Connector Line (Design Element) */}
              <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-white/10 opacity-50" />
              
              <div>
                <div className="flex justify-between items-start mb-8">
                  <div className="font-mono text-xs text-neutral-500 border border-white/10 px-2 py-1">
                    {item.quarter}
                  </div>
                  {/* Custom Animation Container */}
                  <div className="opacity-70 group-hover:opacity-100 transition-opacity">
                    {getAnimation(item.type)}
                  </div>
                </div>

                <h3 className="text-xl font-bold text-white mb-3 tracking-tight">
                  {item.title}
                </h3>
                
                <p className="text-neutral-500 text-sm leading-relaxed mb-6">
                  {item.description}
                </p>
              </div>

              <div className="space-y-2 pt-6 border-t border-white/5">
                {item.details.map((detail, dIdx) => (
                  <div key={dIdx} className="flex items-center gap-2 text-xs font-mono text-neutral-400">
                    <div className="w-1 h-1 bg-white/30" />
                    {detail}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
