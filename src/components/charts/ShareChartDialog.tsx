import React, { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Share2, Copy, Check, Download, Terminal } from 'lucide-react';
import html2canvas from 'html2canvas';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

interface ShareChartDialogProps {
  targetRef: React.RefObject<HTMLElement>;
  title: string;
  trigger?: React.ReactNode;
  tags?: string[];
}

export const ShareChartDialog: React.FC<ShareChartDialogProps> = ({ targetRef, title, trigger, tags = ['QUANT'] }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const generatePreview = async () => {
    if (!targetRef.current) return;
    
    setIsCapturing(true);
    try {
      // Capture the chart
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: '#09090b', // zinc-950
        scale: 2, // Higher quality
        logging: false,
        useCORS: true,
      });
      
      setPreviewUrl(canvas.toDataURL('image/png'));
    } catch (error) {
      console.error('Failed to generate preview:', error);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleCopy = async () => {
    if (!cardRef.current) return;

    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#000000',
        scale: 2,
        logging: false,
      });

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          setHasCopied(true);
          setTimeout(() => setHasCopied(false), 2000);
        } catch (err) {
          console.error('Failed to copy to clipboard:', err);
        }
      });
    } catch (error) {
      console.error('Failed to capture card:', error);
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;

    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#000000',
        scale: 2,
        logging: false,
      });

      const link = document.createElement('a');
      link.download = `centurion-analysis-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Failed to download:', error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (open) {
        // Small delay to ensure dialog is mounted before capturing? 
        // Actually we capture the *source* chart immediately when opening or just before.
        // Let's capture immediately when opening.
        setTimeout(generatePreview, 100);
      } else {
        setPreviewUrl(null);
      }
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-full bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle>Share Analysis</DialogTitle>
          <DialogDescription>
            Generate a shareable card for your analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-4">
          {/* The Card Preview Area */}
          <div className="relative bg-black p-8 rounded-lg border border-zinc-800 shadow-2xl max-w-full overflow-hidden" ref={cardRef}>
            {/* Card Header */}
            <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-green-500/10 rounded flex items-center justify-center border border-green-500/20">
                  <Terminal className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <h3 className="font-mono font-bold text-zinc-100 tracking-wider">CENTURION</h3>
                  <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Terminal Access</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-400 font-mono">OPERATOR</p>
                <p className="text-sm font-mono text-green-500">{user?.email?.split('@')[0] || 'ANONYMOUS'}</p>
              </div>
            </div>

            {/* Chart Image */}
            <div className="relative bg-zinc-900/50 rounded border border-zinc-800/50 overflow-hidden min-h-[300px] min-w-[600px] flex items-center justify-center">
              {isCapturing ? (
                <div className="text-zinc-500 font-mono animate-pulse">Acquiring Signal...</div>
              ) : previewUrl ? (
                <img src={previewUrl} alt="Chart Analysis" className="w-full h-auto object-contain" />
              ) : (
                <div className="text-red-500 font-mono">Signal Lost</div>
              )}
            </div>

            {/* Card Footer */}
            <div className="mt-6 flex justify-between items-end">
              <div>
                <h2 className="text-xl font-bold text-zinc-100 font-mono mb-1">{title}</h2>
                <p className="text-xs text-zinc-500 font-mono">{new Date().toUTCString()}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                 <div className="flex gap-2">
                    {tags.map((tag) => (
                      <span key={tag} className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 font-mono">
                        {tag}
                      </span>
                    ))}
                 </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 w-full justify-end">
            <Button variant="outline" onClick={handleDownload} disabled={!previewUrl}>
              <Download className="h-4 w-4 mr-2" />
              Download PNG
            </Button>
            <Button onClick={handleCopy} disabled={!previewUrl} className="bg-green-600 hover:bg-green-700 text-white">
              {hasCopied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {hasCopied ? 'Copied!' : 'Copy to Clipboard'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
