import type { PresentSlideMode } from './settings';

export const MODE_HINTS: Record<PresentSlideMode, string> = {
    markdown: '# Heading\n\nParagraph with **bold** and {{SPX.price}} tokens.\n\n- bullet one\n- bullet two',
    html: '<!DOCTYPE html>\n<html><body style="background:#0a0a0a;color:#fff;font-family:system-ui;padding:4rem">\n  <h1 style="color:#34d399;font-size:4rem">Slide Title</h1>\n  <p style="font-size:2rem">Pasted Claude HTML renders sandboxed.</p>\n</body></html>',
    url: 'https://docs.google.com/presentation/d/e/YOUR_PUBLISHED_ID/embed',
    pdf: '',
};

export const EXAMPLES: Record<PresentSlideMode, { label: string; content: string }[]> = {
    markdown: [
        {
            label: 'Market snapshot',
            content: '# Today\'s Market View\n\n- **S&P 500** at {{^GSPC.price}} ({{^GSPC.changePercent}}%)\n- **Nasdaq** at {{^IXIC.price}}\n- **Hang Seng** at {{^HSI.price}}\n\n> Watch VIX for regime shifts.',
        },
    ],
    html: [
        {
            label: 'Dark slide',
            content: '<!DOCTYPE html>\n<html><body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">\n  <div style="text-align:center">\n    <h1 style="color:#34d399;font-size:5rem;margin:0">Market Update</h1>\n    <p style="color:#71717a;font-size:2rem;margin-top:1rem">{{date}}</p>\n  </div>\n</body></html>',
        },
    ],
    url: [
        {
            label: 'Google Slides',
            content: 'https://docs.google.com/presentation/d/e/YOUR_PUBLISHED_ID/embed?start=false&loop=false',
        },
    ],
    pdf: [],
};
