import { useEffect, useMemo, useRef } from 'react';
import { Download } from 'lucide-react';
import QRCodeStyling from 'qr-code-styling';

type QrVariant = 'print' | 'screen';

interface BrandedQrProps {
    value: string;
    size?: number;
    className?: string;
    /**
     * 'print' is flat black for posters; 'screen' adds the emerald gradient used
     * on the projector. Both stay dark-on-white — see buildQr.
     */
    variant?: QrVariant;
    /** Localized labels for the two download buttons; omit to hide them. */
    downloadLabels?: { png: string; svg: string };
    /** Basename (no extension) for downloaded files. */
    downloadName?: string;
}

// errorCorrectionLevel stays 'H': rounded modules eat into legibility, and H
// keeps the code scannable from the back of a room.
//
// The 'screen' gradient runs #047857 -> #09090b. Both ends are deliberately
// dark (contrast vs the white background stays >7:1 across the whole ramp), so
// the emerald reads as styling to a human while a scanner still sees an
// unambiguous dark module. Anything lighter starts costing scans at projector
// distance, which is the one thing this QR cannot afford.
function buildQr(value: string, size: number, variant: QrVariant): QRCodeStyling {
    const dark = '#09090b';
    const gradient = variant === 'screen'
        ? {
            type: 'linear' as const,
            rotation: Math.PI / 4,
            colorStops: [
                { offset: 0, color: '#047857' },
                { offset: 1, color: dark },
            ],
        }
        : undefined;

    return new QRCodeStyling({
        width: size,
        height: size,
        type: 'svg',
        data: value,
        qrOptions: { errorCorrectionLevel: 'H' },
        dotsOptions: { color: dark, gradient, type: 'rounded' },
        cornersSquareOptions: { color: dark, type: 'extra-rounded' },
        cornersDotOptions: { color: dark, type: 'dot' },
        backgroundOptions: { color: '#ffffff' },
    });
}

export default function BrandedQr({ value, size = 224, className, variant = 'print', downloadLabels, downloadName = 'glossary-qr' }: BrandedQrProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const qr = useMemo(() => (value ? buildQr(value, size, variant) : null), [value, size, variant]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || !qr) return;
        qr.append(container);
        return () => {
            container.replaceChildren();
        };
    }, [qr]);

    if (!value) return null;

    // Downloads re-render at print resolution rather than screen size.
    const download = (extension: 'png' | 'svg') => {
        // Downloads are for print, so they never carry the screen gradient.
        const printQr = buildQr(value, 1024, 'print');
        void printQr.download({ name: downloadName, extension });
    };

    return (
        <div className={className}>
            <div ref={containerRef} className="flex items-center justify-center [&>svg]:h-full [&>svg]:w-full" style={{ width: size, height: size }} />
            {downloadLabels && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() => download('png')}
                        className="flex items-center justify-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 transition hover:border-emerald-500"
                    >
                        <Download className="h-3.5 w-3.5" />
                        {downloadLabels.png}
                    </button>
                    <button
                        type="button"
                        onClick={() => download('svg')}
                        className="flex items-center justify-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 transition hover:border-emerald-500"
                    >
                        <Download className="h-3.5 w-3.5" />
                        {downloadLabels.svg}
                    </button>
                </div>
            )}
        </div>
    );
}
