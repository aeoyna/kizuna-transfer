"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    Copy, CheckCircle2, FileIcon, Download, Upload, XCircle, Loader2, HardDrive, Zap,
    CalendarClock, KeyRound, ArrowRight, Terminal, Share2, Mail, Twitter, ShieldAlert,
    QrCode, Users, Play
} from 'lucide-react';
import type { DataConnection } from 'peerjs';
import { QRCodeSVG } from 'qrcode.react';

// --- Constants ---
const CHUNK_SIZE = 64 * 1024; // 64KB Optimized for Speed
const PARALLEL_STREAMS = 5; // Use multiple streams
const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; // 16MB limit
const BUFFER_THRESHOLD = 64 * 1024; // 64KB threshold
const PROTOCOL_VERSION = 'kizuna-v1'; // Handshake token
const APP_VERSION = "v3.0.0 (Secure)";
const ID_PREFIX = 'kizuna-transfer-v2-';

const ATTACK_THRESHOLD = 5; // Max failures allowed
const ATTACK_WINDOW = 60 * 1000; // 1 minute window

// --- Interfaces ---
interface HostedFile {
    id: string;
    file: File;
    downloadUrl: string;
    downloads: number;
    availableFrom?: number;
    transferKey: string;
}

interface TransferState {
    fileName: string;
    fileSize: number;
    totalChunks: number;
    receivedChunks: number;
    startTime: number;
    fileHandle?: FileSystemFileHandle;
    writable?: FileSystemWritableFileStream;
    chunks?: ArrayBuffer[];
    scheduledTime?: number;
    isFinished?: boolean;
}

// --- IndexedDB Helpers ---
const DB_NAME = 'kizuna_db_v1';
const STORE_NAME = 'transfers';

const openDB = () => {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const saveTransferState = async (info: { id: string, name: string, size: number, peerId: string, handle: any }) => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(info);
};

const loadTransferState = async () => {
    const db = await openDB();
    return new Promise<any>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result[0]); // Just take the first one for now
    });
};

const clearTransferState = async () => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
};


interface PeerDiffs { [id: string]: { name: string, progress: number, speed: string } }

interface SenderStats { speed: string; eta: string; isTransferring: boolean, progress: number }

interface WorkerMessage {
    type?: string;
    index: number;
    data: ArrayBuffer;
}

// --- Main Component ---
export default function P2PConnection({ initialKey }: { initialKey?: string }) {
    const [myId, setMyId] = useState<string>('');
    const [status, setStatus] = useState<'initializing' | 'input_key' | 'ready' | 'connecting' | 'connected' | 'waiting_for_save' | 'scheduled'>('initializing');
    const [hostedFiles, setHostedFiles] = useState<HostedFile[]>([]);
    const [incomingFile, setIncomingFile] = useState<{ name: string; size: number; peerId: string } | null>(null);
    const [progress, setProgress] = useState<number>(0);
    const [transferSpeed, setTransferSpeed] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [activeStreamCount, setActiveStreamCount] = useState(0);
    const [countdown, setCountdown] = useState<string>('');
    const [inputKey, setInputKey] = useState<string>('');

    // Resume State
    const [resumeHandle, setResumeHandle] = useState<any>(null);

    const [senderStats, setSenderStats] = useState<SenderStats>({ speed: '', eta: '', isTransferring: false, progress: 0 });
    const [peerDiffs, setPeerDiffs] = useState<PeerDiffs>({});

    // Worker Ref
    const fileReaderWorkerRef = useRef<Worker | null>(null);

    // Security & Captcha
    const [isCaptchaActive, setIsCaptchaActive] = useState(false);
    const [captcha, setCaptcha] = useState({ q: '', a: '' });
    const failedAttemptsRef = useRef(0);

    // Logs
    const [logs, setLogs] = useState<string[]>([]);

    // Refs
    const peerRef = useRef<any>(null);
    const connectionsRef = useRef<DataConnection[]>([]);
    const hostedFilesRef = useRef<HostedFile[]>([]);
    const incomingDataRef = useRef<TransferState | null>(null);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Security Logic Refs
    const securityLogRef = useRef<number[]>([]);
    const rotateIdentityRef = useRef<() => void>(() => { });

    // --- Helpers ---

    const addLog = useCallback((msg: string) => {
        const time = new Date().toLocaleTimeString();
        const logMsg = `[${time}] ${msg}`;
        console.log(logMsg);
        setLogs(prev => [logMsg, ...prev].slice(0, 100));
    }, []);

    useEffect(() => {
        hostedFilesRef.current = hostedFiles;
    }, [hostedFiles]);

    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                addLog('Wake Lock active');
            }
        } catch (err) { console.warn(err); }
    };

    const releaseWakeLock = async () => {
        if (wakeLockRef.current) {
            await wakeLockRef.current.release();
            wakeLockRef.current = null;
            addLog('Wake Lock released');
        }
    };

    // --- Captcha ---
    const generateCaptcha = () => {
        const a = Math.floor(Math.random() * 10);
        const b = Math.floor(Math.random() * 10);
        return { q: `${a} + ${b}`, a: (a + b).toString() };
    };

    const handleCaptchaVerify = (answer: string) => {
        if (answer === captcha.a) {
            setIsCaptchaActive(false);
            failedAttemptsRef.current = 0;
            setError(null);
            addLog("Captcha verified. Human confirmed.");
        } else {
            setError("Incorrect answer. Try again.");
            setCaptcha(generateCaptcha());
        }
    };

    // --- Security Defense (Auto-Rotate) ---
    const recordFailure = useCallback(() => {
        const now = Date.now();
        securityLogRef.current.push(now);
        // Clean old logs
        securityLogRef.current = securityLogRef.current.filter(t => now - t < ATTACK_WINDOW);

        if (securityLogRef.current.length >= ATTACK_THRESHOLD) {
            addLog("DEFENSE SYSTEM: Attack detected! Rotating Security Key...");
            securityLogRef.current = []; // Reset
            rotateIdentityRef.current(); // Call the rotator
        }
    }, [addLog]);


    // --- Core Logic ---

    // --- Core Logic ---

    // 1. Send Logic (Optimized with Web Worker)
    const sendFileParallel = async (file: File, conns: DataConnection[], startOffset: number = 0, targetPeerId: string) => {
        if (conns.length === 0) return;

        await requestWakeLock();
        addLog(`Starting transfer via ${conns.length} streams (Worker Enabled).`);

        // Initialize UI
        setSenderStats(prev => ({ ...prev, isTransferring: true, progress: 0 }));
        setPeerDiffs(prev => ({
            ...prev,
            [targetPeerId]: { name: `Peer ${targetPeerId.slice(0, 4)}...`, progress: 0, speed: 'Starting...' }
        }));

        const startTime = Date.now();

        // Notify start
        conns[0].send({
            type: 'file_start',
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            totalChunks: Math.ceil(file.size / CHUNK_SIZE),
            startOffset: startOffset
        });

        conns.forEach(c => {
            // @ts-ignore
            c.chunksSent = 0;
            // @ts-ignore
            if (c.dataChannel) c.dataChannel.binaryType = 'arraybuffer';
        });

        // Initialize Worker if not exists
        if (!fileReaderWorkerRef.current) {
            const workerCode = `
                self.onmessage = async (e) => {
                    const { file, startIdx, totalChunks, chunkSize } = e.data;
                    let currentIdx = startIdx;
                    
                    while (currentIdx < totalChunks) {
                        const offset = currentIdx * chunkSize;
                        const end = Math.min(offset + chunkSize, file.size);
                        // Read file
                        const chunk = await file.slice(offset, end).arrayBuffer();
                        
                        // Send back to main thread (Transferable)
                        self.postMessage({ index: currentIdx, data: chunk }, [chunk]);
                        currentIdx++;
                        
                        // Mild throttle to prevent memory explosion if main thread is slow
                        if (currentIdx % 100 === 0) await new Promise(r => setTimeout(r, 20));
                    }
                    self.postMessage({ type: 'complete' });
                };
            `;
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            fileReaderWorkerRef.current = new Worker(URL.createObjectURL(blob));
        }

        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const worker = fileReaderWorkerRef.current;
        let sentCount = 0;

        // Start Worker
        worker.postMessage({
            file: file,
            startIdx: Math.floor(startOffset / CHUNK_SIZE),
            totalChunks: totalChunks,
            chunkSize: CHUNK_SIZE
        });

        // Handle Worker Messages (Producer-Consumer)
        worker.onmessage = async (e: MessageEvent) => {
            if (e.data.type === 'complete') {
                // Wait for all chunks to actually be sent? 
                // The worker is faster than network, so we might still be sending.
                return;
            }

            const { index, data } = e.data as WorkerMessage;

            // Find optimal connection (Round Robin + Backpressure)
            let chosenConn = conns[index % conns.length];

            // Simple Backpressure check
            // @ts-ignore
            if (chosenConn.dataChannel?.bufferedAmount > MAX_BUFFERED_AMOUNT) {
                // If blocked, just wait a bit (blocking the worker event loop momentarily is fine here)
                await new Promise(r => setTimeout(r, 10));
            }

            try {
                chosenConn.send({ type: 'chunk', index: index, data: data });

                sentCount++;
                // @ts-ignore
                chosenConn.chunksSent = (chosenConn.chunksSent || 0) + 1;

                if (sentCount % 50 === 0) addLog(`Sent chunk ${index}/${totalChunks}`);

                // Update UI (Throttled)
                if (sentCount % 20 === 0 || sentCount === totalChunks) {
                    const now = Date.now();
                    const elapsed = (now - startTime) / 1000;
                    if (elapsed > 0.5) {
                        const bytesSent = sentCount * CHUNK_SIZE;
                        const speedBytes = bytesSent / elapsed;
                        const etaSeconds = (file.size - bytesSent) / speedBytes;
                        const speedStr = `${(speedBytes / 1024 / 1024).toFixed(1)} MB/s`;

                        setSenderStats({
                            speed: speedStr,
                            eta: etaSeconds > 60 ? `${Math.floor(etaSeconds / 60)}m ${Math.floor(etaSeconds % 60)}s` : `${Math.floor(etaSeconds)}s`,
                            isTransferring: true,
                            progress: (sentCount / totalChunks) * 100
                        });
                        setPeerDiffs(prev => {
                            const next = { ...prev };
                            conns.forEach(c => {
                                // @ts-ignore
                                const cSent = c.chunksSent || 0;
                                const fairShare = totalChunks / conns.length;
                                next[c.peer] = {
                                    name: `Peer ${c.peer.slice(0, 4)}...`,
                                    progress: Math.min(100, (cSent / fairShare) * 100),
                                    speed: speedStr
                                };
                            });
                            return next;
                        });
                    }
                }

                if (sentCount === totalChunks) {
                    addLog("All chunks sent. Sending file_end.");
                    conns[0].send({ type: 'file_end' });
                    setSenderStats(prev => ({ ...prev, isTransferring: false, speed: 'Complete', progress: 100 }));
                    releaseWakeLock();
                    alert('Transfer Complete!');
                    // Terminate worker to free memory
                    worker.terminate();
                    fileReaderWorkerRef.current = null;
                }

            } catch (err) {
                console.error(err);
            }
        };
    };

    // 2. Download/Receive Logic
    const startDownload = async (fileHandle?: FileSystemFileHandle) => {
        if (!incomingFile) return;

        if (!fileHandle) {
            try {
                // @ts-ignore
                fileHandle = await window.showSaveFilePicker({ suggestedName: incomingFile.name });
            } catch (err) {
                addLog('User cancelled save.');
                return;
            }
        }

        if (!fileHandle) return;

        // Persist for Resume
        try {
            await saveTransferState({
                id: 'current_transfer',
                name: incomingFile.name,
                size: incomingFile.size,
                peerId: incomingFile.peerId,
                handle: fileHandle
            });
            addLog("Transfer state saved for auto-resume.");
        } catch (e) { console.warn("Failed to save resume state", e); }

        const writable = await fileHandle!.createWritable({ keepExistingData: true });

        // Check existing size for resume
        const fileData = await fileHandle!.getFile();
        const currentSize = fileData.size;
        let startChunkIndex = 0;

        if (currentSize > 0) {
            startChunkIndex = Math.floor(currentSize / CHUNK_SIZE);
            addLog(`Resuming from chunk ${startChunkIndex} (${currentSize} bytes)`);
            // We append, so we seek to end
            await writable.seek(currentSize);
        }

        incomingDataRef.current = {
            fileName: incomingFile.name,
            fileSize: incomingFile.size,
            totalChunks: Math.ceil(incomingFile.size / CHUNK_SIZE), // Will be updated by file_start but good to have
            receivedChunks: startChunkIndex,
            startTime: Date.now(),
            fileHandle: fileHandle!,
            writable: writable,
            chunks: []
        };
        setStatus('connected');
        addLog("Saving file... Requesting data.");

        const activeConn = connectionsRef.current.find(c => c.open && c.peer === incomingFile.peerId);
        if (activeConn) {
            // Request specific offset
            // We need to tell sender where to start
            activeConn.send({ type: 'request_file', offsetBytes: currentSize });
        } else {
            // Initiate connection if needed (Resume flow)
            if (!activeConn && resumeHandle) {
                // We need to connect first!
                // The 'connectToPeer' logic handles this, but here we assume we are already connected via 'onOpen' logic?
                // If we came from Resume button, we called connectToPeer manually.
                // Wait for connection?
                // Actually, connectToPeer should trigger 'request_file' after handshake.
                // But here we might want to be explicit.
                // If no connection, we can't send.
                addLog("Waiting for connection to send request...");
            } else {
                const anyConn = connectionsRef.current[0];
                if (anyConn) anyConn.send({ type: 'request_file', offsetBytes: currentSize });
            }
        }
    };

    // 3. Data Handler (with Security)
    const handleData = useCallback(async (data: any, remotePeerId: string, conn?: DataConnection) => {
        if (data && data.type !== 'chunk') {
            addLog(`Received data: ${data.type} from ${remotePeerId}`);
        }

        // Security: Handshake Check (Sender side)
        if (hostedFilesRef.current.length > 0 && conn) {
            // @ts-ignore
            if (!conn.verified) {
                if (data.type === 'handshake' && data.version === PROTOCOL_VERSION) {
                    // @ts-ignore
                    conn.verified = true;
                    addLog(`Peer ${remotePeerId} verified.`);
                    return;
                } else {
                    addLog(`Security: Unverified peer ${remotePeerId} sent data. Closing.`);
                    recordFailure();
                    conn.close();
                    return;
                }
            }
        }

        try {
            if (data.type === 'metadata') {
                // Security: Sanitize Filename
                const safeFileName = data.fileName.replace(/[^a-zA-Z0-9.\-_ \(\)\u0080-\uFFFF]/g, "_").slice(0, 200);

                setIncomingFile({
                    name: safeFileName,
                    size: data.fileSize,
                    peerId: data.peerId
                });
                setStatus('waiting_for_save');
                incomingDataRef.current = {
                    fileName: safeFileName,
                    fileSize: data.fileSize,
                    totalChunks: 0,
                    receivedChunks: 0,
                    startTime: 0,
                    isFinished: false
                };
            }
            else if (data.type === 'get_metadata') {
                const file = hostedFilesRef.current[0]?.file;
                if (file) {
                    const activeConn = connectionsRef.current.find(c => c.open && c.peer === remotePeerId);
                    if (activeConn) {
                        activeConn.send({
                            type: 'metadata',
                            fileName: file.name,
                            fileSize: file.size,
                            peerId: myId
                        });
                    }
                }
            }
            else if (data.type === 'file_start') {
                if (incomingDataRef.current) {
                    incomingDataRef.current.totalChunks = data.totalChunks;
                    incomingDataRef.current.startTime = Date.now();
                }
                setStatus('connected');
                addLog(`File start: ${data.fileName}`);
                await requestWakeLock();
            }
            else if (data.type === 'chunk') {
                const state = incomingDataRef.current;
                if (!state || state.isFinished) return;

                // Security: Size Validation
                if (data.data && data.data.byteLength > CHUNK_SIZE + 4096) {
                    addLog(`Security Warning: Dropped oversized chunk from ${remotePeerId}`);
                    return;
                }

                try {
                    if (state.writable && !state.writable.locked) {
                        await state.writable.write({ type: 'write', position: data.index * CHUNK_SIZE, data: data.data });
                        state.receivedChunks++;

                        if (state.receivedChunks % 20 === 0) {
                            const now = Date.now();
                            const elapsed = (now - state.startTime) / 1000;
                            const progressVal = (state.receivedChunks / state.totalChunks) * 100;
                            const speedBytes = (state.receivedChunks * CHUNK_SIZE) / elapsed;
                            const speedStr = `${(speedBytes / 1024 / 1024).toFixed(1)} MB/s`;

                            setProgress(progressVal);
                            setTransferSpeed(speedStr);
                        }
                    }
                } catch (e) {
                    console.error("Write error:", e);
                }
            }
            else if (data.type === 'file_end') {
                addLog("File transfer finished.");
                if (incomingDataRef.current?.writable) {
                    await incomingDataRef.current.writable.close();
                }
                incomingDataRef.current = { ...incomingDataRef.current!, isFinished: true };
                setStatus('ready');
                setProgress(100);
                setTransferSpeed('Finished');
                setIncomingFile(null);
                setResumeHandle(null); // Clear resume handle
                await clearTransferState(); // Clear DB
                releaseWakeLock();
                alert("Download Complete!");
                window.location.reload();
            }
            else if (data.type === 'request_file') {
                const fileObj = hostedFilesRef.current[0];
                if (fileObj) {
                    if (fileObj.availableFrom && Date.now() < fileObj.availableFrom) {
                        const waitMs = fileObj.availableFrom - Date.now();
                        const waitSec = Math.ceil(waitMs / 1000);
                        conn?.send({ type: 'schedule_wait', seconds: waitSec });
                        return;
                    }
                    const targetConns = connectionsRef.current.filter(c => c.open && c.peer === remotePeerId);
                    // Support Offset for Resume
                    const offset = data.offsetBytes || 0;
                    if (offset > 0) addLog(`Peer requested resume from ${offset} bytes`);
                    sendFileParallel(fileObj.file, targetConns, offset, remotePeerId);
                }
            }
            else if (data.type === 'schedule_wait') {
                addLog(`File is scheduled. Available in ${data.seconds}s`);
                setStatus('scheduled');
                setCountdown(data.seconds.toString());
                const interval = setInterval(() => {
                    setCountdown(prev => {
                        const n = parseInt(prev);
                        if (n <= 1) {
                            clearInterval(interval);
                            conn?.send({ type: 'request_file' });
                            return '';
                        }
                        return (n - 1).toString();
                    });
                }, 1000);
                timerRef.current = interval;
            }
        } catch (err) {
            console.error(err);
            addLog(`Error handling data: ${err}`);
        }
    }, [addLog, recordFailure, myId, sendFileParallel]); // Added sendFileParallel dependency via closure potentially, but it's defined inside.
    // Wait, sendFileParallel is defined inside the component, so we can use it.
    // But handleData is defined BEFORE sendFileParallel. This is a problem with `const` order.
    // Actually handleData is defined AFTER sendFileParallel in my write block above? No, I put sendFileParallel first.
    // Logic order: addLog -> sendFileParallel -> startDownload -> handleData. Ideal.


    // 4. Connection Setup
    const setupConnection = useCallback((conn: DataConnection) => {
        connectionsRef.current.push(conn);
        const count = connectionsRef.current.length;
        setActiveStreamCount(count);
        conn.on('data', (data: any) => handleData(data, conn.peer, conn));
        conn.on('close', () => {
            addLog(`Connection closed: ${conn.peer}`);
            connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
            setActiveStreamCount(connectionsRef.current.length);
        });
    }, [addLog, handleData]);

    const connectToPeer = useCallback((key: string) => {
        if (!peerRef.current) return;
        if (isCaptchaActive) {
            setError('Please solve the captcha first.');
            return;
        }

        const peerId = ID_PREFIX + key;
        addLog(`Connecting to ${peerId}...`);
        setStatus('connecting');

        const newConns: DataConnection[] = [];
        let connectedCount = 0;

        for (let i = 0; i < PARALLEL_STREAMS; i++) {
            const conn = peerRef.current.connect(peerId, {
                reliable: true,
                serialization: 'binary'
            });

            newConns.push(conn);

            conn.on('open', () => {
                connectedCount++;
                addLog(`Stream ${i + 1}/${PARALLEL_STREAMS} open`);

                if (connectedCount === PARALLEL_STREAMS) {
                    connectionsRef.current = newConns;
                    addLog("Streams connected. Sending handshake...");
                    newConns.forEach(c => c.send({ type: 'handshake', version: PROTOCOL_VERSION }));
                    setTimeout(() => newConns[0].send({ type: 'get_metadata' }), 500);
                }
            });

            conn.on('data', (data: any) => handleData(data, conn.peer, conn));
            conn.on('error', (e: any) => addLog(`Stream ${i} Error: ${e}`));
        }

        setTimeout(() => {
            if (connectionsRef.current.every(c => !c.open) && status !== 'waiting_for_save') {
                addLog("Connection timeout.");
                setError("Peer unavailable");
                setInputKey('');
                window.location.href = '/';
            }
        }, 5000);
    }, [addLog, handleData, isCaptchaActive, status]);

    // 5. Init Peer (Refresh/Rotate)
    const initPeer = useCallback(async (retryCount = 0, specificKey?: string) => {
        if (retryCount > 5) { setError("Could not generate unique ID."); return; }

        if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
        }

        try {
            const Peer = (await import('peerjs')).default;
            const randomKey = specificKey || Math.floor(100000 + Math.random() * 900000).toString();
            const id = ID_PREFIX + randomKey;

            addLog(`Initializing PeerJS with ID: ${id}`);
            const peer = new Peer(id, {
                debug: 1,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ]
                }
            });
            peerRef.current = peer;

            peer.on('open', (id: string) => {
                setMyId(id);
                addLog(`PeerJS Open. My ID: ${id}`);

                const params = new URLSearchParams(window.location.search);
                const keyParam = initialKey || params.get('k');

                if (keyParam && !specificKey) {
                    setInputKey(keyParam);
                    connectToPeer(keyParam);
                } else if (!specificKey) {
                    setStatus('input_key');
                }
            });

            peer.on('connection', (conn: DataConnection) => {
                if (connectionsRef.current.length >= PARALLEL_STREAMS + 2) {
                    addLog(`Security: Rejected connection from ${conn.peer} (Limit reached)`);
                    recordFailure();
                    conn.close();
                    return;
                }
                addLog(`Peer Connected: ${conn.peer}`);
                setupConnection(conn);
            });

            peer.on('error', (err: any) => {
                addLog(`PeerJS Error: ${err.type}`);
                if (err.type === 'unavailable-id') {
                    peer.destroy();
                    initPeer(retryCount + 1);
                } else if (err.type === 'peer-unavailable') {
                    failedAttemptsRef.current += 1;
                    setInputKey('');
                    setError("Peer not found.");
                    window.location.href = '/';
                    if (failedAttemptsRef.current >= 3) {
                        setIsCaptchaActive(true);
                        setCaptcha(generateCaptcha());
                    }
                } else if (err.type === 'network') {
                    setError("Network error. Retrying...");
                }
            });
        } catch (e: any) {
            console.error("PeerJS Init failed", e);
            setError(`Init failed: ${e.message}`);
        }
    }, [addLog, handleData, initialKey, setupConnection, connectToPeer, recordFailure]);

    // Bind rotate function
    useEffect(() => {
        rotateIdentityRef.current = () => initPeer();
    }, [initPeer]);

    // Mount & Resume Check
    useEffect(() => {
        initPeer();

        // Check for Resume
        const checkResume = async () => {
            try {
                const savedState = await loadTransferState();
                if (savedState) {
                    addLog(`Found interrupted transfer: ${savedState.name}`);
                    setIncomingFile({
                        name: savedState.name,
                        size: savedState.size,
                        peerId: savedState.peerId
                    });
                    setResumeHandle(savedState.handle);
                    setStatus('waiting_for_save');
                    // Extract key from peerId (prefix remove)
                    const key = savedState.peerId.replace(ID_PREFIX, '');
                    setInputKey(key);
                }
            } catch (e) {
                console.error("Resume check failed", e);
            }
        };
        checkResume();

        return () => { releaseWakeLock(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // File Handle
    const handleFileSelect = async (file: File) => {
        const newKey = Math.floor(100000 + Math.random() * 900000).toString();
        const baseUrl = window.location.origin;
        const shareUrl = `${baseUrl}/${newKey}`;

        addLog(`File added: ${file.name} (${file.size}). New Key: ${newKey}`);
        await initPeer(0, newKey);

        const newFile: HostedFile = {
            id: newKey,
            file,
            downloadUrl: shareUrl,
            downloads: 0,
            availableFrom: 0,
            transferKey: newKey
        };

        setHostedFiles([newFile]);
        setStatus('ready');
    };

    const updateSchedule = (timestamp: number) => {
        setHostedFiles(prev => prev.map(f => ({ ...f, availableFrom: timestamp })));
    };

    // Render
    return (
        <div className="min-h-screen flex flex-col">
            <div className="flex-1">
                {incomingFile ? (
                    <ReceiverView
                        status={status}
                        file={incomingFile}
                        progress={progress}
                        speed={transferSpeed}
                        activeStreams={activeStreamCount}
                        error={error}
                        onStartDownload={async () => {
                            if (resumeHandle) {
                                // Request permission for resume
                                try {
                                    // @ts-ignore
                                    const mode = await resumeHandle.queryPermission({ mode: 'readwrite' });
                                    if (mode !== 'granted') {
                                        // @ts-ignore
                                        await resumeHandle.requestPermission({ mode: 'readwrite' });
                                    }
                                    // Connect if not connected yet
                                    if (status !== 'connected' && connectionsRef.current.length === 0) {
                                        // We need to connect first
                                        addLog("Reconnecting to peer for resume...");
                                        connectToPeer(inputKey);
                                        // The 'startDownload' should be called AFTER connection?
                                        // Or we call startDownload now and it waits?
                                        // Better: connect first, then startDownload triggers request_file
                                        // But startDownload needs 'fileHandle'.
                                        // Let's pass handle to startDownload immediately, 
                                        // and inside startDownload, it sends request IF connected.
                                        // If not connected, we rely on 'onOpen' or 'onConnection' hooks? 
                                        // Actually, our connectToPeer->onOpen->handshake->...
                                        // We should modify 'connectToPeer' to trigger download if 'incomingDataRef' is waiting?
                                        // No, simpler: 
                                        // Just call startDownload. If connection exists, it requests.
                                        // If not, we trigger connectToPeer NOW, and pass a callback?
                                        // Or just let user click "Resume" which connects, then once connected user clicks "Start"?
                                        // User Experience: Click "Resume" -> Connects -> Auto starts?
                                    }

                                    // If we are not connected, we must connect first.
                                    if (connectionsRef.current.length === 0) {
                                        connectToPeer(inputKey);
                                        // We need to wait for connection to established before sending request
                                        // Quick hack: set a flag or retry
                                        const checkConn = setInterval(() => {
                                            if (connectionsRef.current.some(c => c.open)) {
                                                clearInterval(checkConn);
                                                startDownload(resumeHandle);
                                            }
                                        }, 500);
                                    } else {
                                        startDownload(resumeHandle);
                                    }
                                } catch (e) {
                                    addLog("Resume permission denied or failed.");
                                }
                            } else {
                                startDownload();
                            }
                        }}
                        countdown={countdown}
                        inputKey={inputKey}
                        isResume={!!resumeHandle}
                    />
                ) : hostedFiles.length > 0 ? (
                    <SenderView
                        hostedFiles={hostedFiles}
                        activeStreams={activeStreamCount}
                        onSchedule={updateSchedule}
                        onAddFile={handleFileSelect}
                        senderStats={senderStats}
                        peerDiffs={peerDiffs}
                        onStopPeer={(peerId: string) => {
                            const conn = connectionsRef.current.find(c => c.peer === peerId);
                            if (conn) {
                                conn.close();
                                connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
                                setActiveStreamCount(connectionsRef.current.length);
                                setPeerDiffs(prev => {
                                    const next = { ...prev };
                                    delete next[peerId];
                                    return next;
                                });
                            }
                        }}
                    />
                ) : (
                    <InitialView
                        onFileSelect={handleFileSelect}
                        onJoin={(key: string) => connectToPeer(key)}
                        inputKey={inputKey}
                        setInputKey={setInputKey}
                        error={error}
                        isCaptchaActive={isCaptchaActive}
                        captcha={captcha}
                        onCaptchaVerify={handleCaptchaVerify}
                    />
                )}
            </div>

            <LogViewer logs={logs} />
            <Footer />
        </div>
    );
}

// --- Sub Components ---

function Footer() {
    return <div className="fixed bottom-4 right-4 text-xs text-gray-500 font-mono">{APP_VERSION}</div>;
}

function LogViewer({ logs }: { logs: string[] }) {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className={`fixed bottom-0 left-0 w-full bg-black/90 text-green-400 font-mono text-xs transition-all duration-300 z-50 border-t border-white/10 ${isOpen ? 'h-48' : 'h-8'}`}>
            <div
                className="h-8 bg-white/5 flex items-center justify-between px-4 cursor-pointer hover:bg-white/10"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-2">
                    <Terminal size={14} />
                    <span>System Logs</span>
                </div>
                <span>{isOpen ? '▼' : '▲'}</span>
            </div>
            {isOpen && (
                <div className="h-40 overflow-y-auto p-4 space-y-1">
                    {logs.map((log, i) => (
                        <div key={i} className="whitespace-pre-wrap break-all">{log}</div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface InitialViewProps {
    onFileSelect: (file: File) => void;
    onJoin: (key: string) => void;
    inputKey: string;
    setInputKey: (key: string) => void;
    error: string | null;
    isCaptchaActive: boolean;
    captcha: { q: string; a: string };
    onCaptchaVerify: (a: string) => void;
}

function InitialView({ onFileSelect, onJoin, inputKey, setInputKey, error, isCaptchaActive, captcha, onCaptchaVerify }: InitialViewProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [captchaInput, setCaptchaInput] = useState('');

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFileSelect(file);
    };

    return (
        <div className="h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-white text-black">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-gradient-to-br from-red-100 to-transparent rounded-full blur-3xl opacity-30" />
                <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] bg-gradient-to-bl from-red-200 to-transparent rounded-full blur-3xl opacity-30" />
            </div>

            <div className="relative z-10 w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-center gap-16 md:gap-32">
                <div
                    className={`relative w-72 h-96 bg-[#EE0000] rounded-t-[5rem] rounded-b-3xl shadow-xl flex flex-col items-center justify-between p-8 cursor-pointer transition-all duration-300 hover:translate-y-[-8px] hover:shadow-2xl group overflow-hidden border-b-8 border-[#AA0000] ${isDragging ? 'ring-4 ring-[#1a1a1a]' : ''}`}
                    onClick={() => document.getElementById('file-input')?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex flex-col items-center mt-8">
                        <Share2 className="w-16 h-16 text-white mb-4" />
                        <h2 className="text-3xl font-black text-white tracking-tight">POST</h2>
                    </div>
                    <div className="text-center">
                        <p className="text-white/90 font-medium text-lg group-hover:scale-105 transition-transform">Tap to share</p>
                        <p className="text-white/60 text-sm mt-1">or drop file</p>
                    </div>
                    <div className="w-12 h-1 bg-white/20 rounded-full" />
                    <input
                        id="file-input"
                        type="file"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
                    />
                </div>

                <div className="hidden md:block w-px h-64 bg-gray-200" />
                <div className="block md:hidden w-64 h-px bg-gray-200" />

                <div className="flex flex-col items-center gap-8 w-72">
                    <div className="text-center">
                        <h2 className="text-3xl font-black text-gray-900 mb-2">RECEIVE</h2>
                        <p className="text-gray-500">Enter the 6-digit code</p>
                    </div>

                    <div className="w-full space-y-6">
                        <div className="flex justify-between gap-2">
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                                <div
                                    key={i}
                                    className={`w-10 h-14 border-2 rounded-lg flex items-center justify-center text-2xl font-bold bg-white transition-all duration-200 ${inputKey.length === i ? 'border-[#d40000] scale-105' : 'border-gray-200'} ${inputKey[i] ? 'text-red-900 border-red-900' : 'text-gray-300'}`}
                                >
                                    {inputKey[i] || ''}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                                <button
                                    key={n}
                                    onClick={() => {
                                        if (inputKey.length < 6) {
                                            const newVal = inputKey + n;
                                            setInputKey(newVal);
                                            if (newVal.length === 6) onJoin(newVal);
                                        }
                                    }}
                                    className="h-12 rounded-lg bg-gray-50 text-gray-900 font-bold hover:bg-gray-100 active:bg-gray-200 transition-colors"
                                >
                                    {n}
                                </button>
                            ))}
                            <button onClick={() => setInputKey('')} className="h-12 rounded-lg bg-red-50 text-red-500 font-bold hover:bg-red-100 transition-colors text-xs">CLR</button>
                            <button
                                onClick={() => {
                                    if (inputKey.length < 6) {
                                        const newVal = inputKey + '0';
                                        setInputKey(newVal);
                                        if (newVal.length === 6) onJoin(newVal);
                                    }
                                }}
                                className="h-12 rounded-lg bg-gray-50 text-gray-900 font-bold hover:bg-gray-100 transition-colors"
                            >
                                0
                            </button>
                            <button
                                onClick={() => setInputKey(inputKey.slice(0, -1))}
                                className="h-12 rounded-lg bg-gray-50 text-gray-900 font-bold hover:bg-gray-100 transition-colors flex items-center justify-center"
                            >
                                <ArrowRight className="rotate-180" size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {(error || isCaptchaActive) && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6">
                    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full border border-gray-100">
                        {isCaptchaActive ? (
                            <div className="space-y-4">
                                <ShieldAlert className="w-12 h-12 text-[#d40000] mx-auto" />
                                <h3 className="text-xl font-bold text-center">Security Check</h3>
                                <p className="text-center text-gray-500">Please solve: {captcha.q} = ?</p>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        className="flex-1 border rounded-lg px-4 py-2 text-center text-lg"
                                        value={captchaInput}
                                        onChange={(e) => setCaptchaInput(e.target.value)}
                                        placeholder="?"
                                    />
                                    <button
                                        onClick={() => { onCaptchaVerify(captchaInput); setCaptchaInput(''); }}
                                        className="bg-[#d40000] text-white px-6 rounded-lg font-bold hover:bg-[#b30000]"
                                    >
                                        Verify
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center space-y-4">
                                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                                    <ShieldAlert className="w-8 h-8 text-red-600" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900">Connection Error</h3>
                                <p className="text-gray-600 font-medium">{error}</p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold hover:bg-black transition-transform active:scale-95"
                                >
                                    Retry
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

interface SenderViewProps {
    hostedFiles: HostedFile[];
    activeStreams: number;
    onSchedule: (timestamp: number) => void;
    onAddFile: (file: File) => void;
    senderStats: SenderStats;
    peerDiffs: PeerDiffs;
    onStopPeer: (peerId: string) => void;
}

function SenderView({ hostedFiles, activeStreams, onSchedule, onAddFile, senderStats, peerDiffs, onStopPeer }: SenderViewProps) {
    const file = hostedFiles[0];
    const [isSharing, setIsSharing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onAddFile(f);
    };

    return (
        <div className="min-h-screen bg-white text-gray-900 p-6 flex flex-col items-center">
            <div className="w-full max-w-4xl flex items-center justify-between mb-12">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#d40000] rounded-xl flex items-center justify-center">
                        <Users className="text-white" size={20} />
                    </div>
                    <div>
                        <div className="text-sm font-bold text-[#d40000]">ACTIVE SHARE</div>
                        <div className="text-xs text-gray-400">Wait for peers</div>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full border border-gray-100">
                    <div className={`w-2 h-2 rounded-full ${activeStreams > 0 ? 'bg-red-600 animate-pulse' : 'bg-gray-300'}`} />
                    <span className="text-xs font-bold text-gray-500">{activeStreams} Active Peers</span>
                </div>
            </div>

            <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-start">
                <div className="bg-gray-50 rounded-3xl p-8 border border-gray-100 shadow-sm">
                    <div className="text-center mb-8">
                        <h1 className="text-6xl font-black tracking-tighter text-gray-900 mb-2">{file.transferKey}</h1>
                        <p className="text-gray-400 font-medium">Temporary Code</p>
                    </div>
                    <div className="aspect-square bg-white rounded-2xl p-4 shadow-inner mb-6 mx-auto w-48">
                        <QRCodeSVG value={file.downloadUrl} className="w-full h-full" />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => { navigator.clipboard.writeText(file.downloadUrl); alert("Link Copied!"); }}
                            className="flex-1 bg-white border-2 border-gray-200 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                        >
                            <Copy size={18} /> Copy Link
                        </button>
                        <button onClick={() => setIsSharing(!isSharing)} className="bg-gray-900 text-white p-3 rounded-xl hover:bg-black transition-colors">
                            <Share2 size={18} />
                        </button>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="w-16 h-16 bg-[#ffeedd] rounded-2xl flex items-center justify-center text-[#ff5500]">
                                <FileIcon size={32} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 truncate max-w-[200px]">{file.file.name}</h3>
                                <p className="text-sm text-gray-500">{(file.file.size / 1024 / 1024).toFixed(1)} MB • {file.file.type || 'Unknown'}</p>
                            </div>
                        </div>

                        {senderStats.isTransferring ? (
                            <div className="space-y-4">
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-[#d40000] transition-all duration-300 ease-out" style={{ width: `${senderStats.progress}%` }} />
                                </div>
                                <div className="flex justify-between text-sm font-bold">
                                    <span className="text-[#d40000]">{senderStats.speed}</span>
                                    <span className="text-gray-400">ETA: {senderStats.eta}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 bg-green-50 text-green-700 rounded-xl text-sm font-bold flex items-center gap-2">
                                <CheckCircle2 size={16} /> Ready for transfer
                            </div>
                        )}
                    </div>

                    {Object.keys(peerDiffs).length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider pl-2">Connected Peers</h4>
                            {Object.entries(peerDiffs).map(([pid, data]) => (
                                <div key={pid} className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between border border-gray-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                                            <Download size={16} className="text-gray-400" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm">{data.name}</div>
                                            <div className="text-xs text-gray-400">{data.speed}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-xs font-bold text-[#d40000]">{Math.round(data.progress)}%</div>
                                        <button onClick={() => onStopPeer(pid)} className="text-gray-300 hover:text-red-500 transition-colors">
                                            <XCircle size={20} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div
                        className={`relative w-full h-32 bg-[#EE0000] rounded-3xl shadow-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 hover:shadow-2xl border-b-8 border-[#AA0000] overflow-hidden ${isDragging ? 'ring-4 ring-[#1a1a1a]' : ''}`}
                        onClick={() => document.getElementById('add-file-input')?.click()}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                    >
                        <div className="flex items-center gap-2 text-white/90">
                            <Upload size={24} /> <span className="font-black text-xl">ADD FILE</span>
                        </div>
                        <input id="add-file-input" type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onAddFile(e.target.files[0])} />
                    </div>
                </div>
            </div>
        </div>
    );
}

interface ReceiverViewProps {
    status: string;
    file: { name: string; size: number; peerId: string };
    progress: number;
    speed: string;
    activeStreams: number;
    error: string | null;
    onStartDownload: () => void;
    countdown: string;
    inputKey: string;
    isResume?: boolean;
}

function ReceiverView({ status, file, progress, speed, activeStreams, error, onStartDownload, countdown, inputKey, isResume }: ReceiverViewProps) {
    return (
        <div className="h-screen flex flex-col items-center justify-center bg-white p-6 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-gradient-to-br from-red-100 to-transparent rounded-full blur-3xl opacity-40" />
            </div>

            <div className="relative z-10 w-full max-w-md">
                <div className="flex justify-center mb-8">
                    <div className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 border ${status === 'connected' || status === 'waiting_for_save' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-50 text-gray-500 border-gray-100'}`}>
                        <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-[#d40000] animate-pulse' : 'bg-current'}`} />
                        {status.toUpperCase().replace('_', ' ')}
                    </div>
                </div>

                <div className="bg-white rounded-3xl shadow-2xl p-8 border border-gray-100 text-center">
                    <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                        <FileIcon size={40} className="text-gray-600" />
                    </div>

                    <h2 className="text-2xl font-black text-gray-900 mb-2 truncate px-4">{file.name}</h2>
                    <p className="text-gray-500 font-medium mb-8">{(file.size / 1024 / 1024).toFixed(1)} MB</p>

                    {status === 'waiting_for_save' ? (
                        <button
                            onClick={() => onStartDownload()}
                            className={`w-full text-white py-4 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 animate-bounce
                                ${isResume ? 'bg-red-800 hover:bg-red-900 shadow-red-200' : 'bg-[#d40000] hover:bg-[#b30000] shadow-red-200'}
                            `}
                        >
                            {isResume ? <><Play size={24} /> Resume Download</> : <><Download size={24} /> Save File</>}
                        </button>
                    ) : status === 'connected' ? (
                        <div className="space-y-4">
                            <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-[#d40000] transition-all duration-200 ease-linear shadow-[0_0_10px_rgba(212,0,0,0.5)]" style={{ width: `${progress}%` }} />
                            </div>
                            <div className="flex justify-between items-end">
                                <div className="text-left">
                                    <div className="text-3xl font-black text-gray-900">{Math.floor(progress)}%</div>
                                    <div className="text-xs text-gray-400">Downloading...</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[#d40000] font-bold">{speed}</div>
                                    <div className="text-xs text-gray-400">{activeStreams} streams</div>
                                </div>
                            </div>
                        </div>
                    ) : status === 'scheduled' ? (
                        <div className="py-8">
                            <div className="text-5xl font-black text-gray-200 mb-2">{countdown}</div>
                            <p className="text-gray-400 text-sm">Transfer starts automatically</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3 py-4 text-gray-400">
                            <Loader2 className="animate-spin" size={24} />
                            <span className="text-sm">Connecting to peer...</span>
                        </div>
                    )}
                </div>

                <div className="mt-8 text-center">
                    <p className="text-gray-300 text-xs font-mono uppercase tracking-widest">Connect ID: {inputKey}</p>
                </div>
            </div>

            {error && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6">
                    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full border border-gray-100 text-center space-y-4">
                        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
                        <h3 className="text-xl font-bold">Error</h3>
                        <p className="text-gray-600">{error}</p>
                        <button onClick={() => window.location.reload()} className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-black">Reload</button>
                    </div>
                </div>
            )}
        </div>
    );
}
