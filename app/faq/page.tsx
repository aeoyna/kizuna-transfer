'use client';

import React from 'react';
import { ArrowLeft, HelpCircle, ChevronDown } from 'lucide-react';
import Link from 'next/link';

export default function FAQPage() {
    const faqs = [
        {
            q: "ファイルサイズに制限はありますか？",
            a: "いいえ、ありません。P2P技術を用いてデバイス間で直接送信するため、数GB以上の大容量ファイルも制限なしで送受信可能です。ただし、転送中は送信側と受信側の両方でブラウザを開いておく必要があります。"
        },
        {
            q: "セキュリティは大丈夫ですか？",
            a: "はい。ファイルはサーバーを一切経由せず、送信者のPCから受信者のPCへ直接暗号化されて送られます。また、パスワード保護機能を使用することで、より安全に転送を行うことができます。"
        },
        {
            q: "転送中にタブを閉じるとどうなりますか？",
            a: "転送が中断されます。P2P方式のため、どちらかのデバイスがオフラインになると通信が途切れます。ただし、中断された場合も同じファイルを選択してやり直すことで、途中から再開（レジューム）することが可能です。"
        },
        {
            q: "対応しているブラウザは何ですか？",
            a: "Google Chrome, Microsoft Edge, Safari, Firefox などの最新バージョンのブラウザに対応しています。プライベートモードやシークレットウィンドウでは、一部の機能（ファイル保存など）が制限される場合があります。"
        },
        {
            q: "料金はかかりますか？",
            a: "完全無料です。会員登録も不要で、誰でも今すぐ利用いただけます。"
        },
        {
            q: "スマートフォンでも使えますか？",
            a: "はい、可能です。QRコード読み取り機能を使用すれば、PCからスマホ、あるいはスマホ同士でも簡単にファイルを共有できます。"
        }
    ];

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 selection:bg-red-100">
            {/* Navigation */}
            <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="group flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
                        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="text-sm font-medium">ホームへ戻る</span>
                    </Link>
                    <div className="text-sm font-bold tracking-tight">FAQ</div>
                </div>
            </nav>

            <main className="max-w-3xl mx-auto px-6 py-20">
                <header className="mb-16">
                    <div className="w-12 h-12 bg-white shadow-sm rounded-xl flex items-center justify-center text-blue-500 mb-6">
                        <HelpCircle size={24} />
                    </div>
                    <h1 className="text-4xl font-black tracking-tight mb-4">よくある質問</h1>
                    <p className="text-gray-500 font-medium">Kizuna Transfer の使い方や技術的な疑問にお答えします。</p>
                </header>

                <div className="space-y-4">
                    {faqs.map((faq, i) => (
                        <details key={i} className="group bg-white rounded-2xl border border-gray-100 overflow-hidden transition-all hover:border-gray-200">
                            <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                                <h3 className="font-bold pr-4 leading-tight">{faq.q}</h3>
                                <ChevronDown className="text-gray-300 group-open:rotate-180 transition-transform flex-shrink-0" size={20} />
                            </summary>
                            <div className="px-6 pb-6 pt-0">
                                <div className="h-px bg-gray-50 mb-6" />
                                <p className="text-gray-600 leading-relaxed">
                                    {faq.a}
                                </p>
                            </div>
                        </details>
                    ))}
                </div>

                <div className="mt-20 p-8 bg-blue-50 rounded-3xl border border-blue-100 flex flex-col md:flex-row items-center gap-6">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-500 shadow-sm flex-shrink-0">
                        <HelpCircle size={24} />
                    </div>
                    <div>
                        <h4 className="font-bold mb-1">解決しない場合は？</h4>
                        <p className="text-sm text-blue-600 leading-relaxed">
                            その他の質問がある場合は、お問い合わせページからお気軽にご連絡ください。開発チームが順次対応いたします。
                        </p>
                    </div>
                    <Link href="/contact" className="md:ml-auto h-11 px-6 bg-white border border-blue-200 rounded-full text-blue-600 text-sm font-bold flex items-center justify-center whitespace-nowrap hover:bg-blue-600 hover:text-white transition-colors">
                        お問い合わせへ
                    </Link>
                </div>
            </main>
        </div>
    );
}
