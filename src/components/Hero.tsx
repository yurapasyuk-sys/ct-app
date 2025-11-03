import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export const Hero = () => {
  const [displayText, setDisplayText] = useState('');
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showScrollArrow, setShowScrollArrow] = useState(true);
  const words = ['Trader', 'Mentor', 'Developer'];

  // Typing effect
  useEffect(() => {
    const currentWord = words[wordIndex];
    const fullText = `${currentWord} / `;
    let timeout: NodeJS.Timeout;

    if (!isDeleting) {
      if (displayText.length < fullText.length) {
        timeout = setTimeout(() => {
          setDisplayText(fullText.slice(0, displayText.length + 1));
        }, 100);
      } else {
        timeout = setTimeout(() => {
          setIsDeleting(true);
        }, 2000);
      }
    } else {
      if (displayText.length > 0) {
        timeout = setTimeout(() => {
          setDisplayText(displayText.slice(0, -1));
        }, 50);
      } else {
        setIsDeleting(false);
        setWordIndex((prev) => (prev + 1) % words.length);
      }
    }

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, wordIndex, words]);

  // Hide scroll arrow on first scroll
  useEffect(() => {
    const handleScroll = () => {
      if (showScrollArrow) {
        setShowScrollArrow(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { once: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [showScrollArrow]);

  return (
    <section className="min-h-screen flex items-center justify-center relative overflow-hidden px-4">
      <div className="relative max-w-5xl w-full">
        <div className="mb-8">
          <div className="inline-block px-4 py-1.5 border border-primary/30 bg-primary/5 text-primary text-sm font-medium mb-6 shadow-[0_0_15px_rgba(168,85,247,0.2)] hover:shadow-[0_0_25px_rgba(168,85,247,0.3)] transition-all duration-300">
            SEMI-PREDICTIVE MODELS
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
            BORKISS
            <span className="text-gradient drop-shadow-[0_0_20px_rgba(168,85,247,0.4)]">.TRADE</span>
          </h1>
          
          <p className="text-2xl md:text-3xl text-muted-foreground mb-8 h-12 flex items-center">
            <span className="inline-flex items-center gap-1">
              {displayText}
              <span className="w-1 h-8 bg-gradient-to-b from-blue-500 to-cyan-400 animate-pulse ml-1"></span>
            </span>
          </p>

          {/* Stats Counter */}
          <StatsCounter />

          <p className="text-lg text-foreground/80 max-w-2xl leading-relaxed">
            Philosophy over prediction. Experience over emotion. Models that acknowledge uncertainty rather than promise certainty.
          </p>
        </div>
      </div>

      {/* Scroll Down Indicator */}
      {showScrollArrow && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
          <ChevronDown className="w-6 h-6 text-primary/60 hover:text-primary transition-colors" />
        </div>
      )}
    </section>
  );
};

// Stats Counter Component
const StatsCounter = () => {
  const [yearsTrading, setYearsTrading] = useState(0);
  const [studentsHelped, setStudentsHelped] = useState(0);
  const [indicatorsMade, setIndicatorsMade] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true);
        }
      },
      { threshold: 0.5 }
    );

    const element = document.getElementById('stats-counter');
    if (element) {
      observer.observe(element);
    }

    return () => {
      if (element) observer.unobserve(element);
    };
  }, [isVisible]);

  // Animate numbers when visible
  useEffect(() => {
    if (!isVisible) return;

    const animateTo = (target: number, setter: (val: number) => void, duration = 2000) => {
      const start = Date.now();
      const animate = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        setter(Math.floor(target * progress));

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      animate();
    };

    animateTo(3, setYearsTrading);
    animateTo(200, setStudentsHelped);
    animateTo(15, setIndicatorsMade);
  }, [isVisible]);

  return (
    <div id="stats-counter" className="grid grid-cols-3 gap-4 md:gap-8 my-12 px-4 md:px-0">
      <div className="text-center">
        <div className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
          {yearsTrading}+
        </div>
        <div className="text-sm md:text-base text-muted-foreground mt-2">Years Trading</div>
        <div className="text-xs text-blue-400/60 mt-1">(since age 15)</div>
      </div>
      <div className="text-center">
        <div className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
          {studentsHelped}+
        </div>
        <div className="text-sm md:text-base text-muted-foreground mt-2">Students Mentored</div>
      </div>
      <div className="text-center">
        <div className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
          {indicatorsMade}+
        </div>
        <div className="text-sm md:text-base text-muted-foreground mt-2">Custom Indicators</div>
      </div>
    </div>
  );
};

export default Hero;
