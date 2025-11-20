import { StickyNavbar } from "@/components/StickyNavbar";
import { SectionLayout } from "@/components/ui/SectionLayout";
import { ExternalLink, ShieldCheck, GraduationCap, BarChart2 } from "lucide-react";
import { Suspense, lazy, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { FeeComparisonChart } from "@/components/charts/FeeComparisonChart";

const PixelBackground = lazy(() => import("@/components/PixelBackground"));

const partners = [
  {
    id: "cryptomannn",
    name: "Cryptomannn Academy",
    description: "Comprehensive crypto trading education focusing on market structure, psychology, and risk management.",
    details: [
      "Access to exclusive video courses",
      "Daily market analysis and setups",
      "Private community of professional traders",
      "Weekly live coaching sessions"
    ],
    link: "https://cryptomannn.com",
    icon: GraduationCap,
    color: "text-blue-500"
  },
  {
    id: "scope360",
    name: "Scope360",
    description: "An advanced trading journal and analytics platform designed for conscious traders seeking a clear view of their performance. It unifies automatic trade import, deep statistical analysis, behavioral metrics, and progress tracking tools to enhance transparency and consistency.",
    details: [
      "Automated trade ingestion via API from major exchanges",
      "Real-time visualization of trading patterns and behavioral tendencies",
      "Deep analysis of errors, strategies, sessions, and market conditions",
      "Activity calendar with personalized weekly/monthly performance reports",
      "Tools for maintaining discipline and emotional control",
      "Mobile application for on-the-go performance tracking"
    ],
    link: "#",
    icon: BarChart2,
    color: "text-purple-500"
  },
  {
    id: "okx",
    name: "OKX",
    description: "One of the world's leading cryptocurrency exchanges with deep liquidity and advanced trading tools.",
    details: [
      "20% trading fee discount for life",
      "Up to $10,000 mystery box for new users",
      "VIP account status upgrade",
      "Priority customer support"
    ],
    link: "#",
    icon: ShieldCheck,
    color: "text-green-500"
  }
];

const BonusPage = () => {
  const { hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const element = document.getElementById(hash.replace('#', ''));
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [hash]);

  return (
    <div className="min-h-screen bg-background relative selection:bg-primary/20 selection:text-primary">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Suspense fallback={null}>
          <PixelBackground />
        </Suspense>
      </div>

      <StickyNavbar />

      <main className="relative z-10 pt-20">
        <SectionLayout number="01" title="Partner Benefits" className="bg-transparent">
          <div className="mb-12 max-w-2xl">
            <p className="text-lg text-muted-foreground leading-relaxed">
              Exclusive deals and tools curated for the Borkiss Trade community. 
              Enhance your trading edge with our trusted partners.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-12">
            {partners.map((partner) => (
              <div 
                key={partner.id}
                id={partner.id}
                className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-8 md:p-12 hover:border-primary/30 transition-all duration-300"
              >
                <div className="flex flex-col md:flex-row gap-8 items-start">
                  <div className={`p-4 rounded-xl bg-secondary/50 ${partner.color} border border-border`}>
                    <partner.icon className="w-12 h-12" />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-4">
                      <h3 className="text-2xl font-bold text-foreground">{partner.name}</h3>
                      <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">
                        Partner
                      </span>
                    </div>
                    
                    <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                      {partner.description}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                      {partner.details.map((detail, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm text-foreground/80">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          {detail}
                        </div>
                      ))}
                    </div>

                    {partner.id === 'okx' && (
                      <div className="mb-8">
                        <FeeComparisonChart />
                      </div>
                    )}

                    <a 
                      href={partner.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                    >
                      Claim Offer <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionLayout>
      </main>

      <footer className="relative z-10 border-t border-border py-12 bg-secondary/10">
        <div className="container mx-auto px-6 text-center">
          <p className="text-sm text-muted-foreground font-mono">
            BORKISS.TRADE — QUANT RESEARCH LAB
          </p>
          <p className="text-xs text-muted-foreground/60 mt-2">
            © {new Date().getFullYear()} All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default BonusPage;
