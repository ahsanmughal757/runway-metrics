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

    // Standalone SVG has no access to the app's CSS variables, so resolve any
    // var(--runway-*) colors to their computed values before serializing.
    const resolvedCache: Record<string, string> = {};
    function resolveVar(value: string): string {
      const replaced = value.replace(/var\((--[\w-]+)\)/g, (full, key: string) => {
        if (!(key in resolvedCache)) {
          const raw = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
          resolvedCache[key] = raw;
        }
        return resolvedCache[key] || full;
      });
      if (/^var\(--[\w-]+\)$/.test(value.trim())) return `rgb(${replaced})`;
      return replaced;
    }
    const walk = (node: Node) => {
      if (node instanceof SVGElement) {
        for (const attr of ['stroke', 'fill', 'stop-color', 'color']) {
          const v = node.getAttribute(attr);
          if (v && v.includes('var(')) node.setAttribute(attr, resolveVar(v));
        }
        const style = node.getAttribute('style');
        if (style && style.includes('var(')) {
          node.setAttribute('style', style.replace(/var\(--[\w-]+\)/g, resolveVar));
        }
      }
      node.childNodes.forEach(walk);
    };
    walk(clone);

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
