import { useState, useEffect } from 'react';
import { Menu, X, Terminal } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

const NAV_LINKS = [
  { id: 'philosophy', label: 'Philosophy', href: '#philosophy' },
  { id: 'experience', label: 'Experience', href: '#experience' },
  { id: 'models', label: 'Models', href: '#models' },
  { id: 'bonus', label: 'Bonus', href: '#bonus' },
  { id: 'connect', label: 'Connect', href: '#connect' },
];

interface StickyNavbarProps {
  ctaText?: string;
  ctaHref?: string;
}

export const StickyNavbar = ({ 
  ctaText = 'Dashboard', 
  ctaHref = '/dashboard',
}: StickyNavbarProps) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (href: string) => {
    setMobileMenuOpen(false);
    const sectionId = href.replace('#', '');
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      <nav 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${
          isScrolled 
            ? 'bg-background/80 backdrop-blur-md border-border py-3' 
            : 'bg-transparent border-transparent py-5'
        }`}
      >
        <div className="container mx-auto px-6 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight flex items-center gap-2">
            BORKISS<span className="text-muted-foreground font-light">.TRADE</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(link => (
              <button
                key={link.id}
                onClick={() => handleNavClick(link.href)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </button>
            ))}
            
            <Link
              to={ctaHref}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Terminal className="w-4 h-4" />
              {ctaText}
            </Link>
          </div>

          {/* Mobile Toggle */}
          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-background pt-24 px-6 md:hidden">
          <div className="flex flex-col gap-6">
            {NAV_LINKS.map(link => (
              <button
                key={link.id}
                onClick={() => handleNavClick(link.href)}
                className="text-2xl font-medium text-foreground text-left"
              >
                {link.label}
              </button>
            ))}
            <Link
              to={ctaHref}
              className="mt-4 inline-flex items-center justify-center gap-2 px-6 py-4 rounded-lg bg-primary text-primary-foreground text-lg font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Terminal className="w-5 h-5" />
              {ctaText}
            </Link>
          </div>
        </div>
      )}
    </>
  );
};
