"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, Locale } from './locales';

interface LanguageContextType {
    language: Locale;
    setLanguage: (lang: Locale) => void;
    t: (key: keyof typeof translations['en']) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguage] = useState<Locale>('en');

    useEffect(() => {
        // Detect browser language
        const browserLang = navigator.language.split('-')[0] as Locale;
        if (['en', 'ja', 'zh', 'ko'].includes(browserLang)) {
            setLanguage(browserLang);
        }

        // Check localStorage
        const savedLang = localStorage.getItem('app-language') as Locale;
        if (savedLang && ['en', 'ja', 'zh', 'ko'].includes(savedLang)) {
            setLanguage(savedLang);
        }
    }, []);

    const handleSetLanguage = (lang: Locale) => {
        setLanguage(lang);
        localStorage.setItem('app-language', lang);
    };

    const t = (key: keyof typeof translations['en']) => {
        return (translations[language] as any)[key] || translations['en'][key] || key;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
