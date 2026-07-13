import crypto from 'crypto';
import type { JargonTerm } from '../src/jargon.js';
import {
    JARGON_GLOSSARY,
    buildGlossaryLookup,
    lookupExplanation,
    normalizeTerm,
} from './jargonGlossary.js';

export interface GlossaryTermSnapshot {
    id: string;
    term: string;
    explanation: { en?: string; 'zh-TW'?: string };
    firstPage: number;
    unlockedAt: number;
}

export interface GlossarySession {
    joinCode: string;
    status: 'live' | 'ended';
    mode: 'all' | 'gradual';
    currentPage: number;
    slideVersion: number;
    startedAt: number;
    endedAt: number | null;
    keepAfter: boolean;
    joins: number;
    terms: GlossaryTermSnapshot[];
    updatedAt: number;
}

export type GlossaryLang = 'en' | 'zh-TW';

const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// Must mirror JOIN_CODE_ALPHABET exactly — J-N would admit L, which the
// alphabet deliberately excludes as a look-alike.
const JOIN_CODE_PATTERN = /^[A-HJKMNP-Z2-9]{8}$/;
const MAX_TERMS = 200;
const MAX_TERM_LENGTH = 80;
const MAX_EXPLANATION_LENGTH = 240;
const GLOSSARY_LOOKUP = buildGlossaryLookup(JARGON_GLOSSARY);

function truncate(value: string, max: number): string {
    return value.trim().slice(0, max);
}

export function generateJoinCode(): string {
    const bytes = crypto.randomBytes(8);
    let code = '';
    for (const byte of bytes) {
        code += JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length];
    }
    return code;
}

export function isValidJoinCode(v: unknown): v is string {
    return typeof v === 'string' && JOIN_CODE_PATTERN.test(v);
}

export function normalizeJoinCode(input: unknown): string | null {
    if (typeof input !== 'string') return null;
    const code = input.trim().toUpperCase();
    return isValidJoinCode(code) ? code : null;
}

export function mergeTerms(
    existing: GlossaryTermSnapshot[],
    incoming: JargonTerm[],
    lang: GlossaryLang,
    page: number,
    now: number,
): { terms: GlossaryTermSnapshot[]; termLimitReached: boolean } {
    const terms = existing.map(item => ({
        ...item,
        explanation: { ...item.explanation },
    }));
    const byId = new Map(terms.map(item => [item.id, item]));
    let termLimitReached = false;

    for (const item of incoming) {
        const term = truncate(item.term, MAX_TERM_LENGTH);
        const rawExplanation = truncate(item.explanation, MAX_EXPLANATION_LENGTH);
        const id = normalizeTerm(term);
        if (!id || !rawExplanation) continue;

        const vettedEn = lookupExplanation(term, 'en', GLOSSARY_LOOKUP);
        const vettedZh = lookupExplanation(term, 'zh-TW', GLOSSARY_LOOKUP);
        const explanation: { en?: string; 'zh-TW'?: string } = {};
        if (vettedEn) explanation.en = vettedEn.slice(0, MAX_EXPLANATION_LENGTH);
        if (vettedZh) explanation['zh-TW'] = vettedZh.slice(0, MAX_EXPLANATION_LENGTH);
        if (!explanation[lang]) explanation[lang] = rawExplanation;

        const existingTerm = byId.get(id);
        if (existingTerm) {
            if (explanation.en && !existingTerm.explanation.en) {
                existingTerm.explanation.en = explanation.en;
            }
            if (explanation['zh-TW'] && !existingTerm.explanation['zh-TW']) {
                existingTerm.explanation['zh-TW'] = explanation['zh-TW'];
            }
            continue;
        }

        if (terms.length >= MAX_TERMS) {
            termLimitReached = true;
            continue;
        }

        const snapshot: GlossaryTermSnapshot = {
            id,
            term,
            explanation,
            firstPage: page,
            unlockedAt: now,
        };
        terms.push(snapshot);
        byId.set(id, snapshot);
    }

    return { terms, termLimitReached };
}

export function visibleTerms(session: GlossarySession): GlossaryTermSnapshot[] {
    if (session.status === 'ended' || session.mode === 'all') return session.terms;
    return session.terms.filter(term => term.unlockedAt > 0);
}

export function publicSessionView(session: GlossarySession) {
    return {
        status: session.status,
        mode: session.mode,
        currentPage: session.currentPage,
        termCount: visibleTerms(session).length,
        joins: session.joins,
        updatedAt: session.updatedAt,
        terms: visibleTerms(session),
    };
}
