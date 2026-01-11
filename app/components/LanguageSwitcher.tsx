import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { Locale } from '../i18n/locales';
import { Twemoji } from './Twemoji';

export default function LanguageSwitcher() {
    const { language, setLanguage } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);

    const languages: { code: Locale; label: string; flag: React.ReactNode }[] = [
        { code: 'en', label: 'English', flag: <Twemoji emoji="🇺🇸" className="w-6 h-6 drop-shadow-sm" /> },
        { code: 'ja', label: '日本語', flag: <Twemoji emoji="🇯🇵" className="w-6 h-6 drop-shadow-sm" /> },
        { code: 'zh', label: '中文', flag: <Twemoji emoji="🇨🇳" className="w-6 h-6 drop-shadow-sm" /> },
        { code: 'ko', label: '한국어', flag: <Twemoji emoji="🇰🇷" className="w-6 h-6 drop-shadow-sm" /> },
        { code: 'ain', label: 'アイヌ語', flag: <img src="/images/ainu_flag.png" alt="Ainu" className="w-6 h-4 object-cover rounded-[2px] shadow-sm" /> },
    ];

    return (
        <div className="relative z-30">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 text-gray-400 hover:text-gray-900 transition-colors p-2 rounded-lg hover:bg-black/5"
            >
                <Globe size={20} />
                <span className="text-sm font-bold uppercase">{language}</span>
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-30">
                        {languages.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => {
                                    setLanguage(lang.code);
                                    setIsOpen(false);
                                }}
                                className={`w-full px-4 py-3 text-left text-sm font-medium flex items-center gap-3 hover:bg-gray-50 transition-colors ${language === lang.code ? 'text-[#d40000] bg-red-50' : 'text-gray-700'}`}
                            >
                                <div className="flex items-center justify-center w-8">{lang.flag}</div>
                                {lang.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
