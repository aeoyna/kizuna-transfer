import React, { memo } from 'react';

interface TwemojiProps {
    emoji: string;
    className?: string;
}

const toCodePoint = (unicodeSurrogates: string) => {
    const r = [];
    let c = 0, p = 0, i = 0;
    while (i < unicodeSurrogates.length) {
        c = unicodeSurrogates.charCodeAt(i++);
        if (p) {
            r.push((0x10000 + ((p - 0xD800) << 10) + (c - 0xDC00)).toString(16));
            p = 0;
        } else if (0xD800 <= c && c <= 0xDBFF) {
            p = c;
        } else {
            r.push(c.toString(16));
        }
    }
    return r.join('-');
};

export const Twemoji: React.FC<TwemojiProps> = memo(({ emoji, className = "w-6 h-6" }) => {
    const codePoint = toCodePoint(emoji);
    const src = `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/${codePoint}.svg`;

    return (
        <img
            src={src}
            alt={emoji}
            className={`inline-block align-middle ${className}`}
            draggable={false}
        />
    );
});

Twemoji.displayName = 'Twemoji';
