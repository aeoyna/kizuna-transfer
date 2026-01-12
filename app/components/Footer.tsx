'use client';

import React from 'react';
import { Github, Twitter } from 'lucide-react';

export default function Footer() {
    return (
        <footer className="w-full bg-[#fafafa] pt-16 pb-8 border-t border-gray-100">
            <div className="max-w-4xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12">
                {/* Brand Column */}
                <div className="space-y-4 md:col-span-2">
                    <h3 className="text-xl font-bold text-gray-900">Kizuna</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">
                        シンプルで高速なP2Pファイル転送ツール。<br />
                        Made with <span className="text-red-500">❤️</span> by Open Source Community.
                    </p>
                    <div className="flex gap-4 pt-2">
                        <a href="https://github.com/aeoyna/kizuna-transfer" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-900 transition-colors">
                            <Github size={20} />
                        </a>
                        <a href="https://twitter.com/aeoyna" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#1DA1F2] transition-colors">
                            <Twitter size={20} />
                        </a>
                    </div>
                    <p className="text-xs text-gray-400 pt-8">
                        © 2026 Kizuna Project<br />
                        Graphics: <a href="https://twemoji.twitter.com/" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors underline decoration-dotted">Twemoji</a> (Copyright 2020 Twitter, Inc and other contributors, licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors underline decoration-dotted">CC-BY 4.0</a>)
                    </p>
                </div>

                {/* Kizuna Links */}
                <div className="space-y-4">
                    <h4 className="font-bold text-gray-900 text-sm">Kizuna</h4>
                    <ul className="space-y-3 text-sm text-gray-600">
                        <li><a href="/" className="hover:text-gray-900 transition-colors">ホーム</a></li>
                        <li><a href="/about" className="hover:text-gray-900 transition-colors">創作秘話</a></li>
                    </ul>
                </div>

                {/* Support Links */}
                <div className="space-y-4">
                    <h4 className="font-bold text-gray-900 text-sm">Support</h4>
                    <ul className="space-y-3 text-sm text-gray-600">
                        <li><a href="/faq" className="hover:text-gray-900 transition-colors">FAQ</a></li>
                        <li><a href="/contact" className="hover:text-gray-900 transition-colors">お問い合わせ</a></li>
                        <li><a href="/security" className="hover:text-gray-900 transition-colors">セキュリティ</a></li>
                        <li><a href="/terms" className="hover:text-gray-900 transition-colors">利用規約</a></li>
                        <li><a href="/status" className="hover:text-gray-900 transition-colors">障害情報</a></li>
                    </ul>
                </div>
            </div>
        </footer>
    );
}
