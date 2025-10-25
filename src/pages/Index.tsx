import { Hero } from "@/components/Hero";
import { Philosophy } from "@/components/Philosophy";
import { Experience } from "@/components/Experience";
import { Ideas } from "@/components/Ideas";
import { Models } from "@/components/Models";
import { Contact } from "@/components/Contact";
import { AnimatedBackground } from "@/components/AnimatedBackground";

const Index = () => {
  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedBackground />
      <div className="relative z-10">
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="text-xl font-bold">BORKISS</div>
            <div className="flex gap-8">
              <a href="#philosophy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Philosophy
              </a>
              <a href="#experience" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Experience
              </a>
              <a href="/dashboard/mtm" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Dashboard
              </a>
              <a href="#connect" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Connect
              </a>
            </div>
          </div>
        </nav>
        
        <Hero />
        <div id="philosophy">
          <Philosophy />
        </div>
        <div id="experience">
          <Experience />
        </div>
        <Ideas />
        <Models />
        <div id="connect">
          <Contact />
        </div>
        
        <footer className="border-t border-border py-8">
          <div className="max-w-6xl mx-auto px-4 text-center">
            <p className="text-sm text-muted-foreground">
              © 2025 borkiss.trade — All rights reserved
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
