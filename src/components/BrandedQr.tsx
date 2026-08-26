import { useEffect, useMemo, useRef } from 'react';
import { Download } from 'lucide-react';
import QRCodeStyling from 'qr-code-styling';

interface BrandedQrProps {
    value: string;
    size?: number;
    className?: string;
    /** Localized labels for the two download buttons; omit to hide them. */
    downloadLabels?: { png: string; svg: string };
    /** Basename (no extension) for downloaded files. */
    downloadName?: string;
}

// Styled QR for print/poster use (the permanent /j link). errorCorrectionLevel
// stays 'H': the rounded styling plus any future center logo eat into module
// legibility, and H keeps the code scannable from the back of a room.
function buildQr(value: string, size: number): QRCodeStyling {
    return new QRCodeStyling({
        width: size,
        height: size,
        type: 'svg',
        data: value,
        qrOptions: { errorCorrectionLevel: 'H' },
        dotsOptions: { color: '#09090b', type: 'rounded' },
        cornersSquareOptions: { color: '#09090b', type: 'extra-rounded' },
        cornersDotOptions: { color: '#09090b', type: 'dot' },
        backgroundOptions: { color: '#ffffff' },
    });
}

export default function BrandedQr({ value, size = 224, className, downloadLabels, downloadName = 'glossary-qr' }: BrandedQrProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const qr = useMemo(() => (value ? buildQr(value, size) : null), [value, size]);

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
        const printQr = buildQr(value, 1024);
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
