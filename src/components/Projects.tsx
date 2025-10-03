const projects = [
  {
    id: "01",
    name: "DeFi Trading Platform",
    description: "Automated trading system with real-time analytics and smart contract integration",
    year: "2024",
    tags: ["React", "Web3.js", "Node.js"],
  },
  {
    id: "02",
    name: "Security Audit Tool",
    description: "Comprehensive vulnerability scanner for web applications and smart contracts",
    year: "2024",
    tags: ["Python", "Solidity", "Docker"],
  },
  {
    id: "03",
    name: "Encrypted Messaging",
    description: "End-to-end encrypted communication platform with blockchain verification",
    year: "2023",
    tags: ["Next.js", "WebRTC", "IPFS"],
  },
  {
    id: "04",
    name: "NFT Marketplace",
    description: "Decentralized marketplace for digital assets with custom royalty system",
    year: "2023",
    tags: ["TypeScript", "Ethers.js", "PostgreSQL"],
  },
];

export const Projects = () => {
  return (
    <section className="py-32 px-4 bg-card/30">
      <div className="max-w-6xl mx-auto">
        <div className="mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Selected Work</h2>
          <div className="w-20 h-1 bg-primary" />
        </div>
        
        <div className="space-y-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="border border-border bg-background p-8 hover-lift cursor-pointer group"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-3">
                    <span className="text-xs text-muted-foreground font-mono">{project.id}</span>
                    <h3 className="text-2xl font-semibold group-hover:text-primary transition-colors">
                      {project.name}
                    </h3>
                  </div>
                  <p className="text-muted-foreground mb-4">{project.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {project.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 text-xs border border-border bg-card text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground mb-1">Year</div>
                    <div className="text-lg font-semibold">{project.year}</div>
                  </div>
                  <div className="w-10 h-10 border border-border flex items-center justify-center group-hover:border-primary group-hover:bg-primary/5 transition-all">
                    <span className="text-xl">→</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
