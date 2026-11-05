export type PresentLang = 'en' | 'zh-TW';

export type PresentView = 'slide' | 'index' | 'heatmap';
export type PageDirection = 'next' | 'prev';
export type PresentRange = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y';
export type PresentIndexDensity = 'compact' | 'comfortable' | 'auto';
export type PresentFullscreenMode = 'enter' | 'exit';

export const PRESENT_RANGES = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y'] as const;

export interface CatalogItem {
    symbol: string;
    name: string;
    nameEn?: string;
    group: 'market' | 'macro';
}

export interface PresentCommand {
    v: 1;
    id: string;
    kind: string;
    symbols: string[];
    view?: PresentView;
    direction?: PageDirection;
    range?: PresentRange;
    issuedAt: number;
    [key: string]: unknown;
}

export interface ProjectorState {
    mode: string;
    page: number;
    v: number;
    at: number;
    lid?: string;
}

export interface ProjectorLastState extends ProjectorState {
    stale: boolean;
    ageMs: number;
}

export interface PresentAppliedState {
    id: string;
    kind: string;
    at: number;
}

export interface PresentStatusPayload {
    success: boolean;
    command: PresentCommand | null;
    serverTime: number;
    projector: ProjectorState | null;
    projectorLast: ProjectorLastState | null;
    applied: PresentAppliedState | null;
}

export interface AckWaitResult {
    acknowledged: boolean;
    attempts: number;
    status: PresentStatusPayload;
}

export class PresentApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'PresentApiError';
        this.status = status;
    }
}
