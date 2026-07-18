import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    GlossaryApiError,
    fetchGlossarySession,
    reopenGlossarySession,
    startGlossarySession,
} from './glossaryApi';
import { uploadPdf } from './slideApi';

function stubFetch(response: Partial<Response> & { json?: () => Promise<any> }) {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        ...response,
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

// A captive portal / proxy can answer 200 with an HTML page: response.json()
// rejects, readJson falls back to {}, and payload.session is undefined.
describe('glossary session responses without a session payload (sweep 10)', () => {
    it('startGlossarySession throws GlossaryApiError instead of returning undefined', async () => {
        stubFetch({ json: () => Promise.reject(new SyntaxError('not json')) });
        await expect(startGlossarySession('all', false)).rejects.toBeInstanceOf(GlossaryApiError);
    });

    it('reopenGlossarySession throws when session is a non-object', async () => {
        stubFetch({ json: () => Promise.resolve({ session: 'ended' }) });
        await expect(reopenGlossarySession('ABCD')).rejects.toBeInstanceOf(GlossaryApiError);
    });

    it('fetchGlossarySession returns null for a non-object session instead of spreading it', async () => {
        stubFetch({ json: () => Promise.resolve({ session: 'live' }) });
        await expect(fetchGlossarySession('ABCD')).resolves.toBeNull();
    });
});

describe('uploadPdf token response validation (sweep 10)', () => {
    it('throws instead of PUTting to /undefined when the token body is malformed', async () => {
        const fetchMock = stubFetch({ json: () => Promise.resolve({}) });
        const file = new File(['%PDF-'], 'deck.pdf', { type: 'application/pdf' });
        await expect(uploadPdf(file)).rejects.toThrow('Upload URL response was invalid');
        // Only the token request fired — no second PUT to a bogus URL.
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
