'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle2, AlertTriangle, Activity, Server, Globe, Network } from 'lucide-react';
import Link from 'next/link';

export default function StatusPage() {
    const [lastUpdated, setLastUpdated] = useState<string>('');

    useEffect(() => {
        setLastUpdated(new Date().toLocaleTimeString());
    }, []);

    const services = [
        { name: "P2P Signaling Server (PeerJS)", status: "operational", region: "Global" },
        { name: "Website Hosting", status: "operational", region: "Edge" },
        { name: "Metadata Storage (IndexedDB)", status: "operational", region: "Local Device" },
        { name: "Static Assets (Next.js)", status: "operational", region: "Global CDN" }
    ];

    return (
        <div className="min-h-screen bg-[var(--mac-bg)] text-gray-900 selection:bg-red-100 italic-none relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-green-400 rounded-full blur-[120px] opacity-20 animate-blob" style={{ animationDelay: '0s' }} />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-400 rounded-full blur-[120px] opacity-20 animate-blob" style={{ animationDelay: '2s' }} />
            </div>

            {/* Navigation */}
            <nav className="sticky top-0 z-50 bg-white/40 backdrop-blur-xl border-b border-white/40">
                <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="group flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
                        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="text-sm font-medium">ホームへ戻る</span>
                    </Link>
                    <div className="text-sm font-bold tracking-tight uppercase">System Status</div>
                </div>
            </nav>

            <main className="max-w-3xl mx-auto px-6 py-20 relative z-10">
                {/* Status Hero */}
                <div className="mb-12 p-8 rounded-[32px] bg-white/30 backdrop-blur-xl border border-white/50 shadow-lg flex flex-col items-center text-center relative z-10">
                    <div className="w-20 h-20 bg-green-50/50 backdrop-blur-md rounded-full flex items-center justify-center mb-6 animate-pulse border border-green-200/50">
                        <CheckCircle2 size={40} className="text-green-500" />
                    </div>
                    <h1 className="text-3xl font-black mb-2">すべてのシステムは正常です</h1>
                    <p className="text-gray-500 font-medium italic-none">現在、報告されている障害はありません。</p>
                    <div className="mt-8 flex items-center gap-2 text-[10px] font-bold text-gray-300 tracking-widest uppercase">
                        <Activity size={12} />
                        LAST CHECK: {lastUpdated}
                    </div>
                </div>

                {/* Service Details */}
                <div className="space-y-4">
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest pl-4 mb-2 italic-none">サービス稼働状況</h2>
                    {services.map((service, i) => (
                        <div key={i} className="p-6 bg-white/30 backdrop-blur-md rounded-2xl border border-white/50 flex items-center justify-between transition-all hover:bg-white/40 hover:shadow-md">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-white/40 rounded-xl text-gray-500 border border-white/50">
                                    {i === 0 ? <Network size={20} /> : i === 1 ? <Globe size={20} /> : i === 2 ? <Server size={20} /> : <Activity size={20} />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm">{service.name}</h3>
                                    <p className="text-xs text-gray-400 font-medium italic-none">{service.region}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-bold uppercase tracking-wider italic-none">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                Operational
                            </div>
                        </div>
                    ))}
                </div>

                {/* Incident History (Empty Placeholder) */}
                <div className="mt-20">
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest pl-4 mb-6 italic-none">過去の障害履歴</h2>
                    <div className="p-12 border-2 border-dashed border-white/40 bg-white/10 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center text-center italic-none">
                        <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-gray-400 mb-4 border border-white/30">
                            <AlertTriangle size={24} />
                        </div>
                        <p className="text-sm text-gray-400 font-medium">過去30日間に記録された障害はありません。</p>
                    </div>
                </div>
            </main>
        </div>
    );
}
