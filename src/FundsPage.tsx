import React, { useState, useEffect } from 'react';
import { Wallet, LayoutDashboard, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MarketStatCard } from './Dashboard';

export default function FundsPage() {
    const [marketData, setMarketData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [language, setLanguage] = useState<'en' | 'zh-TW'>(() => {
        const saved = localStorage.getItem('marketflow_lang');
        return (saved === 'en' || saved === 'zh-TW') ? saved : 'zh-TW';
    });

    useEffect(() => {
        const fetchFunds = async () => {
            try {
                const response = await fetch('/api/market-data?range=YTD');
                const result = await response.json();
                if (result.success) {
                    // 只過濾類別為 'Fund' 的資料
                    setMarketData(result.data.filter((item: any) => item.category === 'Fund'));
                }
            } catch (err) {
                console.error('Failed to fetch funds:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchFunds();
    }, []);

    const t = {
        title: language === 'en' ? 'Wealth Management' : '財富管理基金',
        subtitle: language === 'en' ? 'Track Global Technology Leaders' : '追蹤全球科技領先基金動向',
        back: language === 'en' ? 'Back to Market' : '回到市場大盤',
        ytd: language === 'en' ? 'YTD Change' : '年初至今',
        loading: language === 'en' ? 'Loading funds...' : '正在讀取基金數據...'
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 lg:p-8 font-sans">
            <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 border-b border-zinc-800 pb-8">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
                            <Wallet className="text-white w-6 h-6" />
                        </div>
                        <span className="bg-gradient-to-br from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                            {t.title}
                        </span>
                    </h1>
                    <p className="text-sm text-zinc-500 mt-2 font-medium">{t.subtitle}</p>
                </div>

                <Link
                    to="/"
                    className="group flex items-center gap-2.5 text-sm bg-zinc-900/50 backdrop-blur-md px-5 py-2.5 rounded-xl border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80 transition-all shadow-xl"
                >
                    <LayoutDashboard size={18} className="text-blue-400 group-hover:scale-110 transition-transform" />
                    <span className="font-bold">{t.back}</span>
                </Link>
            </header>

            <main className="max-w-7xl mx-auto">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-zinc-600">
                        <Loader2 className="w-10 h-10 animate-spin mb-4 opacity-50" />
                        <p className="font-medium animate-pulse">{t.loading}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {marketData.map((fund) => (
                            <div key={fund.symbol} className="relative group">
                                {/* 顯示基金英文名 Badge */}
                                {fund.nameEn && (
                                    <div className="absolute -top-3 left-6 bg-blue-600 text-[10px] px-3 py-1 rounded-full z-10 font-black uppercase tracking-[0.1em] shadow-lg shadow-blue-900/40 border border-blue-400/30">
                                        {fund.nameEn}
                                    </div>
                                )}
                                <div className="transition-transform duration-500 group-hover:-translate-y-1">
                                    <MarketStatCard
                                        item={fund}
                                        chartHeight="h-40"
                                        t={{ ytd: t.ytd, range: "Day Range" }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
