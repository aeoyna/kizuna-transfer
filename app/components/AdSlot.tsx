import React from 'react';
import { Megaphone, ExternalLink } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface AdSlotProps {
    variant?: 'sidebar' | 'banner';
    className?: string;
}

export default function AdSlot({ variant = 'banner', className = '' }: AdSlotProps) {
    const { t } = useLanguage();

    if (variant === 'sidebar') {
        return (
            <div className={`w-full bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center text-center space-y-3 ${className}`}>
                <div className="bg-white p-3 rounded-full shadow-sm">
                    <Megaphone className="text-gray-400" size={20} />
                </div>
                <div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{t('sponsored')}</div>
                    <p className="text-sm text-gray-500 font-medium">{t('yourAdHere')}</p>
                </div>
                <button className="text-xs text-[#d40000] font-bold hover:underline flex items-center gap-1">
                    {t('contactUs')} <ExternalLink size={10} />
                </button>
            </div>
        );
    }

    return (
        <div className={`w-full bg-gradient-to-r from-gray-50 to-white border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4 shadow-sm ${className}`}>
            <div className="flex items-center gap-4">
                <div className="bg-[#d40000]/10 p-3 rounded-lg">
                    <Megaphone className="text-[#d40000]" size={24} />
                </div>
                <div>
                    <div className="text-[10px] font-bold text-[#d40000] uppercase tracking-wider mb-0.5">{t('advertisement')}</div>
                    <p className="font-bold text-gray-900 text-sm">{t('supportDev')}</p>
                    <p className="text-xs text-gray-500">{t('adDesc')}</p>
                </div>
            </div>
            <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap">
                {t('learnMore')}
            </button>
        </div>
    );
}
