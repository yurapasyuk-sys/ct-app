import React, { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Share2, Copy, Check, Download } from 'lucide-react';
import html2canvas from 'html2canvas';

interface ShareChartDialogProps {
  targetRef: React.RefObject<HTMLElement>;
  title: string;
  trigger?: React.ReactNode;
  tags?: string[];
  symbol?: string;
  timeframe?: string;
  indicator?: string;
}

export const ShareChartDialog: React.FC<ShareChartDialogProps> = ({ 
  targetRef, 
  title, 
  trigger, 
  tags = ['QUANT'],
  symbol,
  timeframe,
  indicator
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const displayName = 'Codex Operator';

  const generatePreview = async () => {
    if (!targetRef.current) return;
    
    setIsCapturing(true);
    try {
      // Capture the chart
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: '#09090b', // zinc-950
        scale: 4, // Ultra High Quality (4x scale for 4K-like resolution)
        logging: false,
        useCORS: true,
        allowTaint: true,
        onclone: (clonedDoc) => {
          // Ensure cloned canvas elements have high DPI
          const canvases = clonedDoc.getElementsByTagName('canvas');
          for (let i = 0; i < canvases.length; i++) {
            const canvas = canvases[i];
            // We can try to force high quality rendering here if needed
            // But usually scale: 4 does the job for the container
          }
        }
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
        scale: 4, // 4x Scale for high resolution output
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
        scale: 4, // 4x Scale for high resolution output
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
          <div className="relative bg-black p-4 border-2 border-zinc-800 max-w-full overflow-hidden" ref={cardRef}>
            {/* Chart Image */}
            <div className="relative border-2 border-zinc-800 bg-black overflow-hidden mb-4">
              {isCapturing ? (
                <div className="h-[400px] flex items-center justify-center text-zinc-500 font-mono animate-pulse">Acquiring Signal...</div>
              ) : previewUrl ? (
                <img src={previewUrl} alt="Chart Analysis" className="w-full h-auto block" />
              ) : (
                <div className="h-[400px] flex items-center justify-center text-red-500 font-mono">Signal Lost</div>
              )}
            </div>

            {/* Card Footer */}
            <div className="flex justify-between items-end font-mono text-zinc-300 pt-1">
              {/* Left Side */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-white uppercase">
                    Centurion
                  </h1>
                  <span className="text-lg font-bold tracking-tight text-white uppercase">LOCAL</span>
                  <span className="text-xs text-zinc-500 uppercase tracking-widest self-center">Terminal</span>
                </div>

                {(symbol || timeframe || indicator) && (
                   <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                      {symbol && <span className="text-white font-bold">{symbol}</span>}
                      {timeframe && (
                        <>
                          <span className="text-zinc-700">/</span>
                          <span>{timeframe}</span>
                        </>
                      )}
                      {indicator && (
                        <>
                          <span className="text-zinc-700">/</span>
                          <span className="text-yellow-500">{indicator}</span>
                        </>
                      )}
                   </div>
                )}
              </div>

              {/* Right Side */}
              <div className="flex flex-col items-end gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] text-zinc-600 uppercase tracking-wider">user</span>
                  <span className="text-sm font-bold text-white">
                    {displayName}
                  </span>
                </div>
                <p className="text-[8px] text-zinc-600 tracking-wider uppercase">borkiss.trade</p>
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
