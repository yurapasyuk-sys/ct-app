import { SectionLayout } from "./ui/SectionLayout";
import { Gift, ExternalLink, GraduationCap, BarChart2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

const bonuses = [
  {
    title: "Cryptomannn Academy",
    description: "Comprehensive crypto trading education focusing on market structure and psychology.",
    link: "/bonus#cryptomannn",
    icon: GraduationCap
  },
  {
    title: "Scope360",
    description: "Advanced market intelligence and on-chain analytics platform.",
    link: "/bonus#scope360",
    icon: BarChart2
  },
  {
    title: "OKX",
    description: "Leading exchange with exclusive fee discounts and mystery boxes for our community.",
    link: "/bonus#okx",
    icon: ShieldCheck
  }
];

export const Bonus = () => {
  return (
    <SectionLayout number="06" title="Bonus" className="bg-secondary/20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {bonuses.map((bonus, idx) => (
          <Link
            key={idx}
            to={bonus.link}
            className="flex flex-col p-8 bg-card rounded-xl border border-border hover:border-primary/30 transition-all duration-300 hover:shadow-lg group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Gift className="w-24 h-24 -mr-8 -mt-8 rotate-12" />
            </div>

            <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-transform duration-300 border border-border">
              <bonus.icon className="w-8 h-8" />
            </div>
            
            <h3 className="text-xl font-semibold mb-3 text-foreground flex items-center gap-2">
              {bonus.title}
              <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
            </h3>
            
            <p className="text-muted-foreground leading-relaxed mb-6 flex-grow">
              {bonus.description}
            </p>

            <div className="mt-auto">
              <span className="inline-flex items-center justify-center w-full py-2 rounded-lg bg-primary/10 text-primary font-medium text-sm group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                View Details
              </span>
            </div>
          </Link>
        ))}
      </div>
    </SectionLayout>
  );
};
