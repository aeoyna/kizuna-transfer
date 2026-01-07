"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    Copy, CheckCircle2, FileIcon, Download, Upload, XCircle, Loader2, HardDrive, Zap,
    CalendarClock, KeyRound, ArrowRight, Terminal, Share2, Mail, Twitter, ShieldAlert,
    QrCode, Users, Play, Plus, BookOpen, HelpCircle
} from 'lucide-react';
import type { DataConnection } from 'peerjs';
import { QRCodeSVG } from 'qrcode.react';
import AdSlot from './AdSlot';
import { LanguageProvider, useLanguage } from '../i18n/LanguageContext';
import LanguageSwitcher from './LanguageSwitcher';

// --- Constants ---
const CHUNK_SIZE = 64 * 1024; // 64KB Optimized for Speed
const PARALLEL_STREAMS = 5; // Use multiple streams
const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; // 16MB limit
const BUFFER_THRESHOLD = 64 * 1024; // 64KB threshold
const PROTOCOL_VERSION = 'kizuna-v1'; // Handshake token
const APP_VERSION = "v3.2.0 (Batch & Post)";
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

interface IncomingFileMeta {
    name: string;
    size: number;
    peerId: string;
    id: string; // Unique ID from sender
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
    fileId?: string;
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

// --- Theme Types & Mapping ---
type ThemeColors = {
    primary: string; // Main color (Postbox) #d40000
    dark: string;    // Text accents #8b0000
    hover: string;   // Hover states #b30000
    light: string;   // Light backgrounds #fee2e2 (red-100)
    lighter: string; // Lighter backgrounds #fef2f2 (red-50)
    subtle: string;  // Borders #fecaca (red-200)
};

const DEFAULT_THEME: ThemeColors = {
    primary: '#d40000',
    dark: '#8b0000',
    hover: '#b30000',
    light: '#fee2e2',
    lighter: '#fef2f2',
    subtle: '#fecaca'
};

const COUNTRY_THEMES: Record<string, ThemeColors> = {
    'US': { // USA - Blue
        primary: '#0033A0',
        dark: '#001E60',
        hover: '#00267F',
        light: '#dbeafe', // blue-100
        lighter: '#eff6ff', // blue-50
        subtle: '#bfdbfe' // blue-200
    },
    'JP': DEFAULT_THEME, // Japan - Red
    'KR': { // Korea - Red (slightly different standard, but sticking to default for now or custom)
        primary: '#C60C30',
        dark: '#8a0821',
        hover: '#a30a27',
        light: '#ffe4e6',
        lighter: '#fff1f2',
        subtle: '#fecdd3'
    },
    'CN': { // China - Green
        primary: '#006400',
        dark: '#004000',
        hover: '#005000',
        light: '#dcfce7', // green-100
        lighter: '#f0fdf4', // green-50
        subtle: '#bbf7d0' // green-200
    },
    'TW': DEFAULT_THEME, // Taiwan - Red
    'TH': DEFAULT_THEME, // Thailand - Red
    'VN': { // Vietnam - Yellow/Gold (using Dark Goldenrod for visibility on white)
        primary: '#DAA520',
        dark: '#B8860B',
        hover: '#CD950C',
        light: '#fef9c3', // yellow-100
        lighter: '#fefce8', // yellow-50
        subtle: '#fde047' // yellow-200ish
    },
    'ID': { // Indonesia - Orange
        primary: '#FF4500',
        dark: '#CC3700',
        hover: '#E63E00',
        light: '#ffedd5', // orange-100
        lighter: '#fff7ed', // orange-50
        subtle: '#fed7aa' // orange-200
    },
    'MY': DEFAULT_THEME, // Malaysia - Red
    'KP': { // North Korea - Blue
        primary: '#024FA2',
        dark: '#003366',
        hover: '#003F82',
        light: '#dbeafe',
        lighter: '#eff6ff',
        subtle: '#bfdbfe'
    }
};

// --- Main Component ---
export default function P2PConnection({ initialKey }: { initialKey?: string }) {
    return (
        <LanguageProvider>
            <P2PConnectionContent initialKey={initialKey} />
        </LanguageProvider>
    );
}

function P2PConnectionContent({ initialKey }: { initialKey?: string }) {
    const { t } = useLanguage();
    const [myId, setMyId] = useState<string>('');
    const [status, setStatus] = useState<'initializing' | 'input_key' | 'ready' | 'connecting' | 'connected' | 'waiting_for_save' | 'scheduled'>('initializing');
    const [hostedFiles, setHostedFiles] = useState<HostedFile[]>([]);
    const [theme, setTheme] = useState<ThemeColors>(DEFAULT_THEME);

    // Fetch User Country
    useEffect(() => {
        fetch('https://ipapi.co/json/')
            .then(res => res.json())
            .then(data => {
                const country = data.country_code;
                if (country && COUNTRY_THEMES[country]) {
                    setTheme(COUNTRY_THEMES[country]);
                }
            })
            .catch(err => console.error('Failed to detect location for theme:', err));
    }, []);

    // Multi-file support: Store array of incoming files
    const [incomingFiles, setIncomingFiles] = useState<IncomingFileMeta[]>([]);
    const [activeDownloadFile, setActiveDownloadFile] = useState<IncomingFileMeta | null>(null);

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

    // 1. Send Logic (Optimized with Web Worker)
    const sendFileParallel = async (file: File, conns: DataConnection[], startOffset: number = 0, targetPeerId: string) => {
        if (conns.length === 0) return;

        await requestWakeLock();
        addLog(`Starting transfer: ${file.name}`);

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
    const startDownload = async (fileMeta: IncomingFileMeta, fileHandle?: FileSystemFileHandle) => {
        if (!fileMeta) return;

        if (!fileHandle) {
            try {
                // @ts-ignore
                fileHandle = await window.showSaveFilePicker({ suggestedName: fileMeta.name });
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
                name: fileMeta.name,
                size: fileMeta.size,
                peerId: fileMeta.peerId,
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
            fileName: fileMeta.name,
            fileSize: fileMeta.size,
            totalChunks: Math.ceil(fileMeta.size / CHUNK_SIZE),
            receivedChunks: startChunkIndex,
            startTime: Date.now(),
            fileHandle: fileHandle!,
            writable: writable,
            chunks: [],
            fileId: fileMeta.id
        };
        setActiveDownloadFile(fileMeta);
        setStatus('connected');
        addLog(`Requesting file: ${fileMeta.name} (ID: ${fileMeta.id})`);

        const activeConn = connectionsRef.current.find(c => c.open && c.peer === fileMeta.peerId);
        if (activeConn) {
            // Request specific file by ID
            activeConn.send({ type: 'request_file', fileId: fileMeta.id, offsetBytes: currentSize });
        } else {
            // Queue via first available (fallback)
            const anyConn = connectionsRef.current[0];
            if (anyConn) anyConn.send({ type: 'request_file', fileId: fileMeta.id, offsetBytes: currentSize });
        }
    };

    // Batch Download (Sequential for safety)
    const downloadAll = async () => {
        if (incomingFiles.length === 0) return;

        let dirHandle: any = null;
        try {
            // @ts-ignore
            dirHandle = await window.showDirectoryPicker();
        } catch (e) { return; } // Cancelled

        if (!dirHandle) return;

        alert("Starting batch download. Please keep this tab open.");

        for (const file of incomingFiles) {
            try {
                const fileHandle = await dirHandle.getFileHandle(file.name, { create: true });
                await startDownload(file, fileHandle);

                // Wait for finish before next (Polling state)
                await new Promise<void>((resolve) => {
                    const check = setInterval(() => {
                        if (status === 'waiting_for_save') {
                            clearInterval(check);
                            resolve();
                        }
                    }, 500);
                });

            } catch (err) {
                console.error(`Failed to download ${file.name}`, err);
            }
        }
        alert("All files downloaded!");
    };


    // 3. Data Handler (with Security)
    const handleData = useCallback(async (data: any, remotePeerId: string, conn?: DataConnection) => {
        if (data && data.type !== 'chunk') {
            addLog(`Received data: ${data.type} from ${remotePeerId}`);
        }

        // Security: Handshake Check
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
            if (data.type === 'metadata_list') {
                // Multi-file support: Receive list of files
                const files: IncomingFileMeta[] = data.files.map((f: any) => ({
                    name: f.fileName.replace(/[^a-zA-Z0-9.\-_ \(\)\u0080-\uFFFF]/g, "_").slice(0, 200),
                    size: f.fileSize,
                    peerId: remotePeerId,
                    id: f.id
                }));

                setIncomingFiles(files);
                setStatus('waiting_for_save');
            }
            else if (data.type === 'get_metadata') {
                // Send ALL hosted files
                const filesMeta = hostedFilesRef.current.map(f => ({
                    id: f.id,
                    fileName: f.file.name,
                    fileSize: f.file.size
                }));

                const activeConn = connectionsRef.current.find(c => c.open && c.peer === remotePeerId);
                if (activeConn) {
                    activeConn.send({
                        type: 'metadata_list',
                        files: filesMeta,
                        peerId: myId
                    });
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
                setStatus('waiting_for_save'); // Go back to list
                setProgress(100);
                setActiveDownloadFile(null); // Clear active download
                setTransferSpeed('Finished');
                setResumeHandle(null); // Clear resume handle
                await clearTransferState(); // Clear DB
                releaseWakeLock();
                // We rely on UI to show completion
            }
            else if (data.type === 'request_file') {
                const requestedId = data.fileId;
                const fileObj = hostedFilesRef.current.find(f => f.id === requestedId) || hostedFilesRef.current[0];

                if (fileObj) {
                    const targetConns = connectionsRef.current.filter(c => c.open && c.peer === remotePeerId);
                    // Support Offset for Resume
                    const offset = data.offsetBytes || 0;
                    if (offset > 0) addLog(`Peer requested resume from ${offset} bytes`);
                    sendFileParallel(fileObj.file, targetConns, offset, remotePeerId);
                }
            }
        } catch (err) {
            console.error(err);
            addLog(`Error handling data: ${err}`);
        }
    }, [addLog, recordFailure, myId, sendFileParallel]);

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

        // Reset old errors
        setError(null);

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

                // --- CUSTOM USER ERROR: Address not found ---
                // --- CUSTOM USER ERROR: Address not found ---
                setError(t('addressNotFound'));
                setInputKey('');
                setTimeout(() => {
                    setError(null);
                    setStatus('initializing'); // Or whatever initial state is appropriate
                }, 1000);
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

                    // --- CUSTOM USER ERROR: Address not found ---
                    // --- CUSTOM USER ERROR: Address not found ---
                    setError(t('addressNotFound'));
                    setTimeout(() => setError(null), 1000);

                    // Optional: Don't hard reload, just let error show
                    // window.location.href = '/'; 
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
                    // Multi-file partial support in resume: Just show the one we were downloading
                    setIncomingFiles([{
                        name: savedState.name,
                        size: savedState.size,
                        peerId: savedState.peerId,
                        id: 'resume' // We might lose ID but okay for single resume
                    }]);
                    setResumeHandle(savedState.handle);
                    setStatus('waiting_for_save');
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
    const handleFileSelect = async (files: File[]) => {
        if (files.length === 0) return;

        const baseUrl = window.location.origin;
        // If first file, generate key. If additional, keep key.
        let currentKey = hostedFiles.length > 0 ? hostedFiles[0].transferKey : null;

        if (!currentKey) {
            currentKey = Math.floor(100000 + Math.random() * 900000).toString();
            await initPeer(0, currentKey);
        }

        const shareUrl = `${baseUrl}/${currentKey}`;

        const newFiles: HostedFile[] = files.map(file => {
            const newFileId = Math.random().toString(36).substring(7);
            addLog(`File added: ${file.name} (${file.size}). Key: ${currentKey}`);

            return {
                id: newFileId,
                file,
                downloadUrl: shareUrl,
                downloads: 0,
                availableFrom: 0,
                transferKey: currentKey!
            };
        });

        // Append to list instead of replacing
        setHostedFiles(prev => [...prev, ...newFiles]);
        setStatus('ready');
    };

    const updateSchedule = (timestamp: number) => {
        setHostedFiles(prev => prev.map(f => ({ ...f, availableFrom: timestamp })));
    };

    // Render
    const themeStyle = {
        '--theme-primary': theme.primary,
        '--theme-dark': theme.dark,
        '--theme-hover': theme.hover,
        '--theme-light': theme.light,
        '--theme-lighter': theme.lighter,
        '--theme-subtle': theme.subtle,
    } as React.CSSProperties;

    return (
        <div className="min-h-screen flex flex-col" style={themeStyle}>
            <div className="flex-1">
                {incomingFiles.length > 0 ? (
                    <ReceiverView
                        status={status}
                        files={incomingFiles}
                        activeFile={activeDownloadFile}
                        progress={progress}
                        speed={transferSpeed}
                        activeStreams={activeStreamCount}
                        error={error}
                        onStartDownload={(file) => startDownload(file, resumeHandle)}
                        onDownloadAll={downloadAll}
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
    onFileSelect: (files: File[]) => void;
    onJoin: (key: string) => void;
    inputKey: string;
    setInputKey: (key: string) => void;
    error: string | null;
    isCaptchaActive: boolean;
    captcha: { q: string; a: string };
    onCaptchaVerify: (a: string) => void;
}

function InitialView({ onFileSelect, onJoin, inputKey, setInputKey, error, isCaptchaActive, captcha, onCaptchaVerify }: InitialViewProps) {
    const { t } = useLanguage();
    const [isDragging, setIsDragging] = useState(false);
    const [captchaInput, setCaptchaInput] = useState('');
    const [showHelp, setShowHelp] = useState(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onFileSelect(files);
    };

    return (
        <div className="h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-white text-black">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-gradient-to-br from-[var(--theme-light)] to-transparent rounded-full blur-3xl opacity-30" />
                <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] bg-gradient-to-bl from-red-200 to-transparent rounded-full blur-3xl opacity-30" />
            </div>

            {/* Help Button */}
            <div className="absolute top-6 right-6 flex items-center gap-4 z-20">
                <LanguageSwitcher />
                <button
                    onClick={() => setShowHelp(true)}
                    className="flex items-center gap-2 text-gray-500 hover:text-black transition-colors"
                >
                    <HelpCircle size={20} />
                    <span className="text-sm font-bold">{t('howToUse')}</span>
                </button>
            </div>

            <div className="relative z-10 w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-center gap-16 md:gap-32">
                <div
                    className={`relative w-72 h-96 bg-[#CC0000] rounded-t-[5rem] rounded-b-xl shadow-2xl flex flex-col items-center justify-between p-8 cursor-pointer transition-all duration-300 hover:translate-y-[-8px] hover:shadow-red-900/40 group overflow-hidden border-b-0 postbox-slot ${isDragging ? 'ring-4 ring-yellow-400' : ''}`}
                    onClick={() => document.getElementById('file-input')?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                >
                    <div className="absolute top-0 left-0 right-0 h-4 bg-black/10 rounded-t-[5rem]" />
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />

                    {/* Postbox Slot Visual */}
                    <div className="w-48 h-3 bg-black/40 rounded-full mt-12 mb-4 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] border-b border-white/10 relative">
                        <div className="absolute top-full left-1/2 -translate-x-1/2 text-[10px] text-white/60 font-mono tracking-widest mt-1">POST HERE</div>
                    </div>

                    <div className="flex flex-col items-center z-10">
                        <div className="bg-white/10 p-4 rounded-full mb-4 backdrop-blur-sm border border-white/20">
                            <Mail className="w-10 h-10 text-white" />
                        </div>
                        <div className="bg-white/10 p-4 rounded-full mb-4 backdrop-blur-sm border border-white/20">
                            <Mail className="w-10 h-10 text-white" />
                        </div>
                        <h2 className="text-4xl font-black text-white tracking-widest text-engraved font-serif">{t('sendFiles')}</h2>
                    </div>

                    <div className="text-center z-10">
                        <p className="text-white/90 font-bold text-lg group-hover:scale-105 transition-transform">{t('clickOrDrag')}</p>
                        <p className="text-white/60 text-xs mt-1 uppercase tracking-wider font-serif italic">{t('postbox')}</p>
                    </div>

                    {/* Bottom Plate */}
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-black/20 backdrop-blur-md flex items-center justify-center">
                        <div className="w-16 h-1 bg-white/30 rounded-full" />
                    </div>

                    <input
                        id="file-input"
                        type="file"
                        className="hidden"
                        multiple
                        onChange={(e) => e.target.files && e.target.files.length > 0 && onFileSelect(Array.from(e.target.files))}
                    />
                </div>

                <div className="hidden md:block w-px h-64 bg-gray-200" />
                <div className="block md:hidden w-64 h-px bg-gray-200" />

                <div className="flex flex-col items-center gap-8 w-72">
                    <div className="flex flex-col items-center gap-8 w-72">
                        <div className="text-center">
                            <h2 className="text-2xl font-black text-gray-900 mb-2">{t('receiveFiles')}</h2>
                            <p className="text-gray-500 text-sm">{t('enterCode')}</p>
                        </div>

                        <div className="w-full space-y-6">
                            <div className="flex items-center justify-center gap-4">
                                <div className="flex gap-2">
                                    {[0, 1, 2].map((i) => (
                                        <div
                                            key={i}
                                            className={`w-10 h-14 border-2 rounded-lg flex items-center justify-center text-2xl font-bold bg-white transition-all duration-200 ${inputKey.length === i ? 'border-[var(--theme-primary)] scale-105' : 'border-gray-200'} ${inputKey[i] ? 'text-[var(--theme-dark)] border-[var(--theme-dark)]' : 'text-gray-300'}`}
                                        >
                                            {inputKey[i] || ''}
                                        </div>
                                    ))}
                                </div>
                                <div className="text-2xl font-bold text-gray-300">-</div>
                                <div className="flex gap-2">
                                    {[3, 4, 5].map((i) => (
                                        <div
                                            key={i}
                                            className={`w-10 h-14 border-2 rounded-lg flex items-center justify-center text-2xl font-bold bg-white transition-all duration-200 ${inputKey.length === i ? 'border-[var(--theme-primary)] scale-105' : 'border-gray-200'} ${inputKey[i] ? 'text-[var(--theme-dark)] border-[var(--theme-dark)]' : 'text-gray-300'}`}
                                        >
                                            {inputKey[i] || ''}
                                        </div>
                                    ))}
                                </div>
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
                                <button onClick={() => setInputKey('')} className="h-12 rounded-lg bg-[var(--theme-lighter)] text-[var(--theme-primary)] font-bold hover:bg-[var(--theme-light)] transition-colors text-xs">CLR</button>
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
                                    <ShieldAlert className="w-12 h-12 text-[var(--theme-primary)] mx-auto" />
                                    <h3 className="text-xl font-bold text-center">{t('securityCheck')}</h3>
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
                                            className="bg-[var(--theme-primary)] text-white px-6 rounded-lg font-bold hover:bg-[var(--theme-hover)]"
                                        >
                                            {t('verify')}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center space-y-4">
                                    <div className="w-16 h-16 bg-[var(--theme-light)] rounded-full flex items-center justify-center mx-auto">
                                        <ShieldAlert className="w-8 h-8 text-[var(--theme-primary)]" />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900">Connection Error</h3>
                                    <p className="text-gray-600 font-medium">{error}</p>
                                    {error !== t('addressNotFound') && (
                                        <button
                                            onClick={() => window.location.reload()}
                                            className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold hover:bg-black transition-transform active:scale-95"
                                        >
                                            {t('retry')}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {showHelp && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden relative">
                            <button
                                onClick={() => setShowHelp(false)}
                                className="absolute top-4 right-4 text-gray-400 hover:text-gray-900"
                            >
                                <XCircle size={24} />
                            </button>

                            <div className="p-8">
                                <h3 className="text-2xl font-bold mb-6 text-center">{t('howToUse')}</h3>
                                <div className="space-y-8">
                                    <div className="flex gap-4">
                                        <div className="w-12 h-12 bg-[var(--theme-light)] rounded-full flex items-center justify-center flex-shrink-0">
                                            <Upload className="text-[var(--theme-primary)]" size={24} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-lg mb-1">{t('step1Title')}</h4>
                                            <p className="text-gray-600 text-sm">{t('step1Desc')}</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                                            <Download className="text-gray-600" size={24} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-lg mb-1">{t('step2Title')}</h4>
                                            <p className="text-gray-600 text-sm">{t('step2Desc')}</p>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setShowHelp(false)}
                                    className="w-full mt-8 bg-gray-900 text-white py-3 rounded-lg font-bold hover:bg-black transition-colors"
                                >
                                    {t('gotIt')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

interface SenderViewProps {
    hostedFiles: HostedFile[];
    activeStreams: number;
    onSchedule: (timestamp: number) => void;
    onAddFile: (files: File[]) => void;
    senderStats: SenderStats;
    peerDiffs: PeerDiffs;
    onStopPeer: (peerId: string) => void;
}

function SenderView({ hostedFiles, activeStreams, onSchedule, onAddFile, senderStats, peerDiffs, onStopPeer }: SenderViewProps) {
    const { t } = useLanguage();
    const mainFile = hostedFiles[0];
    const [isSharing, setIsSharing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(mainFile.downloadUrl);
        setIsSharing(true);
        setTimeout(() => setIsSharing(false), 2000);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onAddFile(files);
    };

    return (
        <div className="min-h-screen bg-white text-gray-900 p-6 flex flex-col items-center">
            <div className="w-full max-w-4xl flex items-center justify-between mb-12">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[var(--theme-primary)] rounded-xl flex items-center justify-center">
                        <Users className="text-white" size={20} />
                    </div>
                    <div>
                        <div className="text-sm font-bold text-[var(--theme-primary)]">{t('activeShare')} ({hostedFiles.length})</div>
                        <div className="text-xs text-gray-400">{t('waitForPeers')}</div>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full border border-gray-100">
                    <div className={`w-2 h-2 rounded-full ${activeStreams > 0 ? 'bg-[var(--theme-primary)] animate-pulse' : 'bg-gray-300'}`} />
                    <span className="text-xs font-bold text-gray-500">{activeStreams} {t('activePeers')}</span>
                </div>
            </div>

            <div className="w-full max-w-5xl grid md:grid-cols-2 gap-8 items-start">
                <div className="space-y-6">
                    {/* Postal Code Card */}
                    <div className="envelope-card p-8 rounded-sm  max-w-sm mx-auto transform paper-texture relative">
                        <div className="absolute top-4 right-4 post-stamp border-[var(--theme-primary)] text-[var(--theme-primary)]">
                            PRIORITY
                        </div>
                        <div className="text-center space-y-2">
                            <p className="text-xs text-[var(--theme-dark)]/60 font-bold uppercase tracking-widest">{t('postalCode')}</p>
                            <h1 className="text-6xl font-serif font-bold tracking-widest text-[var(--theme-dark)] mb-2 font-mono">{mainFile.transferKey.slice(0, 3)}-{mainFile.transferKey.slice(3)}</h1>
                        </div>

                        {/* File List */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-xs font-bold text-[var(--theme-dark)]/50 uppercase tracking-widest mb-2 border-b border-[#8b0000]/10 pb-2">
                                <span>{t('lettersToSend')} ({hostedFiles.length})</span>
                                <span>{t('activeShare')}</span>
                            </div>
                            <Mail size={24} className="mx-auto text-[var(--theme-dark)]/20" />
                        </div>
                        <div className="aspect-square bg-white p-2 border-4 border-double border-gray-200 mb-6 mx-auto w-48 relative mt-4">
                            <QRCodeSVG value={mainFile.downloadUrl} className="w-full h-full opacity-90" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleCopyLink}
                            className="flex-1 bg-[var(--theme-lighter)] border-2 border-[var(--theme-light)] text-[var(--theme-dark)] py-3 rounded-md font-bold hover:bg-[var(--theme-light)] transition-colors flex items-center justify-center gap-2 font-serif"
                        >
                            {isSharing ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                            {isSharing ? t('linkCopied') : t('copyAddress')}
                        </button>
                    </div>
                </div>

                {/* Send More Postbox */}
                <div
                    className={`relative w-full h-32 bg-[#CC0000] rounded-xl shadow-lg flex flex-col items-center justify-center cursor-pointer transition-all duration-300 hover:shadow-xl border-4 border-[#990000] overflow-hidden ${isDragging ? 'ring-4 ring-yellow-400' : ''} postbox-slot`}
                    onClick={() => document.getElementById('add-file-input')?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                >
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-48 h-3 bg-black/40 rounded-full shadow-inner" />
                    <div className="flex items-center gap-2 text-white/90 mt-4">
                        <Mail size={24} /> <span className="font-bold text-xl font-serif tracking-widest text-engraved">{t('postMore')}</span>
                    </div>
                    <div className="text-white/60 text-xs uppercase tracking-wider mt-1">{t('dropAdditional')}</div>
                    <input id="add-file-input" type="file" multiple className="hidden" onChange={(e) => e.target.files && e.target.files.length > 0 && onAddFile(Array.from(e.target.files))} />
                </div>

                {/* Ad Slot */}
                <AdSlot variant="sidebar" />
            </div>

            <div className="space-y-6">
                <h3 className="font-serif text-2xl font-bold text-[var(--theme-dark)] pl-2 mb-4 border-b-2 border-[var(--theme-light)] pb-2">{t('lettersToSend')} ({hostedFiles.length})</h3>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    {hostedFiles.map((file, idx) => (
                        <div key={file.id} className="bg-white p-4 rounded-sm shadow-sm border border-gray-200 paper-texture relative transform hover:-translate-y-1 transition-transform cursor-default">
                            <div className="absolute top-2 right-2 opacity-20">
                                <Mail size={40} className="text-[var(--theme-dark)]" />
                            </div>
                            <div className="flex items-center gap-4 relative z-10">
                                <div className="w-10 h-10 bg-[var(--theme-lighter)] rounded-full flex items-center justify-center text-[var(--theme-dark)] font-bold font-mono border border-[var(--theme-light)]">
                                    {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-gray-900 truncate font-serif">{file.file.name}</h4>
                                    <p className="text-xs text-gray-500 font-mono">{(file.file.size / 1024 / 1024).toFixed(1)} MB</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Status Display (for active file) */}
                {senderStats.isTransferring && (
                    <div className="bg-white rounded-xl p-6 shadow-xl border border-gray-100 sticky bottom-0">
                        <div className="space-y-4">
                            <div className="flex justify-between text-sm font-bold">
                                <span className="text-[var(--theme-primary)]">Sending...</span>
                                <span className="text-gray-400">ETA: {senderStats.eta}</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-[var(--theme-primary)] transition-all duration-300 ease-out" style={{ width: `${senderStats.progress}%` }} />
                            </div>
                            <div className="text-right text-[var(--theme-primary)] font-bold text-sm">{senderStats.speed}</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

interface ReceiverViewProps {
    status: string;
    files: IncomingFileMeta[];
    activeFile: IncomingFileMeta | null;
    progress: number;
    speed: string;
    activeStreams: number;
    error: string | null;
    onStartDownload: (file: IncomingFileMeta) => void;
    onDownloadAll?: () => void;
    countdown: string;
    inputKey: string;
    isResume?: boolean;
}

function ReceiverView({ status, files, activeFile, progress, speed, activeStreams, error, onStartDownload, onDownloadAll, countdown, inputKey, isResume }: ReceiverViewProps) {
    return (
        <div className="h-screen flex flex-col items-center justify-center bg-white p-6 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-gradient-to-br from-[var(--theme-light)] to-transparent rounded-full blur-3xl opacity-40" />
            </div>

            <div className="relative z-10 w-full max-w-4xl flex flex-col items-center">
                <div className="mb-8 text-center">
                    <div className="w-20 h-20 bg-[var(--theme-lighter)] rounded-full flex items-center justify-center mx-auto mb-4 shadow-md border-4 border-white">
                        <Mail size={32} className="text-[var(--theme-dark)]" />
                    </div>
                    <h2 className="text-3xl font-black text-[var(--theme-dark)] mb-2 font-serif tracking-tight">YOU HAVE MAIL</h2>
                    <p className="text-gray-500 font-mono">From Post ID: {inputKey}</p>
                </div>

                {/* Ad Slot */}
                <div className="w-full mb-8">
                    <AdSlot variant="banner" />
                </div>

                {/* Download All Button */}
                {files.length > 1 && onDownloadAll && (
                    <button
                        onClick={onDownloadAll}
                        className="mb-8 bg-gray-900 text-white px-8 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg hover:scale-105 transition-transform"
                    >
                        <BookOpen size={20} /> Collect All Letters
                    </button>
                )}

                <div className="w-full grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[50vh] overflow-y-auto p-4">
                    {files.map((file) => (
                        <div key={file.id} className="envelope-card p-6 paper-texture flex flex-col justify-between h-48 transform hover:scale-105 transition-transform duration-200">
                            <div>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="w-8 h-10 border-2 border-[var(--theme-subtle)] bg-[var(--theme-lighter)] flex items-center justify-center">
                                        <span className="text-[10px] text-[var(--theme-subtle)] font-bold transform -rotate-90">STAMP</span>
                                    </div>
                                    {activeFile?.id === file.id && status === 'connected' && (
                                        <div className="text-xs font-bold text-[var(--theme-primary)] animate-pulse">Downloading...</div>
                                    )}
                                    {status === 'waiting_for_save' && activeFile?.id === file.id && (
                                        <div className="text-[var(--theme-primary)] font-bold border-2 border-red-600 px-2 py-0.5 text-xs rounded-sm rotate-12 opacity-80">DONE</div>
                                    )}
                                </div>
                                <h3 className="font-bold text-gray-900 truncate font-serif text-lg leading-tight mb-1">{file.name}</h3>
                                <p className="text-xs text-gray-500 font-mono">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                            </div>

                            <button
                                onClick={() => onStartDownload(file)}
                                disabled={status === 'connected' || (activeFile !== null && activeFile.id !== file.id)}
                                className={`w-full mt-4 py-2 rounded-md font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 border-t-2 border-gray-100
                                    ${activeFile?.id === file.id ? 'bg-gray-100 text-gray-400' : 'bg-[var(--theme-primary)] text-white hover:bg-[var(--theme-hover)]'}
                                `}
                            >
                                {activeFile?.id === file.id ? (status === 'connected' ? 'In Transit...' : 'Opening...') : 'Open Letter'}
                            </button>
                        </div>
                    ))}
                </div>

                {status === 'connected' && activeFile && (
                    <div className="mt-8 w-full max-w-md bg-white rounded-xl p-6 shadow-xl border border-gray-100">
                        <h4 className="font-bold text-gray-900 mb-2 truncate">Downloading: {activeFile.name}</h4>
                        <div className="h-4 bg-gray-100 rounded-full overflow-hidden mb-2">
                            <div className="h-full bg-[var(--theme-primary)] transition-all duration-200 ease-linear shadow-[0_0_10px_rgba(212,0,0,0.5)]" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="flex justify-between items-end">
                            <div className="text-[var(--theme-primary)] font-bold">{speed}</div>
                            <div className="text-xs text-gray-400">{activeStreams} streams</div>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6">
                    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full border border-gray-100 text-center space-y-4">
                        <ShieldAlert className="w-12 h-12 text-[var(--theme-primary)] mx-auto" />
                        <h3 className="text-xl font-bold">Error</h3>
                        <p className="text-gray-600">{error}</p>
                        {error !== "宛名が見つかりませんでした" && (
                            <button onClick={() => window.location.reload()} className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-black">Reload</button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
