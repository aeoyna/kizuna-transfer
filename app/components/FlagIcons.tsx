import React from 'react';

interface FlagProps {
    className?: string;
}

export const FlagJP: React.FC<FlagProps> = ({ className }) => (
    <svg viewBox="0 0 36 24" className={className} xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="24" fill="#fff" />
        <circle cx="18" cy="12" r="8" fill="#bc002d" />
        <rect width="36" height="24" fill="none" stroke="#eee" strokeWidth="1" />
    </svg>
);

export const FlagUS: React.FC<FlagProps> = ({ className }) => (
    <svg viewBox="0 0 36 24" className={className} xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="24" fill="#fff" />
        {[...Array(7)].map((_, i) => (
            <rect key={i} y={i * 3.7} width="36" height="1.85" fill="#bd3d44" />
        ))}
        <rect width="16" height="13" fill="#192f5d" />
        <g fill="#fff">
            <circle cx="2" cy="2" r="0.6" /> <circle cx="5" cy="2" r="0.6" /> <circle cx="8" cy="2" r="0.6" /> <circle cx="11" cy="2" r="0.6" /> <circle cx="14" cy="2" r="0.6" />
            <circle cx="3.5" cy="4" r="0.6" /> <circle cx="6.5" cy="4" r="0.6" /> <circle cx="9.5" cy="4" r="0.6" /> <circle cx="12.5" cy="4" r="0.6" />
            <circle cx="2" cy="6" r="0.6" /> <circle cx="5" cy="6" r="0.6" /> <circle cx="8" cy="6" r="0.6" /> <circle cx="11" cy="6" r="0.6" /> <circle cx="14" cy="6" r="0.6" />
            <circle cx="3.5" cy="8" r="0.6" /> <circle cx="6.5" cy="8" r="0.6" /> <circle cx="9.5" cy="8" r="0.6" /> <circle cx="12.5" cy="8" r="0.6" />
            <circle cx="2" cy="10" r="0.6" /> <circle cx="5" cy="10" r="0.6" /> <circle cx="8" cy="10" r="0.6" /> <circle cx="11" cy="10" r="0.6" /> <circle cx="14" cy="10" r="0.6" />
        </g>
        <rect width="36" height="24" fill="none" stroke="#eee" strokeWidth="1" />
    </svg>
);

export const FlagCN: React.FC<FlagProps> = ({ className }) => (
    <svg viewBox="0 0 36 24" className={className} xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="24" fill="#de2910" />
        <path fill="#ffde00" d="M5,4 l1.5,4 h4.5 l-3.5,2.5 l1.5,4 l-3.5,-2.5 l-3.5,2.5 l1.5,-4 l-3.5,-2.5 h4.5 z" transform="translate(1 1) scale(0.8)" />
        <circle cx="12" cy="3" r="1" fill="#ffde00" />
        <circle cx="14" cy="5" r="1" fill="#ffde00" />
        <circle cx="14" cy="8" r="1" fill="#ffde00" />
        <circle cx="12" cy="10" r="1" fill="#ffde00" />
        <rect width="36" height="24" fill="none" stroke="#eee" strokeWidth="1" />
    </svg>
);

export const FlagKR: React.FC<FlagProps> = ({ className }) => (
    <svg viewBox="0 0 36 24" className={className} xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="24" fill="#fff" />
        {/* Taegeuk: simplified as rotated colored semicircles */}
        <g transform="translate(18 12) rotate(45)">
            <path d="M-6,0 A6,6 0 0,1 6,0 Z" fill="#c60c30" />
            <path d="M-6,0 A6,6 0 0,0 6,0 Z" fill="#003478" />
            {/* Swirl attempts */}
            <circle cx="-3" cy="0" r="3" fill="#c60c30" />
            <circle cx="3" cy="0" r="3" fill="#003478" />
        </g>
        {/* Trigrams: Placeholders */}
        <g fill="#000">
            <rect x="3" y="2" width="6" height="1" transform="rotate(35 6 2.5)" />
            <rect x="3" y="4" width="6" height="1" transform="rotate(35 6 4.5)" />
            <rect x="3" y="6" width="6" height="1" transform="rotate(35 6 6.5)" />

            <rect x="27" y="17" width="6" height="1" transform="rotate(35 30 17.5)" />
            <rect x="27" y="19" width="6" height="1" transform="rotate(35 30 19.5)" />
            <rect x="27" y="21" width="6" height="1" transform="rotate(35 30 21.5)" />

            <rect x="27" y="2" width="6" height="1" transform="rotate(-35 30 2.5)" />
            <rect x="27" y="4" width="6" height="1" transform="rotate(-35 30 4.5)" />

            <rect x="3" y="17" width="6" height="1" transform="rotate(-35 6 17.5)" />
            <rect x="3" y="19" width="6" height="1" transform="rotate(-35 6 19.5)" />
        </g>
        <rect width="36" height="24" fill="none" stroke="#eee" strokeWidth="1" />
    </svg>
);
