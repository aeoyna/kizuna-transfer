'use client';

import React from 'react';
import { ArrowLeft, ShieldCheck, Scale, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-[var(--mac-bg)] text-gray-900 selection:bg-red-100 italic-none relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-400 rounded-full blur-[120px] opacity-20 animate-blob" style={{ animationDelay: '0s' }} />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-pink-400 rounded-full blur-[120px] opacity-20 animate-blob" style={{ animationDelay: '2s' }} />
            </div>

            {/* Navigation */}
            <nav className="sticky top-0 z-50 bg-white/40 backdrop-blur-xl border-b border-white/40">
                <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="group flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
                        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="text-sm font-medium">ホームへ戻る</span>
                    </Link>
                    <div className="text-sm font-bold tracking-tight">TERMS OF SERVICE</div>
                </div>
            </nav>

            <main className="max-w-3xl mx-auto px-6 py-20 relative z-10">
                <header className="mb-20">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold mb-4">
                        <ShieldCheck size={14} />
                        LAST UPDATED: JAN 12, 2026
                    </div>
                    <h1 className="text-4xl font-black tracking-tight mb-4">利用規約</h1>
                    <p className="text-gray-500 font-medium leading-relaxed">
                        Kizuna Transfer をご利用いただく前に、以下の規約を必ずお読みください。<br />
                        本サービスを利用することで、これらの規約に同意したものとみなされます。
                    </p>
                </header>

                <div className="space-y-12">
                    <section>
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <Scale size={20} className="text-gray-400" />
                            1. サービスの概要
                        </h2>
                        <div className="prose prose-gray text-gray-600 leading-relaxed">
                            <p>
                                Kizuna Transfer は、P2P（ピア・ツー・ピア）技術を利用したファイル転送ツールです。
                                ファイルはサーバーを介さず、ユーザーの端末間で直接転送されます。
                                私たちは、ユーザーが送受信するファイルの内容を閲覧、保存、または管理することはありません。
                            </p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <AlertCircle size={20} className="text-red-400" />
                            2. 禁止事項
                        </h2>
                        <div className="prose prose-gray text-gray-600 leading-relaxed space-y-3">
                            <p>以下の行為を禁止します：</p>
                            <ul className="list-disc pl-5 space-y-2 text-sm italic-none">
                                <li>知的財産権（著作権、商標権等）を侵害するファイルの転送</li>
                                <li>児童ポルノ、わいせつ物、または公序良俗に反する情報の送信</li>
                                <li>マルウェア、ウイルス、または悪意のあるコードを含むファイルの配布</li>
                                <li>本サービスの運営を妨害する行為、または不正なアクセス</li>
                                <li>法令に違反するあらゆる行為</li>
                            </ul>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold mb-4">3. 免責事項</h2>
                        <div className="prose prose-gray text-gray-600 leading-relaxed">
                            <p>
                                本サービスは「現状有姿」で提供され、いかなる保証も致しません。
                                本サービスの使用により生じたデータの損失、損害、トラブル、または通信の中断について、
                                開発者および運営チームは一切の責任を負いません。
                                各ユーザーの責任においてご利用ください。
                            </p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold mb-4">4. 規約の変更</h2>
                        <div className="prose prose-gray text-gray-600 leading-relaxed">
                            <p>
                                私たちは、いつでも本規約を変更する権利を留保します。
                                重要な変更がある場合は、サービス上での通知等によりユーザーにお知らせします。
                                変更後も継続して利用される場合は、新しい規約に同意したものとみなされます。
                            </p>
                        </div>
                    </section>

                    <section className="pt-12 border-t border-gray-100">
                        <div className="p-6 bg-white/30 backdrop-blur-xl rounded-2xl flex items-center gap-4 border border-white/50 shadow-sm">
                            <div className="w-10 h-10 bg-white/60 backdrop-blur-md rounded-xl shadow-sm flex items-center justify-center text-blue-500 flex-shrink-0 border border-white/40">
                                <ShieldCheck size={20} />
                            </div>
                            <p className="text-sm text-gray-500 font-medium">
                                ご不明な点がある場合は、<Link href="/contact" className="text-blue-600 hover:underline">お問い合わせページ</Link> よりご連絡ください。
                            </p>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}
