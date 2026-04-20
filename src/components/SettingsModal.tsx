import { useState } from 'react';
import { Settings, X, Cpu, CheckCircle2, ShieldAlert, Loader2, Wallet } from 'lucide-react';
import { Card } from './ui';
import { cn, setSetting } from '../utils';

interface VerificationResult {
    success: boolean;
    models?: any[];
    recommended?: string;
    message?: string;
}

interface Props {
    initialKey: string;
    initialShowFunds: boolean;
    t: any;
    onClose: () => void;
    onSave: (key: string) => void;
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

    const toggleShowFunds = () => {
        const newVal = !showFunds;
        setShowFunds(newVal);
        setSetting('showFunds', newVal);
        onShowFundsChange(newVal);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <Card className="w-full max-w-md p-6 border-zinc-700 bg-zinc-900 shadow-2xl scale-in-center overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold flex items-center">
                        <Settings className="w-5 h-5 mr-3 text-blue-400" />
                        {t.settings}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-zinc-800 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="space-y-6">
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

                        <div className="flex items-center justify-between pt-4 pb-2 border-b border-zinc-800/50">
                            <label className="text-sm font-medium text-zinc-300 flex items-center">
                                <Wallet className="w-4 h-4 mr-2 text-indigo-400" />
                                {t.showFunds}
                            </label>
                            <button
                                onClick={toggleShowFunds}
                                className={cn(
                                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-900",
                                    showFunds ? "bg-blue-600" : "bg-zinc-700"
                                )}
                            >
                                <span
                                    className={cn(
                                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                        showFunds ? "translate-x-6" : "translate-x-1"
                                    )}
                                />
                            </button>
                        </div>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                            {t.apiKeyNote}
                        </p>
                    </div>
                    <div className="flex gap-3 pt-2">
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
                    </div>
                </div>
            </Card>
        </div>
    );
}
