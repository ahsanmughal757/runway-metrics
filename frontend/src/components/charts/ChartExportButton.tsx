import { type RefObject } from 'react';
import { Button } from '@heroui/react';
import { Download } from 'lucide-react';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Renders the target chart's SVG to a canvas and downloads it as PNG.
 * No extra dependency — browsers serialize inline SVG natively.
 */
export function ChartExportButton({ targetRef }: { targetRef: RefObject<HTMLElement> }) {
  async function exportPng() {
    const svgEl = targetRef.current?.querySelector('svg');
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(rect.width));
    clone.setAttribute('height', String(rect.height));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);

    const svgString = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to rasterize chart'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) downloadBlob(b, 'runway-chart.png');
      }, 'image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <Button
      isIconOnly
      size="sm"
      variant="light"
      aria-label="Export chart as PNG"
      onPress={exportPng}
      className="text-runway-muted hover:text-runway-text"
    >
      <Download size={14} />
    </Button>
  );
}
