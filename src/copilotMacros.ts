import type { CatalogItem } from '../lib/presentCommand';
import { parseCommandDeterministic } from '../lib/presentCommand';
import { buildGlossaryLookup, JARGON_GLOSSARY, lookupExplanation } from '../lib/jargonGlossary';

export interface Macro {
    name: string;
    steps: string[];
}

export const BUILTIN_MACROS: Macro[] = [
    { name: 'opening', steps: ['page first', 'cycle off', 'jargon on'] },
    { name: 'q&a', steps: ['heatmap', 'cycle off'] },
];

const MAX_MACROS = 12;
const MAX_STEPS = 8;
const MAX_NAME_CODE_POINTS = 24;
const MAX_STEP_CODE_POINTS = 200;
// Chinese prefixes take \s* (no space between prefix and term in normal Chinese);
// English prefixes need \s+ so words like "explainer" stay valid names.
const MACRO_NAME_PREFIX = /^(?:(?:explain|define|what\s+is|what's|whats|highlight|focus|spotlight)\s+|(?:解釋|解释|咩係|乜係|什麼是|甚麼是|点解是|聚焦|標示|重點)\s*)\S.*/i;

function codePointLength(value: string): number {
    return [...value].length;
}

export function normalizeMacro(value: unknown): Macro | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    if (typeof raw.name !== 'string' || !Array.isArray(raw.steps)) return null;
    const name = raw.name.trim();
    if (codePointLength(name) < 1 || codePointLength(name) > MAX_NAME_CODE_POINTS) return null;
    const steps = raw.steps
        .map(step => typeof step === 'string' ? step.trim() : '')
        .filter(step => codePointLength(step) >= 1 && codePointLength(step) <= MAX_STEP_CODE_POINTS);
    if (steps.length < 1 || steps.length > MAX_STEPS || steps.length !== raw.steps.length) return null;
    return { name, steps };
}

export function normalizeMacros(value: unknown): Macro[] {
    if (!Array.isArray(value)) return [];
    const macros: Macro[] = [];
    for (const item of value) {
        const macro = normalizeMacro(item);
        if (macro) macros.push(macro);
        if (macros.length >= MAX_MACROS) break;
    }
    return macros;
}

export function resolveMacros(custom: Macro[]): Macro[] {
    const normalizedCustom = normalizeMacros(custom);
    const customNames = new Set(normalizedCustom.map(macro => macro.name.toLowerCase()));
    return [
        ...normalizedCustom,
        ...BUILTIN_MACROS.filter(macro => !customNames.has(macro.name.toLowerCase())),
    ];
}

export function findMacro(input: string, macros: Macro[]): Macro | null {
    const name = input.trim().toLowerCase();
    if (!name) return null;
    return macros.find(macro => macro.name.toLowerCase() === name) ?? null;
}

export function validateMacroDraft(
    nameInput: string,
    stepsInput: string[],
    options: {
        catalog: CatalogItem[];
        quickLabels: string[];
        existingMacros: Macro[];
        editingName?: string;
    },
): { ok: true; macro: Macro } | { ok: false; message: string } {
    const name = nameInput.trim();
    if (codePointLength(name) < 1) return { ok: false, message: 'Name is required' };
    if (codePointLength(name) > MAX_NAME_CODE_POINTS) return { ok: false, message: 'Name must be 24 characters or fewer' };

    const steps = stepsInput.map(step => step.trim()).filter(Boolean);
    if (steps.length < 1) return { ok: false, message: 'Add at least one step' };
    if (steps.length > MAX_STEPS) return { ok: false, message: 'Use 8 steps or fewer' };
    if (steps.some(step => codePointLength(step) > MAX_STEP_CODE_POINTS)) return { ok: false, message: 'Each step must be 200 characters or fewer' };

    if (options.quickLabels.some(label => label.trim().toLowerCase() === name.toLowerCase())) {
        return { ok: false, message: 'Name duplicates a quick command' };
    }
    const editing = options.editingName?.trim().toLowerCase();
    if (options.existingMacros.some(macro => macro.name.toLowerCase() === name.toLowerCase() && macro.name.toLowerCase() !== editing)) {
        return { ok: false, message: 'Name duplicates another macro' };
    }
    if (MACRO_NAME_PREFIX.test(name)) {
        return { ok: false, message: 'Name is reserved by a command prefix' };
    }
    if (parseCommandDeterministic(name, options.catalog) !== null) {
        return { ok: false, message: 'Name shadows a command' };
    }
    const glossaryLookup = buildGlossaryLookup(JARGON_GLOSSARY);
    if (lookupExplanation(name, 'en', glossaryLookup) || lookupExplanation(name, 'zh-TW', glossaryLookup)) {
        return { ok: false, message: 'Name shadows a glossary term' };
    }

    return { ok: true, macro: { name, steps } };
}

export function validateMacroName(
    nameInput: string,
    existingMacros: Macro[],
    catalog: CatalogItem[],
    quickLabels: string[],
): { ok: true; name: string } | { ok: false; message: string } {
    const validation = validateMacroDraft(nameInput, ['placeholder'], {
        catalog,
        quickLabels,
        existingMacros,
    });
    return 'macro' in validation ? { ok: true, name: validation.macro.name } : validation;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    return new Promise(resolve => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
}

export async function runMacro(
    macro: Macro,
    sendStep: (text: string) => Promise<{ id: string } | null>,
    onProgress: (stepIndex: number, total: number, failed: boolean) => void,
    signal: AbortSignal,
): Promise<{ completed: number; failed: number }> {
    let completed = 0;
    let failed = 0;
    const total = macro.steps.length;
    if (signal.aborted || total === 0) return { completed, failed };

    for (let i = 0; i < total; i += 1) {
        if (signal.aborted) return { completed, failed };
        let stepFailed = false;
        try {
            const result = await sendStep(macro.steps[i]);
            if (result) completed += 1;
            else {
                failed += 1;
                stepFailed = true;
            }
        } catch {
            failed += 1;
            stepFailed = true;
        }
        onProgress(i + 1, total, stepFailed);
        if (i < total - 1) await delay(900, signal);
    }

    return { completed, failed };
}
