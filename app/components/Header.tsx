'use client';

import React from 'react';
import Link from 'next/link';

export default function Header() {
    return (
        <header className="w-full bg-white/70 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                    <img src="/images/logo.png" alt="Kizuna Logo" className="h-8 w-auto object-contain flex-shrink-0" />
                    <span className="text-xl font-bold text-gray-900 tracking-tight">Kizuna</span>
                </Link>
                <div className="flex items-center gap-4">
                    {/* Additional header items could go here */}
                </div>
            </div>
        </header>
    );
}
