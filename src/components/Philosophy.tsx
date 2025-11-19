import { SectionLayout } from "./ui/SectionLayout";
import { Target, AlertTriangle, BarChart3 } from "lucide-react";

const questions = [
  {
    q: "Why semi-predictive instead of predictive?",
    a: "Because markets aren't clockwork. They're conversations between millions of participants, each with incomplete information. Semi-predictive models acknowledge this chaos while finding patterns within it.",
    icon: Target
  },
  {
    q: "What's the biggest mistake traders make?",
    a: "Believing they can outsmart randomness instead of working with it. Successful trading isn't about being right more often—it's about being wrong less expensively.",
    icon: AlertTriangle
  },
  {
    q: "How do you define edge?",
    a: "Edge isn't a guaranteed win. It's a slight statistical advantage repeated over time. Like a casino's 2% house edge—small, consistent, and compounding.",
    icon: BarChart3
  }
];

const quote = {
  text: "Our society views trading not as a profession but as a gamble where one can get rich by chance. People enter the market with illusions, lose money, and leave disappointed. The problem lies in the culture of mass consumption where intermediaries and 'story sellers' promise easy money instead of knowledge. This devalues trading and harms the market. To change this the word 'trader' should become as respected as 'engineer' or 'surgeon'. Traders are crucial to the economy ensuring the flow of capital. We need education, examples of professionals, and an honest conversation about trading being hard work not a lottery. Only then will the market stop stagnating.",
  highlights: [
    { text: "trading not as a profession but as a gamble", color: "bg-red-100 text-red-800" },
    { text: "trader should become as respected as 'engineer' or 'surgeon'", color: "bg-blue-100 text-blue-800" },
    { text: "hard work not a lottery", color: "bg-green-100 text-green-800" }
  ]
};

export const Philosophy = () => {
  const renderQuoteWithHighlights = (text: string) => {
    let result = text;
    
    // Sort highlights by length descending to avoid nested replacement issues
    const sortedHighlights = [...quote.highlights].sort((a, b) => b.text.length - a.text.length);

    sortedHighlights.forEach(({ text: highlightText, color }) => {
      const regex = new RegExp(`(${highlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      result = result.replace(regex, `<span class="${color} px-1 rounded font-medium">$1</span>`);
    });

    return result;
  };

  return (
    <SectionLayout number="01" title="Philosophy" id="philosophy" className="bg-background">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
        {questions.map((item, idx) => (
          <div
            key={idx}
            className="group p-8 rounded-xl bg-card border border-border hover:border-primary/20 hover:shadow-lg transition-all duration-300"
          >
            <div className="mb-6 opacity-80 group-hover:scale-110 transition-transform duration-300 text-primary">
              <item.icon className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-semibold mb-4 text-foreground">{item.q}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {item.a}
            </p>
          </div>
        ))}
      </div>

      {/* Quote Section */}
      <div className="relative bg-secondary/30 rounded-2xl p-8 md:p-12 border border-border/50">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className="flex-shrink-0">
            <div className="w-20 h-20 rounded-full overflow-hidden border border-border shadow-sm">
              <img 
                src="/Eye 3.png" 
                alt="Author"
                className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-500"
              />
            </div>
          </div>

          <div className="flex-1">
            <blockquote className="text-lg md:text-xl text-foreground/80 leading-relaxed font-serif italic">
              <p 
                dangerouslySetInnerHTML={{ 
                  __html: renderQuoteWithHighlights(quote.text)
                }}
              />
            </blockquote>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
};
