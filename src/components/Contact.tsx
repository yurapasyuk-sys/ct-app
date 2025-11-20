import { SectionLayout } from "./ui/SectionLayout";
import { Mail, MessageSquare, Globe, ArrowUpRight } from "lucide-react";

const contacts = [
  { 
    label: "Ready to level up your trading?", 
    value: "cryptomannn.com", 
    link: "https://cryptomannn.com",
    icon: Globe
  },
  { 
    label: "Telegram", 
    value: "@borkiss", 
    link: "https://t.me/borkiss",
    icon: MessageSquare
  },
  { 
    label: "Email", 
    value: "contact@borkiss.trade", 
    link: "mailto:contact@borkiss.trade",
    icon: Mail
  },
];

export const Contact = () => {
  return (
    <SectionLayout number="07" title="Connect" className="bg-secondary/20">
      <div className="mb-12 text-lg text-muted-foreground max-w-2xl">
        For research questions, collaborations, or consulting inquiries.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {contacts.map((contact, idx) => (
          <a
            key={idx}
            href={contact.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col p-6 bg-card rounded-xl border border-border hover:border-primary/30 transition-all duration-300 hover:shadow-md group"
          >
            <div className="flex items-center justify-between mb-4">
              <contact.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
            
            <div className="mt-auto">
              <div className="text-sm text-muted-foreground mb-1">{contact.label}</div>
              <div className="text-lg font-medium text-foreground group-hover:text-primary transition-colors">
                {contact.value}
              </div>
            </div>
          </a>
        ))}
      </div>
    </SectionLayout>
  );
};
