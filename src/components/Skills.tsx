const skills = [
  { category: "Frontend", items: ["React", "TypeScript", "Next.js", "Tailwind CSS", "Three.js"] },
  { category: "Backend", items: ["Node.js", "Python", "PostgreSQL", "Redis", "Docker"] },
  { category: "Blockchain", items: ["Solidity", "Ethers.js", "Web3.js", "Smart Contracts", "IPFS"] },
  { category: "Security", items: ["Penetration Testing", "OWASP", "Cryptography", "Network Security", "Auditing"] },
];

export const Skills = () => {
  return (
    <section className="py-32 px-4 relative">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      
      <div className="max-w-6xl mx-auto relative">
        <div className="mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Tech Stack</h2>
          <div className="w-20 h-1 bg-primary" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {skills.map((skill, idx) => (
            <div
              key={skill.category}
              className="border border-border bg-card p-8 hover-lift"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-semibold">{skill.category}</h3>
                <span className="text-xs text-muted-foreground px-3 py-1 border border-border">
                  0{idx + 1}
                </span>
              </div>
              
              <div className="space-y-3">
                {skill.items.map((item) => (
                  <div key={item} className="flex items-center justify-between py-2 border-b border-border/50">
                    <span className="text-foreground">{item}</span>
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-2 h-2 ${
                            i < 4 ? 'bg-primary' : 'bg-muted'
                          }`}
                        />
                      ))}
                    </div>
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
