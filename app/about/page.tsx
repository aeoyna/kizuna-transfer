'use client';

import React from 'react';
import { ArrowLeft, Heart, Sparkles, Shield, Zap } from 'lucide-react';
import Link from 'next/link';

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-white text-gray-900 selection:bg-red-100 italic-none">
            {/* Header / Navigation */}
            <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="group flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
                        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="text-sm font-medium">ホームへ戻る</span>
                    </Link>
                    <div className="text-sm font-bold tracking-tight">KIZUNA STORY</div>
                </div>
            </nav>

            <main className="max-w-3xl mx-auto px-6 py-20">
                {/* Hero Section */}
                <header className="mb-20">
                    <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
                        <Heart className="text-red-500 fill-red-500" size={32} />
                    </div>
                    <h1 className="text-5xl font-black tracking-tight mb-6 leading-tight">
                        絆（Kizuna）<br />
                        <span className="text-gray-400">創作秘話</span>
                    </h1>
                    <p className="text-xl text-gray-500 leading-relaxed font-medium">
                        「もっとシンプルに、もっと温かく。」<br />
                        Kizuna Transfer が生まれた理由と、そこに込めた想い。
                    </p>
                </header>

                {/* Content Section */}
                <article className="space-y-16">
                    <section>
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-3 text-gray-900">
                            <Sparkles className="text-yellow-500" size={24} />
                            きっかけは一通のメール
                        </h2>
                        <div className="prose prose-gray max-w-none text-lg leading-relaxed text-gray-600 space-y-4">
                            <p>
                                現代には多くのファイル転送サービスがあります。しかし、その多くは「広告」「会員登録」「速度制限」といった壁に覆われていました。
                            </p>
                            <p>
                                友人や大切な人にファイルを送るというシンプルな行為が、なぜこれほどまでに複雑になってしまったのか。
                            </p>
                            <p>
                                「ポストに手紙を投函するように、誰でも簡単に直感的に使えるツールを作りたい」という想いが、絆プロジェクトの出発点でした。
                            </p>
                        </div>
                    </section>

                    <section className="bg-gray-50 rounded-3xl p-8 md:p-12 border border-gray-100">
                        <h2 className="text-2xl font-bold mb-8 text-gray-900">私たちが大切にする3つのこと</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="space-y-4">
                                <div className="w-10 h-10 bg-white shadow-sm rounded-xl flex items-center justify-center text-blue-500">
                                    <Shield size={20} />
                                </div>
                                <h3 className="font-bold">プライバシー</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">
                                    P2P技術により、ファイルは私たちのサーバーを一切経由しません。あなたと相手だけの秘密です。
                                </p>
                            </div>
                            <div className="space-y-4">
                                <div className="w-10 h-10 bg-white shadow-sm rounded-xl flex items-center justify-center text-orange-500">
                                    <Zap size={20} />
                                </div>
                                <h3 className="font-bold">究極のシンプル</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">
                                    説明書は不要。コードを入力するだけ。子供からお年寄りまで使えるデザインを目指しました。
                                </p>
                            </div>
                            <div className="space-y-4">
                                <div className="w-10 h-10 bg-white shadow-sm rounded-xl flex items-center justify-center text-red-500">
                                    <Heart size={20} />
                                </div>
                                <h3 className="font-bold">人との繋がり</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">
                                    データだけでなく「想い」も届ける。絆を深めるためのデジタル郵便局でありたいと願っています。
                                </p>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold mb-6 text-gray-900">これからの絆</h2>
                        <div className="prose prose-gray max-w-none text-lg leading-relaxed text-gray-600">
                            <p>
                                Kizuna Transfer は、有志のコミュニティによって支えられています。
                                私たちは、このツールをずっと「無料」で、そして「オープン」であり続けることを約束します。
                            </p>
                            <p className="mt-6">
                                この「絆」が、あなたの日常を少しでも便利に、そして温かく彩ることを願っています。
                            </p>
                        </div>
                    </section>
                </article>

                {/* Footer Quote */}
                <footer className="mt-32 pt-12 border-t border-gray-100 text-center">
                    <p className="text-sm font-medium text-gray-400 tracking-widest uppercase mb-4">Made with ❤️ by Kizuna Project</p>
                    <Link href="/" className="inline-flex h-12 items-center justify-center px-8 rounded-full bg-gray-900 text-white font-bold hover:scale-105 transition-transform">
                        今すぐ使ってみる
                    </Link>
                </footer>
            </main>
        </div>
    );
}
