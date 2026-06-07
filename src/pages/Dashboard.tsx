import { UnifiedChartPanel } from '@/components/charts/UnifiedChartPanel';
import { MarketPulseAlerts } from '@/components/MarketPulseAlerts';
import { VwapZScorePanel } from '@/components/charts/VwapZScorePanel';
import MobileDashboard from '@/components/MobileDashboard';
import { useIsMobile } from '@/hooks/use-mobile';

const Dashboard = () => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileDashboard />;
  }

  return (
    <div className="flex h-full min-h-[720px] w-full flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <div className="grid h-full min-h-[600px] grid-cols-1 grid-rows-[3fr_2fr] gap-4 lg:grid-cols-4">
          <div className="lg:col-span-3 row-span-1 min-h-0">
            <UnifiedChartPanel />
          </div>

          <div className="lg:col-span-1 row-span-1 min-h-0">
            <MarketPulseAlerts />
          </div>

          <div className="lg:col-span-4 row-span-1 min-h-0">
            <VwapZScorePanel />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
