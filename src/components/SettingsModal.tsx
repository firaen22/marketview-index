import { useState } from 'react';
import { Settings, Cpu, CheckCircle2, ShieldAlert, Loader2, Wallet } from 'lucide-react';
import { Modal } from './Modal';
import { Toggle } from './Toggle';
import { cn } from '../utils';
import { setSetting } from '../settings';
import type { TDict } from '../locales';

interface VerificationResult {
    success: boolean;
    models?: any[];
    recommended?: string;
    message?: string;
}

interface Props {
    initialKey: string;
    initialShowFunds: boolean;
    t: TDict;
    onClose: () => void;
    onSave: (geminiKey: string) => void;
    onShowFundsChange: (value: boolean) => void;
}

export function SettingsModal({
    initialKey,
    initialShowFunds,
    t,
    onClose,
    onSave,
    onShowFundsChange,
}: Props) {
    const [geminiKey, setGeminiKey] = useState(initialKey);
    const [isVerifying, setIsVerifying] = useState(false);
    const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
    const [showFunds, setShowFunds] = useState(initialShowFunds);

    const handleVerifyKey = async () => {
        if (!geminiKey) return;
        setIsVerifying(true);
        setVerificationResult(null);
        try {
            const response = await fetch('/api/verify-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: geminiKey })
            });
            const result = await response.json();
            setVerificationResult(result);
        } catch {
            setVerificationResult({ success: false, message: 'Verification failed.' });
        } finally {
            setIsVerifying(false);
        }
    };

    const handleToggleShowFunds = (next: boolean) => {
        setShowFunds(next);
        setSetting('showFunds', next);
        onShowFundsChange(next);
    };

    return (
        <Modal
            title={<><Settings className="w-5 h-5 mr-3 text-blue-400" />{t.settings}</>}
            onClose={onClose}
            maxWidth="max-w-md"
            zIndex={100}
            bodyClassName="space-y-6"
            footer={
                <>
                    <button
                        onClick={() => onSave(geminiKey)}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-blue-900/20"
                    >
                        {t.saveConfig}
                    </button>
                    <button
                        onClick={() => {
                            setGeminiKey('');
                            setVerificationResult(null);
                            onSave('');
                        }}
                        className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-2.5 rounded-lg transition-all"
                    >
                        {t.clear}
                    </button>
                </>
            }
        >
            <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-300 flex items-center">
                    <Cpu className="w-4 h-4 mr-2 text-indigo-400" />
                    {t.apiKey}
                </label>
                <div className="relative">
                    <input
                        type="password"
                        value={geminiKey}
                        onChange={(e) => {
                            setGeminiKey(e.target.value);
                            setVerificationResult(null);
                        }}
                        placeholder={t.apiKeyPlaceholder}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-mono"
                    />
                    <button
                        onClick={handleVerifyKey}
                        disabled={isVerifying || !geminiKey}
                        className="absolute right-2 top-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-semibold rounded-md border border-zinc-700 transition-colors"
                    >
                        {isVerifying ? <Loader2 className="w-3 h-3 animate-spin" /> : t.verify}
                    </button>
                </div>
                {verificationResult && (
                    <div className={cn(
                        "p-3 rounded-lg text-xs flex items-start space-x-3 animate-in slide-in-from-top-2 duration-200",
                        verificationResult.success ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                    )}>
                        {verificationResult.success ? (
                            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                        ) : (
                            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                        )}
                        <div className="space-y-1">
                            <p className="font-bold">{verificationResult.success ? t.verifySuccess : t.verifyFailed}</p>
                            <p className="opacity-80">{verificationResult.message || (verificationResult.success ? `Supports ${verificationResult.models?.length} models. Recommended: ${verificationResult.recommended}` : '')}</p>
                        </div>
                    </div>
                )}

                <div className="pt-4 pb-2 border-b border-zinc-800/50">
                    <Toggle
                        checked={showFunds}
                        onChange={handleToggleShowFunds}
                        ariaLabel={t.showFunds}
                        label={<><Wallet className="w-4 h-4 mr-2 text-indigo-400" />{t.showFunds}</>}
                    />
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                    {t.apiKeyNote}
                </p>
            </div>
        </Modal>
    );
}
