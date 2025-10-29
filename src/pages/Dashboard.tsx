import { AnimatedBackground } from '@/components/AnimatedBackground';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

// Import panels
import { RvwapPanel } from '@/components/rvwap/RvwapPanel';
import { MTMPanel } from '@/components/mtm/MTMPanel';

const Dashboard = () => {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Mobile blocker
  if (isMobile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border-2 border-border rounded-lg p-8 shadow-2xl text-center space-y-6">
          <div className="text-7xl">📱🚫</div>
          <h1 className="text-3xl font-bold">Dashboard Not Available on Mobile</h1>
          <p className="text-muted-foreground text-lg">
            The trading dashboard is currently not available on mobile devices due to complex chart interactions and data requirements.
          </p>
          <div className="pt-4 space-y-3 text-left bg-muted/30 rounded-lg p-4">
            <p className="font-semibold text-center">Please try:</p>
            <ul className="space-y-2 text-sm">
              <li>• Enable <strong>Desktop Mode</strong> in your browser settings</li>
              <li>• Access from a <strong>computer</strong> for the best experience</li>
            </ul>
          </div>
          <button
            onClick={() => navigate('/')}
            className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      {/* Animated Background */}
      <AnimatedBackground />

      {/* Content */}
      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              {/* Back Button */}
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              {/* Title */}
              <h1 className="text-2xl font-bold">Dashboard</h1>

              {/* Spacer */}
              <div className="w-20"></div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
          {/* MTM Panel */}
          <MTMPanel symbol="BTCUSDT" dataSource="spot" />
          
          {/* RVWAP Panel */}
          <RvwapPanel symbol="BTCUSDT" dataSource="spot" />
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
