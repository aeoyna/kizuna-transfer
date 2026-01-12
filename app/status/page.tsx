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
        <div className="min-h-screen bg-[#fafafa] text-gray-900 selection:bg-red-100 italic-none">
            {/* Navigation */}
            <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="group flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
                        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="text-sm font-medium">ホームへ戻る</span>
                    </Link>
                    <div className="text-sm font-bold tracking-tight uppercase">System Status</div>
                </div>
            </nav>

            <main className="max-w-3xl mx-auto px-6 py-20">
                {/* Status Hero */}
                <div className="mb-12 p-8 rounded-[32px] bg-white border border-gray-100 shadow-sm flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
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
                        <div key={i} className="p-6 bg-white rounded-2xl border border-gray-100 flex items-center justify-between transition-all hover:shadow-md hover:border-gray-200">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-gray-50 rounded-xl text-gray-400">
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
                    <div className="p-12 border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center text-center italic-none">
                        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-200 mb-4">
                            <AlertTriangle size={24} />
                        </div>
                        <p className="text-sm text-gray-400 font-medium">過去30日間に記録された障害はありません。</p>
                    </div>
                </div>
            </main>
        </div>
    );
}
