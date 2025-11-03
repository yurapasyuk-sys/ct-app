import { useState } from "react";

const questions = [
  {
    q: "Why semi-predictive instead of predictive?",
    a: "Because markets aren't clockwork. They're conversations between millions of participants, each with incomplete information. Semi-predictive models acknowledge this chaos while finding patterns within it.",
    emoji: "🎯"
  },
  {
    q: "What's the biggest mistake traders make?",
    a: "Believing they can outsmart randomness instead of working with it. Successful trading isn't about being right more often—it's about being wrong less expensively.",
    emoji: "⚠️"
  },
  {
    q: "How do you define edge?",
    a: "Edge isn't a guaranteed win. It's a slight statistical advantage repeated over time. Like a casino's 2% house edge—small, consistent, and compounding.",
    emoji: "📊"
  }
];

const quote = {
  text: "Our society views trading not as a profession but as a gamble where one can get rich by chance. People enter the market with illusions, lose money, and leave disappointed. The problem lies in the culture of mass consumption where intermediaries and 'story sellers' promise easy money instead of knowledge. This devalues trading and harms the market. To change this the word 'trader' should become as respected as 'engineer' or 'surgeon'. Traders are crucial to the economy ensuring the flow of capital. We need education, examples of professionals, and an honest conversation about trading being hard work not a lottery. Only then will the market stop stagnating.",
  highlights: [
    { text: "trading not as a profession but as a gamble", color: "text-blue-400" },
    { text: "trader should become as respected as 'engineer' or 'surgeon'", color: "text-cyan-400" },
    { text: "hard work not a lottery", color: "text-cyan-400" }
  ]
};

export const Philosophy = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const getPreview = (text: string) => {
    const words = text.split(' ').slice(0, 20).join(' ');
    return words + (text.split(' ').length > 20 ? '...' : '');
  };

  const renderQuoteWithHighlights = (text: string) => {
    let result = text;
    let offset = 0;

    quote.highlights.forEach(({ text: highlightText, color }) => {
      const regex = new RegExp(`(${highlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      result = result.replace(regex, `<span class="${color} font-semibold">$1</span>`);
    });

    return result;
  };

  return (
    <section className="py-32 px-4 relative">
      <div className="max-w-4xl mx-auto relative">
        <div className="mb-16">
          <div className="flex items-center gap-6 mb-6">
            <span className="text-6xl font-bold text-blue-500/20">01</span>
            <h2 className="text-4xl md:text-5xl font-bold">Philosophy</h2>
          </div>
          <div className="w-20 h-1 bg-gradient-to-r from-blue-500 to-cyan-400 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
        </div>
        
        <div className="space-y-4">
          {questions.map((item, idx) => (
            <div
              key={idx}
              className="border border-blue-500/30 bg-card/40 backdrop-blur-sm transition-all duration-300 hover:border-blue-400/60 hover:shadow-[0_0_25px_rgba(59,130,246,0.2)]"
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <button
                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                className="w-full text-left p-6 flex items-start justify-between gap-4 hover:bg-blue-500/5 transition-all duration-300"
              >
                <div className="flex items-start gap-4 flex-1">
                  <span className="text-2xl flex-shrink-0 mt-1">{item.emoji}</span>
                  <div className="flex-1">
                    <span className="text-lg font-medium block">{item.q}</span>
                    {hoveredIndex === idx && openIndex !== idx && (
                      <span className="text-sm text-blue-400/70 mt-2 block transition-all duration-200">
                        {getPreview(item.a)}
                      </span>
                    )}
                  </div>
                </div>
                <span 
                  className="text-2xl text-blue-400 flex-shrink-0 transition-transform duration-400"
                  style={{
                    transform: openIndex === idx ? 'rotate(45deg)' : 'rotate(0)',
                    transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)'
                  }}
                >
                  +
                </span>
              </button>
              <div
                className="overflow-hidden transition-all duration-400"
                style={{
                  maxHeight: openIndex === idx ? '500px' : '0',
                  opacity: openIndex === idx ? '1' : '0',
                  transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)'
                }}
              >
                <div className="px-6 pb-6 text-muted-foreground border-t border-blue-500/20 pt-4">
                  {item.a}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quote Section with Author Image */}
        <div className="mt-20 relative">
          <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
            {/* Author Image */}
            <div className="flex-shrink-0">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border-2 border-blue-400/50 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                <img 
                  src="/Eye 3.png" 
                  alt="Author"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Quote */}
            <div className="flex-1">
              <blockquote className="border-l-4 border-blue-400/60 pl-6 py-4 text-lg text-muted-foreground italic shadow-[-4px_0_15px_rgba(59,130,246,0.15)] relative">
                <span className="text-6xl text-blue-400/20 absolute -top-4 -left-4">"</span>
                <p 
                  dangerouslySetInnerHTML={{ 
                    __html: renderQuoteWithHighlights(quote.text)
                  }}
                  className="relative z-10"
                />
              </blockquote>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
