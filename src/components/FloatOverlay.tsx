interface Props {
    src: string;
    caption?: string;
    label: string;
    onClose: () => void;
}

/** Centered ~65% image/SVG on top of the deck. Clicking the dimmed margin closes it. */
export function FloatOverlay({ src, caption, label, onClose }: Props) {
    return (
        <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/45"
            onClick={onClose}
            role="dialog"
            aria-label={label}
        >
            <figure
                className="m-0 flex flex-col bg-black shadow-2xl"
                style={{ width: '65vw', height: '65vh', maxWidth: '65vw', maxHeight: '65vh' }}
                onClick={event => event.stopPropagation()}
            >
                <img src={src} alt={caption || label} className="min-h-0 w-full flex-1 object-contain" />
                {caption ? (
                    <figcaption className="px-[1em] py-[0.4em] text-center text-[clamp(0.75rem,1.6vmin,1.25rem)] text-zinc-200">
                        {caption}
                    </figcaption>
                ) : null}
            </figure>
        </div>
    );
}
