import { AnimatedBackground } from '@/components/AnimatedBackground';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Import panels
import { RvwapPanel } from '@/components/rvwap/RvwapPanel';

const Dashboard = () => {
  const navigate = useNavigate();

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
          {/* RVWAP Panel */}
          <RvwapPanel symbol="BTCUSDT" dataSource="spot" />
          
          {/* TODO: Add MTM Panel here when ready */}
          {/* <MTMPanel symbol="BTCUSDT" /> */}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
