'use client';

import React from 'react';
import { ArrowLeft, ShieldCheck, Lock, Globe, Server, UserCheck, Zap } from 'lucide-react';
import Link from 'next/link';

export default function SecurityPage() {
    return (
        <div className="min-h-screen bg-white text-gray-900 selection:bg-blue-100 italic-none">
            {/* Navigation */}
            <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="group flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
                        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="text-sm font-medium">ホームへ戻る</span>
                    </Link>
                    <div className="text-sm font-bold tracking-tight uppercase">Security Info</div>
                </div>
            </nav>

            <main className="max-w-4xl mx-auto px-6 py-20">
                <header className="mb-20 text-center">
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                        <ShieldCheck className="text-blue-500" size={32} />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-6">安全への取り組み</h1>
                    <p className="text-xl text-gray-500 font-medium max-w-2xl mx-auto leading-relaxed">
                        Kizuna Transfer は、あなたのプライバシーを第一に考えます。<br />
                        最新のP2P技術とE2E暗号化により、究極の安全を提供します。
                    </p>
                </header>

                {/* Core Security Pillars */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-24">
                    <div className="p-10 rounded-[40px] bg-gray-50 border border-gray-100 italic-none">
                        <Lock className="text-blue-500 mb-6" size={32} />
                        <h2 className="text-2xl font-bold mb-4">E2E 暗号化</h2>
                        <p className="text-gray-600 leading-relaxed font-medium">
                            「エンドツーエンド暗号化」を採用。送信者のブラウザで暗号化されたデータは、受信者のブラウザでしか復号できません。途中のインターネット経路で誰かに中身を盗み見られるリスクはありません。
                        </p>
                    </div>
                    <div className="p-10 rounded-[40px] bg-blue-600 text-white italic-none shadow-xl shadow-blue-200">
                        <Globe className="text-blue-200 mb-6" size={32} />
                        <h2 className="text-2xl font-bold mb-4 text-white">P2P 直接転送</h2>
                        <p className="text-blue-100 leading-relaxed font-medium">
                            ファイルは私たちのサーバーにアップロードされません。デバイス間で直接データをやり取りするため、サーバーへの不正アクセスによる情報流出の心配は物理的にゼロです。
                        </p>
                    </div>
                </div>

                {/* Detailed Comparison Table */}
                <section className="mb-24 italic-none">
                    <h2 className="text-2xl font-bold mb-8 text-center">既存のサービスとの違い</h2>
                    <div className="overflow-hidden rounded-3xl border border-gray-100 shadow-sm">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="p-6 text-sm font-bold text-gray-400 uppercase tracking-widest">特徴</th>
                                    <th className="p-6 text-sm font-bold text-gray-900 italic-none">他社転送サービス</th>
                                    <th className="p-6 text-sm font-bold text-blue-600 italic-none">Kizuna Transfer</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                <tr>
                                    <td className="p-6 font-bold text-sm">転送経路</td>
                                    <td className="p-6 text-gray-500 text-sm italic-none">サーバーを経由して保管</td>
                                    <td className="p-6 text-gray-900 font-bold text-sm italic-none">デバイス間を直通 (P2P)</td>
                                </tr>
                                <tr>
                                    <td className="p-6 font-bold text-sm">暗号鍵の管理</td>
                                    <td className="p-6 text-gray-500 text-sm italic-none">運営会社が管理する場合あり</td>
                                    <td className="p-6 text-gray-900 font-bold text-sm italic-none">ユーザーのみが保持 (E2E)</td>
                                </tr>
                                <tr>
                                    <td className="p-6 font-bold text-sm">サーバー流出</td>
                                    <td className="p-6 text-gray-500 text-sm italic-none">リスクあり</td>
                                    <td className="p-6 text-blue-600 font-black text-sm italic-none">物理的に発生しない</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Additional Protections */}
                <section className="space-y-6 italic-none">
                    <h2 className="text-2xl font-bold mb-6">さらなる保護機能</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="flex gap-4 p-6 rounded-2xl border border-gray-100">
                            <Zap className="text-orange-500 flex-shrink-0" size={24} />
                            <div>
                                <h3 className="font-bold text-sm mb-1">パスワード設定</h3>
                                <p className="text-xs text-gray-500 leading-relaxed italic-none">受信時に合言葉を要求し、誤送信や不正アクセスを防ぎます。</p>
                            </div>
                        </div>
                        <div className="flex gap-4 p-6 rounded-2xl border border-gray-100">
                            <Server className="text-purple-500 flex-shrink-0" size={24} />
                            <div>
                                <h3 className="font-bold text-sm mb-1">部屋のロック</h3>
                                <p className="text-xs text-gray-500 leading-relaxed italic-none">接続確立後、新しい第三者の参加を完全に遮断します。</p>
                            </div>
                        </div>
                        <div className="flex gap-4 p-6 rounded-2xl border border-gray-100">
                            <UserCheck className="text-green-500 flex-shrink-0" size={24} />
                            <div>
                                <h3 className="font-bold text-sm mb-1">匿名利用</h3>
                                <p className="text-xs text-gray-500 leading-relaxed italic-none">メールアドレスなどの個人情報の登録は一切不要です。</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Call to action */}
                <div className="mt-32 p-12 rounded-[48px] bg-gray-900 text-white text-center overflow-hidden relative">
                    <div className="relative z-10 italic-none">
                        <h2 className="text-3xl font-black mb-6">安心を、その手に。</h2>
                        <Link href="/" className="inline-flex h-14 items-center justify-center px-10 rounded-full bg-white text-gray-900 font-bold hover:scale-105 transition-transform">
                            ファイルを送ってみる
                        </Link>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/30 to-transparent blur-3xl" />
                </div>
            </main>
        </div>
    );
}
