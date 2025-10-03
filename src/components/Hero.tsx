export const Hero = () => {
  return (
    <section className="min-h-screen flex items-center justify-center relative overflow-hidden px-4">
      <div className="absolute inset-0 grid-pattern opacity-40" />
      
      <div className="relative max-w-5xl w-full">
        <div className="mb-8">
          <div className="inline-block px-4 py-1.5 border border-primary/30 bg-primary/5 text-primary text-sm font-medium mb-6">
            AVAILABLE FOR PROJECTS
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
            BORKISS
            <span className="text-gradient">.TRADE</span>
          </h1>
          
          <p className="text-2xl md:text-3xl text-muted-foreground mb-4">
            Full-Stack Developer
          </p>
          
          <p className="text-lg text-muted-foreground max-w-2xl">
            Specializing in Web3, Security & System Architecture
          </p>
        </div>
        
        <div className="flex flex-wrap gap-4">
          <button className="px-8 py-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-medium">
            View Projects
          </button>
          <button className="px-8 py-4 border border-border hover:border-primary hover:bg-primary/5 transition-all font-medium">
            Contact
          </button>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20">
          {[
            { label: "Projects", value: "50+" },
            { label: "Experience", value: "5 Years" },
            { label: "Clients", value: "30+" },
            { label: "Success Rate", value: "99%" },
          ].map((stat) => (
            <div key={stat.label} className="border-l border-primary/30 pl-4">
              <div className="text-3xl font-bold text-gradient mb-1">{stat.value}</div>
              <div className="text-sm text-muted-foreground uppercase tracking-wider">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
