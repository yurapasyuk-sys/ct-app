/**
 * Simple test page to verify routing and basic rendering
 * Access at: http://localhost:8080/dashboard/test
 */

import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';

export default function TestDashboard() {
  const navigate = useNavigate();

  console.log('[TestDashboard] Component mounted successfully!');

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <header className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">Dashboard Routing Test</h1>
        </div>
        <p className="text-muted-foreground">
          If you can see this page, React Router is working correctly.
        </p>
      </header>

      <main className="space-y-6">
        <Card className="p-6 bg-card border border-border">
          <h2 className="text-xl font-semibold mb-4">✅ Routing Works</h2>
          <p className="text-muted-foreground mb-4">
            This test page proves that:
          </p>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li>React Router is properly configured</li>
            <li>Components are rendering in the /dashboard/* path</li>
            <li>Tailwind CSS is working (you see dark theme)</li>
            <li>shadcn/ui Card and Button components load correctly</li>
          </ul>
        </Card>

        <Card className="p-6 bg-card border border-border">
          <h2 className="text-xl font-semibold mb-4">🔍 Next Steps</h2>
          <p className="text-muted-foreground mb-4">
            If the MTM Dashboard shows a blank page:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Open browser DevTools (F12)</li>
            <li>Go to Console tab</li>
            <li>Look for <code className="bg-muted px-2 py-1 rounded">[MtmDashboard]</code> logs</li>
            <li>Check Network tab for failed requests (CORS errors)</li>
            <li>If CORS blocked: This is normal on localhost, will work in production</li>
          </ol>
        </Card>

        <Card className="p-6 bg-card border border-border">
          <h2 className="text-xl font-semibold mb-4">🚀 Test Links</h2>
          <div className="flex gap-4">
            <Button onClick={() => navigate('/dashboard/mtm')}>
              Go to MTM Dashboard
            </Button>
            <Button variant="outline" onClick={() => navigate('/')}>
              Go to Home
            </Button>
          </div>
        </Card>

        <Card className="p-6 bg-card border border-border">
          <h2 className="text-xl font-semibold mb-4">📊 Browser Info</h2>
          <div className="space-y-2 text-sm font-mono">
            <p>
              <span className="text-muted-foreground">User Agent:</span>{' '}
              <span className="text-foreground">{navigator.userAgent}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Viewport:</span>{' '}
              <span className="text-foreground">
                {window.innerWidth}x{window.innerHeight}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Current URL:</span>{' '}
              <span className="text-foreground">{window.location.href}</span>
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
}
