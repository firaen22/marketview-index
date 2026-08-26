import { useMemo } from 'react';

// Decorative backdrop for the fullscreen session QR.
//
// Hard rule: nothing here may render on top of the QR, animate the QR, or move
// anything inside its quiet zone. A scanner needs a static, high-contrast code;
// the motion exists only in the surrounding black space so the projector slide
// feels alive without costing a single scan. Purely presentational, so it is
// hidden from assistive tech and disabled under prefers-reduced-motion.
const PARTICLE_COUNT = 18;

interface Particle {
    left: number;
    delay: number;
    duration: number;
    size: number;
    drift: number;
    opacity: number;
}

// Deterministic per-mount: a fixed seed keeps the field from reshuffling on
// every re-render (join counts tick during a live session).
function makeParticles(seed: number): Particle[] {
    let state = seed;
    const next = () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
    return Array.from({ length: PARTICLE_COUNT }, () => ({
        left: next() * 100,
        delay: next() * -18,
        duration: 14 + next() * 12,
        size: 3 + next() * 5,
        drift: (next() - 0.5) * 12,
        opacity: 0.18 + next() * 0.35,
    }));
}

export default function QrAmbience() {
    const particles = useMemo(() => makeParticles(20260826), []);

    return (
        <div className="qr-ambience pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="qr-ambience-aurora absolute left-1/2 top-1/2 h-[120vmin] w-[120vmin] -translate-x-1/2 -translate-y-1/2 rounded-full" />
            {particles.map((p, i) => (
                <span
                    key={i}
                    className="qr-ambience-mote absolute rounded-full bg-emerald-300"
                    style={{
                        left: `${p.left}%`,
                        width: `${p.size}px`,
                        height: `${p.size}px`,
                        animationDelay: `${p.delay}s`,
                        animationDuration: `${p.duration}s`,
                        // Read by the keyframes; a plain `opacity` here would be
                        // overridden by the animation's own opacity track.
                        ['--qr-mote-opacity' as string]: String(p.opacity),
                        ['--qr-drift' as string]: `${p.drift}vmin`,
                    }}
                />
            ))}
        </div>
    );
}
