import { useState } from "react";

const questions = [
  {
    q: "Why semi-predictive instead of predictive?",
    a: "Because markets aren't clockwork. They're conversations between millions of participants, each with incomplete information. Semi-predictive models acknowledge this chaos while finding patterns within it."
  },
  {
    q: "What's the biggest mistake traders make?",
    a: "Believing they can outsmart randomness instead of working with it. Successful trading isn't about being right more often—it's about being wrong less expensively."
  },
  {
    q: "How do you define edge?",
    a: "Edge isn't a guaranteed win. It's a slight statistical advantage repeated over time. Like a casino's 2% house edge—small, consistent, and compounding."
  }
];

export const Philosophy = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-32 px-4 relative">
      {/* Grid pattern removed - using Liquid Ether background instead */}
      
      <div className="max-w-4xl mx-auto relative">
        <div className="mb-16">
          <div className="flex items-center gap-6 mb-6">
            <span className="text-6xl font-bold text-primary/20">01</span>
            <h2 className="text-4xl md:text-5xl font-bold">Philosophy</h2>
          </div>
          <div className="w-20 h-1 bg-primary" />
        </div>
        
        <div className="space-y-4">
          {questions.map((item, idx) => (
            <div
              key={idx}
              className="border border-border bg-card transition-all"
            >
              <button
                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                className="w-full text-left p-6 flex items-start justify-between gap-4 hover:bg-primary/5 transition-all"
              >
                <span className="text-lg font-medium">{item.q}</span>
                <span className="text-2xl text-primary flex-shrink-0 transition-transform" style={{
                  transform: openIndex === idx ? 'rotate(45deg)' : 'rotate(0)'
                }}>
                  +
                </span>
              </button>
              {openIndex === idx && (
                <div className="px-6 pb-6 text-muted-foreground border-t border-border pt-4">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>

        <blockquote className="mt-16 border-l-4 border-primary/50 pl-6 py-4 text-lg text-muted-foreground italic">
          "Our society views trading not as a profession but as a gamble where one can get rich by chance. People enter the market with illusions, lose money, and leave disappointed. The problem lies in the culture of mass consumption where intermediaries and 'story sellers' promise easy money instead of knowledge. This devalues trading and harms the market. To change this the word 'trader' should become as respected as 'engineer' or 'surgeon'. Traders are crucial to the economy ensuring the flow of capital. We need education, examples of professionals, and an honest conversation about trading being hard work not a lottery. Only then will the market stop stagnating."
        </blockquote>
      </div>
    </section>
  );
};
