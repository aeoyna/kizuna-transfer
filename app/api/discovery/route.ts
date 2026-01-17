import { NextRequest, NextResponse } from 'next/server';

// In-memory store for active peers
// Map<IP_Address, User[]>
const ipMap = new Map<string, { peerId: string; key?: string; device: string; lastSeen: number; type: 'sender' | 'receiver' }[]>();

// Cleanup interval (every 1 minute)
setInterval(() => {
    const now = Date.now();
    ipMap.forEach((peers, ip) => {
        const validPeers = peers.filter(p => now - p.lastSeen < 30000); // 30s timeout
        if (validPeers.length > 0) {
            ipMap.set(ip, validPeers);
        } else {
            ipMap.delete(ip);
        }
    });
}, 60000);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { peerId, key, device, type } = body;

        // Get IP - simplified for demo/dev
        // In prod, use 'x-forwarded-for' or similar
        const ip = req.headers.get('x-forwarded-for') || '127.0.0.1'; // fallback for local

        const now = Date.now();
        const currentPeers = ipMap.get(ip) || [];

        // Remove self if exists (update)
        const others = currentPeers.filter(p => p.peerId !== peerId);

        // Add self
        others.push({ peerId, key, device, lastSeen: now, type });
        ipMap.set(ip, others);

        // Return *other* peers
        // If I am a Receiver, I want Senders.
        // If I am a Sender, I usually don't care, but maybe I want to see other Senders?
        // Let's just return everyone else for now, Frontend filters.
        const neighbors = others.filter(p => p.peerId !== peerId);

        return NextResponse.json({ neighbors });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to register' }, { status: 500 });
    }
}
