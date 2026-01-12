import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const res = await fetch('https://ipapi.co/json/', {
            headers: { 'User-Agent': 'kizuna-transfer-app' }
        });

        if (!res.ok) {
            throw new Error(`Failed to fetch location: ${res.status}`);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Location Proxy Error:', error);
        return NextResponse.json({ error: 'Failed to fetch location' }, { status: 500 });
    }
}
