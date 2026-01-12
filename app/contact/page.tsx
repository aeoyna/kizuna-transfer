'use client';

import React from 'react';
import { ArrowLeft, Mail, Twitter, Github, MessageCircle } from 'lucide-react';
import Link from 'next/link';

export default function ContactPage() {
    return (
        <div className="min-h-screen bg-white text-gray-900 selection:bg-red-100 italic-none">
            {/* Navigation */}
            <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="group flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
                        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="text-sm font-medium">ホームへ戻る</span>
                    </Link>
                    <div className="text-sm font-bold tracking-tight">CONTACT</div>
                </div>
            </nav>

            <main className="max-w-3xl mx-auto px-6 py-20">
                <header className="mb-20">
                    <h1 className="text-4xl font-black tracking-tight mb-4">お問い合わせ</h1>
                    <p className="text-gray-500 font-medium leading-relaxed">
                        バグ報告、機能リクエスト、スポンサーの相談など、<br />
                        お気軽にご連絡ください。
                    </p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Social Channels */}
                    <a href="https://twitter.com/aeoyna" target="_blank" rel="noopener noreferrer" className="group p-8 rounded-3xl bg-[#1DA1F2]/5 border border-[#1DA1F2]/10 hover:border-[#1DA1F2]/30 transition-all">
                        <Twitter className="text-[#1DA1F2] mb-6" size={32} />
                        <h3 className="font-bold text-lg mb-2">Twitter / X</h3>
                        <p className="text-sm text-gray-500 leading-relaxed mb-6">最新のアップデート情報や、開発者へのメンション・DMはこちらへ。</p>
                        <span className="text-sm font-bold text-[#1DA1F2] group-hover:underline">@aeoyna を見る</span>
                    </a>

                    <a href="https://github.com/aeoyna/kizuna-transfer" target="_blank" rel="noopener noreferrer" className="group p-8 rounded-3xl bg-gray-50 border border-gray-100 hover:border-gray-300 transition-all">
                        <Github className="text-gray-900 mb-6" size={32} />
                        <h3 className="font-bold text-lg mb-2">GitHub Issues</h3>
                        <p className="text-sm text-gray-500 leading-relaxed mb-6">技術的な不具合や、ソースコードに関する提案はこちらで受け付けています。</p>
                        <span className="text-sm font-bold text-gray-900 group-hover:underline">リポジトリを見る</span>
                    </a>

                    <div className="md:col-span-2 group p-8 rounded-3xl bg-red-50 border border-red-100 hover:border-red-200 transition-all">
                        <div className="flex items-start gap-6">
                            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-red-500 shadow-sm flex-shrink-0">
                                <Mail size={28} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg mb-2">Email</h3>
                                <p className="text-sm text-gray-600 leading-relaxed mb-4">ビジネスに関するお問い合わせや、個人的なご相談はこちらのアドレスまでお送りください。</p>
                                <p className="text-lg font-mono font-bold text-red-500">support@kizuna-transfer.com</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-20 p-10 rounded-[32px] bg-gray-900 text-white overflow-hidden relative">
                    <div className="relative z-10">
                        <h2 className="text-2xl font-bold mb-4">We Love Feedback ❤️</h2>
                        <p className="text-gray-400 leading-relaxed mb-8 max-w-md">
                            より使いやすいツールにするために、あなたの意見を必要としています。
                            どんなに些細なことでも構いません。皆様からのメッセージをお待ちしております。
                        </p>
                        <div className="flex gap-4">
                            <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
                                <MessageCircle size={18} />
                            </div>
                            <span className="text-sm font-medium text-gray-300 self-center">プロジェクトへの参加も大歓迎です。</span>
                        </div>
                    </div>
                    {/* Abstract background element */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-red-500/20 to-blue-500/10 blur-[80px] -mr-32 -mt-32" />
                </div>
            </main>
        </div>
    );
}
