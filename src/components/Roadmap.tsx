import { useRef, useEffect, useState } from "react";
import { Zap, Database, Globe, Cpu, Flag, Activity, Terminal, Layers } from "lucide-react";
import { Roadmap3DIcon } from "./Roadmap3DIcon";

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

export const Roadmap = () => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
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
                <div className="flex justify-center md:justify-end opacity-80 group-hover:opacity-100 transition-all duration-700 transform group-hover:scale-110">
                  <Roadmap3DIcon type={item.type} isHovered={hoveredIndex === idx} />
                </div>

              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

