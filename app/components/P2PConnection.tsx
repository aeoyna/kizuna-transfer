"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    Copy, CheckCircle2, FileIcon, Download, Upload, XCircle, Loader2, HardDrive, Zap,
    CalendarClock, KeyRound, ArrowRight, Terminal, Share2, Mail, Twitter, ShieldAlert,
    QrCode, Users, Play, Plus, BookOpen, HelpCircle, Lock, Unlock, Globe, Package, UploadCloud
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

    // Connection Lock
    const [isLocked, setIsLocked] = useState(false);
    const isLockedRef = useRef(false); // Ref for immediate access in callbacks

    // Password Protection
    const [isPasswordEnabled, setIsPasswordEnabled] = useState(false);
    const [generatedPassword, setGeneratedPassword] = useState('');
    const passwordEnabledRef = useRef(false);
    const passwordRef = useRef('');

    // Receiver Auth State
    const [isAuthRequired, setIsAuthRequired] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [pendingKey, setPendingKey] = useState<string>('');

    const generateRandomPassword = useCallback(() => {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }, []);

    useEffect(() => {
        isLockedRef.current = isLocked;
    }, [isLocked]);

    useEffect(() => {
        passwordEnabledRef.current = isPasswordEnabled;
        if (isPasswordEnabled && !generatedPassword) {
            const pw = generateRandomPassword();
            setGeneratedPassword(pw);
            passwordRef.current = pw;
        }
    }, [isPasswordEnabled, generatedPassword, generateRandomPassword]);

    useEffect(() => {
        passwordRef.current = generatedPassword;
    }, [generatedPassword]);

    // --- Tab Close Prevention ---
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            const isSending = senderStats.isTransferring;
            const isReceiving = status === 'connected' && !!activeDownloadFile;

            if (isSending || isReceiving) {
                e.preventDefault();
                e.returnValue = ''; // Standard way to trigger the confirmation dialog
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [senderStats.isTransferring, status, activeDownloadFile]);

    // --- Helpers ---

    const addLog = useCallback((msg: string) => {
        const time = new Date().toLocaleTimeString();
        // Translate common logs to Japanese if they match specific patterns
        let translatedMsg = msg;
        if (msg.startsWith('Initializing PeerJS with ID:')) {
            translatedMsg = msg.replace('Initializing PeerJS with ID:', 'ID:') + ' で PeerJS を初期化しています';
        } else if (msg.startsWith('PeerJS Open. My ID:')) {
            translatedMsg = msg.replace('PeerJS Open. My ID:', 'PeerJS オープン。私のID:');
        } else if (msg.startsWith('Found interrupted transfer:')) {
            translatedMsg = msg.replace('Found interrupted transfer:', '中断された転送が見つかりました:');
        } else if (msg.startsWith('Connecting to')) {
            translatedMsg = msg.replace('Connecting to', '').replace('...', '') + ' に接続しています...';
        }

        const logMsg = `[${time}] ${translatedMsg}`;
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
                if (!window.showSaveFilePicker) {
                    throw new Error("Your browser does not support selective saving. Please use Chrome/Edge on Desktop.");
                }
                // @ts-ignore
                fileHandle = await window.showSaveFilePicker({ suggestedName: fileMeta.name });
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    addLog('User cancelled save.');
                } else {
                    addLog(`Save Error: ${err.message}`);
                    setError(err.message || 'File System API Error');
                }
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

        // Security: Check handle permission for resume cases
        if (fileHandle) {
            try {
                // @ts-ignore
                const permissionMode = { mode: 'readwrite' };
                // @ts-ignore
                if ((await fileHandle.queryPermission(permissionMode)) !== 'granted') {
                    addLog("Requesting file system permission...");
                    // @ts-ignore
                    if ((await fileHandle.requestPermission(permissionMode)) !== 'granted') {
                        addLog("Permission denied.");
                        setError("File permission denied. Please click download again to authorize.");
                        return;
                    }
                }
            } catch (err) {
                console.warn("Permission check failed", err);
            }
        }

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
                    if (passwordEnabledRef.current) {
                        conn.send({ type: 'auth_required' });
                        addLog(`Auth required for ${remotePeerId}`);
                    } else {
                        // @ts-ignore
                        conn.verified = true;
                        addLog(`Peer ${remotePeerId} verified.`);
                        conn.send({ type: 'handshake_ok' });
                    }
                    return;
                } else if (data.type === 'auth') {
                    if (data.password === passwordRef.current) {
                        // @ts-ignore
                        conn.verified = true;
                        addLog(`Peer ${remotePeerId} authenticated successfully.`);
                        conn.send({ type: 'handshake_ok' });
                    } else {
                        addLog(`Security: Incorrect password from ${remotePeerId}`);
                        conn.send({ type: 'auth_error' });
                        recordFailure();
                        // allow retry without closing connection
                    }
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
            if (data.type === 'auth_required') {
                setIsAuthRequired(true);
                return;
            }
            if (data.type === 'handshake_ok') {
                setIsAuthRequired(false);
                setAuthError(null);
                const activeConn = connectionsRef.current[0];
                if (activeConn) activeConn.send({ type: 'get_metadata' });
                return;
            }
            if (data.type === 'auth_error') {
                setAuthError(t('incorrectPassword'));
                return;
            }
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
                    // Wait for auth or handshake_ok from sender
                }
            });

            conn.on('data', (data: any) => handleData(data, conn.peer, conn));
            conn.on('error', (e: any) => addLog(`Stream ${i} Error: ${e}`));
        }

        setTimeout(() => {
            const hasAnyOpen = newConns.some(c => c.open);
            if (!hasAnyOpen && status === 'connecting') {
                addLog("Connection timeout.");
                setError(t('addressNotFound'));
                setInputKey('');
                setTimeout(() => {
                    setError(null);
                    setStatus('initializing');
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
                if (isLockedRef.current) {
                    addLog(`Security: Rejected connection from ${conn.peer} (Room Locked)`);
                    setTimeout(() => conn.send({ type: 'error', message: t('connectionRejected') }), 500);
                    setTimeout(() => conn.close(), 1000);
                    return;
                }

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
                if (savedState && savedState.peerId) {
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

                    // Auto-Connect on Resume
                    addLog(`Reconnecting to sender: ${key}`);
                    connectToPeer(key);
                } else if (savedState) {
                    // Stale or invalid state, clear it
                    clearTransferState();
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
        // Always generate a new key when files are added
        const newKey = Math.floor(100000 + Math.random() * 900000).toString();
        await initPeer(0, newKey);

        const shareUrl = `${baseUrl}/${newKey}`;

        const newFiles: HostedFile[] = files.map(file => {
            const newFileId = Math.random().toString(36).substring(7);
            addLog(`File added: ${file.name} (${file.size}). Key: ${newKey}`);

            return {
                id: newFileId,
                file,
                downloadUrl: shareUrl,
                downloads: 0,
                availableFrom: 0,
                transferKey: newKey
            };
        });

        // Update existing files with new key and append new files
        setHostedFiles(prev => {
            const updatedExisting = prev.map(f => ({
                ...f,
                downloadUrl: shareUrl,
                transferKey: newKey
            }));
            return [...updatedExisting, ...newFiles];
        });
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
                {isAuthRequired || incomingFiles.length > 0 || status === 'connecting' ? (
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
                        isAuthRequired={isAuthRequired}
                        authError={authError}
                        onVerifyPassword={(pw) => {
                            if (pw === '') {
                                setAuthError(null);
                                return;
                            }
                            connectionsRef.current.forEach(c => c.send({ type: 'auth', password: pw }));
                        }}
                        onReset={() => {
                            connectionsRef.current.forEach(c => c.close());
                            connectionsRef.current = [];
                            setActiveStreamCount(0);
                            setIncomingFiles([]);
                            setActiveDownloadFile(null);
                            setError(null);
                            setResumeHandle(null);
                            clearTransferState();
                            setStatus('initializing');
                            setInputKey('');
                            addLog("Connection cancelled by user.");
                        }}
                        onLog={addLog}
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
                        isLocked={isLocked}
                        onToggleLock={() => setIsLocked(!isLocked)}
                        password={generatedPassword}
                        passwordEnabled={isPasswordEnabled}
                        onLog={addLog}
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
                        isPasswordEnabled={isPasswordEnabled}
                        onTogglePassword={setIsPasswordEnabled}
                    />
                )}
            </div>

            <LogViewer logs={logs} />

        </div>
    );
}

// --- Sub Components ---

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
                    <span className="text-gray-500 text-[10px]">v2f904d0</span>
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
    isPasswordEnabled: boolean;
    onTogglePassword: (enabled: boolean) => void;
}

function InitialView({
    onFileSelect, onJoin, inputKey, setInputKey, error, isCaptchaActive, captcha, onCaptchaVerify,
    isPasswordEnabled, onTogglePassword
}: InitialViewProps) {
    const { t, language } = useLanguage();
    const [isDragging, setIsDragging] = useState(false);
    const [captchaInput, setCaptchaInput] = useState('');

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onFileSelect(files);
    };



    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-[var(--mac-bg)] text-[var(--mac-text)]">
            {/* Background Ambience */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-100 rounded-full blur-3xl opacity-40 animate-pulse" style={{ animationDuration: '8s' }} />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-100 rounded-full blur-3xl opacity-40 animate-pulse" style={{ animationDuration: '10s' }} />
            </div>

            {/* Top Bar */}
            <div className="absolute top-6 right-6 flex items-center gap-4 z-20">
                <LanguageSwitcher />
            </div>

            <div className="relative z-10 w-full max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-center gap-12 animate-fade-in-up">

                {/* Send Card (The Realistic Postbox) */}
                <div
                    className={`ios-postbox w-full max-w-sm aspect-[4/5] pt-12 pb-8 px-8 flex flex-col items-center text-center transition-all duration-300 cursor-pointer ${isDragging ? 'scale-105 ring-4 ring-yellow-400' : 'hover:translate-y-[-4px] hover:shadow-2xl'}`}
                    onClick={() => document.getElementById('file-input')?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                >
                    {/* Inner content wrapper */}
                    {/* Inner content wrapper */}
                    <div className="relative z-20 flex flex-col items-center w-full h-full">

                        {/* Top Icon & Title */}
                        <div className="mt-6 flex flex-col items-center">
                            {/* Package Icon */}
                            <div className={`w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-4 text-[#ff6b6b] transition-transform duration-300 ${isDragging ? 'scale-110 rotate-3' : ''}`}>
                                <Package size={32} strokeWidth={1.5} />
                            </div>

                            <h2 className="text-2xl font-bold text-gray-800 mb-2">{t('sendFiles')}</h2>
                            <p className="text-gray-500 text-sm">Secure P2P File Transfer</p>
                        </div>

                        {/* Dropzone */}
                        <div
                            className={`parcel-dropzone h-48 w-full flex flex-col items-center justify-center cursor-pointer transition-all duration-300 z-10
                            ${isDragging ? 'scale-[1.02] border-[#ff6b6b] bg-red-50/50' : 'hover:border-gray-400'}`}
                        >
                            <div className={`mb-3 text-[#ff6b6b] opacity-60 transition-transform duration-300 ${isDragging ? 'scale-110 -translate-y-1' : ''}`}>
                                <UploadCloud size={40} strokeWidth={1.5} />
                            </div>
                            <p className="text-[var(--mac-text)] font-medium text-sm mb-1">{t('clickOrDrag')}</p>
                            <span className="text-[10px] text-[var(--mac-text-secondary)] uppercase tracking-wider font-bold">
                                {isDragging ? 'Drop Files Here' : 'Drop Zone'}
                            </span>
                        </div>

                        <div className="h-6"></div> {/* Spacer */}

                        {/* Password Checkbox */}
                        <div
                            className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                onTogglePassword(!isPasswordEnabled);
                            }}
                        >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isPasswordEnabled ? 'bg-[#ff6b6b] border-[#ff6b6b]' : 'border-gray-300'}`}>
                                {isPasswordEnabled && <CheckCircle2 size={12} className="text-white" />}
                            </div>
                            <span className="text-sm font-medium text-gray-600">{t('requirePassword')}</span>
                        </div>

                        <div className="h-4"></div>
                    </div>

                    <input
                        id="file-input"
                        type="file"
                        className="hidden"
                        multiple
                        onChange={(e) => e.target.files && e.target.files.length > 0 && onFileSelect(Array.from(e.target.files))}
                    />
                </div>

                {/* Receive Card (Glass Card) */}
                <div className="ios-card-glass w-full max-w-sm p-8 flex flex-col items-center gap-6">
                    <div className="text-center">
                        <Download size={40} className="mx-auto text-[var(--mac-accent)] mb-4" />
                        <h2 className="text-2xl font-bold text-[var(--mac-text)] mb-2">{t('receiveFiles')}</h2>
                        <p className="text-[var(--mac-text-secondary)] text-sm">{t('enterCode')}</p>
                    </div>

                    <div className="w-full space-y-6">
                        {/* Postal Code Display */}
                        <div className="flex items-center justify-center gap-2">
                            <div className="flex gap-1">
                                {[0, 1, 2].map((i) => (
                                    <div
                                        key={i}
                                        className={`w-10 h-14 border-2 rounded-md flex items-center justify-center text-2xl font-bold bg-white transition-all duration-200 ${inputKey.length === i ? 'border-[#cc0000] ring-4 ring-red-50 scale-105 z-10' : 'border-red-200'} ${inputKey[i] ? 'text-gray-900 border-[#cc0000]' : 'text-gray-300'}`}
                                    >
                                        {inputKey[i] || ''}
                                    </div>
                                ))}
                            </div>
                            <div className="text-2xl font-bold text-red-300">-</div>
                            <div className="flex gap-1">
                                {[3, 4, 5].map((i) => (
                                    <div
                                        key={i}
                                        className={`w-10 h-14 border-2 rounded-md flex items-center justify-center text-2xl font-bold bg-white transition-all duration-200 ${inputKey.length === i ? 'border-[#cc0000] ring-4 ring-red-50 scale-105 z-10' : 'border-red-200'} ${inputKey[i] ? 'text-gray-900 border-[#cc0000]' : 'text-gray-300'}`}
                                    >
                                        {inputKey[i] || ''}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Numpad */}
                        <div className="grid grid-cols-3 gap-2">
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
                                    className="mac-button-secondary h-12 rounded-lg font-bold"
                                >
                                    {n}
                                </button>
                            ))}
                            <button onClick={() => setInputKey('')} className="mac-button h-12 rounded-lg font-bold text-xs">CLR</button>
                            <button
                                onClick={() => {
                                    if (inputKey.length < 6) {
                                        const newVal = inputKey + '0';
                                        setInputKey(newVal);
                                        if (newVal.length === 6) onJoin(newVal);
                                    }
                                }}
                                className="mac-button-secondary h-12 rounded-lg font-bold"
                            >
                                0
                            </button>
                            <button
                                onClick={() => setInputKey(inputKey.slice(0, -1))}
                                className="mac-button-secondary h-12 rounded-lg font-bold flex items-center justify-center"
                            >
                                <ArrowRight className="rotate-180" size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div >

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
            )
            }

            {/* P2P Explanation Section - At Bottom */}
            <div className="w-full max-w-4xl bg-white/50 backdrop-blur-sm rounded-3xl p-8 border border-gray-100 shadow-sm mt-12 mb-8">
                <h4 className="font-bold text-lg mb-4 flex items-center gap-2 justify-center">
                    <Share2 size={20} className="text-[var(--mac-accent)]" />
                    {t('p2pTitle')}
                </h4>
                <p className="text-sm text-gray-600 mb-8 leading-relaxed text-center max-w-2xl mx-auto">
                    {t('p2pDesc')}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                        <h5 className="font-bold text-xs uppercase tracking-wider text-[var(--mac-accent)] mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[var(--mac-accent)]" />
                            {t('p2pMerits')}
                        </h5>
                        <ul className="space-y-3">
                            <li className="flex items-start gap-3 text-sm text-gray-700">
                                <div className="min-w-5 h-5 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                                    <CheckCircle2 size={12} className="text-green-600" />
                                </div>
                                <span className="font-medium">{t('merit1')}</span>
                            </li>
                            <li className="flex items-start gap-3 text-sm text-gray-700">
                                <div className="min-w-5 h-5 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                                    <CheckCircle2 size={12} className="text-green-600" />
                                </div>
                                <span className="font-medium">{t('merit2')}</span>
                            </li>
                            <li className="flex items-start gap-3 text-sm text-gray-700">
                                <div className="min-w-5 h-5 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                                    <CheckCircle2 size={12} className="text-green-600" />
                                </div>
                                <span className="font-medium">{t('merit3')}</span>
                            </li>
                        </ul>
                    </div>
                    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                        <h5 className="font-bold text-xs uppercase tracking-wider text-orange-500 mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-orange-500" />
                            {t('p2pDemerits')}
                        </h5>
                        <ul className="space-y-3">
                            <li className="flex items-start gap-3 text-sm text-gray-700">
                                <div className="min-w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center mt-0.5">
                                    <ShieldAlert size={12} className="text-orange-500" />
                                </div>
                                <span className="font-medium">{t('demerit1')}</span>
                            </li>
                            <li className="flex items-start gap-3 text-sm text-gray-700">
                                <div className="min-w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center mt-0.5">
                                    <ShieldAlert size={12} className="text-orange-500" />
                                </div>
                                <span className="font-medium">{t('demerit2')}</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div >
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
    isLocked: boolean;
    onToggleLock: () => void;
    password?: string;
    passwordEnabled?: boolean;
    onLog?: (msg: string) => void;
}

function SenderView({
    hostedFiles, activeStreams, onSchedule, onAddFile, senderStats, peerDiffs, onStopPeer,
    isLocked, onToggleLock, password, passwordEnabled, onLog
}: SenderViewProps) {
    const { t } = useLanguage();
    const mainFile = hostedFiles[0];
    const [isSharing, setIsSharing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const handleCopyLink = async () => {
        try {
            if (mainFile && mainFile.downloadUrl) {
                await navigator.clipboard.writeText(mainFile.downloadUrl);
                setIsSharing(true);
                setTimeout(() => setIsSharing(false), 2000);
            }
        } catch (err) {
            onLog?.(`Copy failed: ${err}`);
            alert("Copy failed. Please copy manually.");
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onAddFile(files);
    };

    return (
        <div className="min-h-screen bg-[var(--mac-bg)] text-[var(--mac-text)] p-6 flex flex-col items-center relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-green-100 rounded-full blur-3xl opacity-40 animate-pulse" style={{ animationDuration: '8s' }} />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-100 rounded-full blur-3xl opacity-40 animate-pulse" style={{ animationDuration: '10s' }} />
            </div>

            {/* Header */}
            <div className="relative z-10 w-full max-w-4xl flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[var(--mac-accent)] rounded-2xl flex items-center justify-center shadow-lg">
                        <Upload className="text-white" size={24} />
                    </div>
                    <div>
                        <div className="text-lg font-bold text-[var(--mac-text)]">{t('activeShare')}</div>
                        <div className="text-sm text-[var(--mac-text-secondary)]">{hostedFiles.length} {t('lettersToSend')}</div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${activeStreams > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        <div className={`w-2 h-2 rounded-full ${activeStreams > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                        <span className="text-sm font-medium">{activeStreams} {t('activePeers')}</span>
                    </div>
                    <button
                        onClick={onToggleLock}
                        className={`p-3 rounded-xl transition-all ${isLocked ? 'bg-red-500 text-white shadow-lg' : 'bg-white/80 text-gray-600 hover:bg-white shadow'}`}
                        title={isLocked ? t('unlockRoom') : t('lockRoom')}
                    >
                        {isLocked ? <Lock size={20} /> : <Unlock size={20} />}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="relative z-10 w-full max-w-4xl grid md:grid-cols-2 gap-8">
                {/* Share Card */}
                <div className="ios-card-glass p-8 flex flex-col items-center">
                    {isLocked && (
                        <div className="absolute top-4 left-4 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                            <Lock size={12} /> {t('roomLocked')}
                        </div>
                    )}

                    <div className="text-center mb-6">
                        <p className="text-sm text-[var(--mac-text-secondary)] font-medium uppercase tracking-wider mb-2">{t('postalCode')}</p>
                        <h1 className="text-5xl font-bold tracking-wider text-[var(--mac-text)] font-mono">
                            {mainFile.transferKey.slice(0, 3)}-{mainFile.transferKey.slice(3)}
                        </h1>
                        {passwordEnabled && password && (
                            <div className="mt-4 animate-fade-in">
                                <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-1">{t('password')}</p>
                                <div className="inline-block bg-white border border-red-100 rounded-lg px-4 py-2 shadow-sm">
                                    <span className="text-2xl font-mono font-bold text-gray-800 tracking-wider">
                                        {password}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={`bg-white p-3 rounded-2xl shadow-lg mb-6 transition-all ${isLocked ? 'opacity-50 grayscale' : ''}`}>
                        {mainFile?.downloadUrl && <QRCodeSVG value={mainFile.downloadUrl} className="w-40 h-40" />}
                        {isLocked && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Lock size={48} className="text-gray-400" />
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleCopyLink}
                        disabled={isLocked}
                        className={`mac-button w-full flex items-center justify-center gap-2 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isSharing ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                        {isSharing ? t('linkCopied') : t('copyAddress')}
                    </button>
                </div>

                {/* Add More + File List */}
                <div className="space-y-6">
                    {/* Add More Card */}
                    <div
                        className={`ios-card-glass p-6 flex items-center justify-center gap-4 cursor-pointer hover:scale-[1.02] transition-transform ${isDragging ? 'ring-4 ring-[var(--mac-accent)]' : ''}`}
                        onClick={() => document.getElementById('add-file-input')?.click()}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                    >
                        <div className="w-12 h-12 bg-[var(--mac-accent)]/10 rounded-xl flex items-center justify-center">
                            <Plus size={24} className="text-[var(--mac-accent)]" />
                        </div>
                        <div>
                            <div className="font-bold text-[var(--mac-text)]">{t('postMore')}</div>
                            <div className="text-sm text-[var(--mac-text-secondary)]">{t('dropAdditional')}</div>
                        </div>
                        <input id="add-file-input" type="file" multiple className="hidden" onChange={(e) => e.target.files && e.target.files.length > 0 && onAddFile(Array.from(e.target.files))} />
                    </div>

                    {/* File List */}
                    <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                        {hostedFiles.map((file, idx) => (
                            <div key={file.id} className="bg-white/80 backdrop-blur-sm p-4 rounded-xl shadow-sm border border-white/50 flex items-center gap-4 hover:shadow-md transition-shadow">
                                <div className="w-10 h-10 bg-[var(--mac-accent)]/10 rounded-xl flex items-center justify-center text-[var(--mac-accent)] font-bold">
                                    {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-[var(--mac-text)] truncate">{file.file.name}</h4>
                                    <p className="text-xs text-[var(--mac-text-secondary)]">{(file.file.size / 1024 / 1024).toFixed(1)} MB</p>
                                </div>
                                <Mail size={20} className="text-gray-300" />
                            </div>
                        ))}
                    </div>

                    {/* Transfer Progress */}
                    {senderStats.isTransferring && (
                        <div className="ios-card-glass p-6">
                            <div className="flex justify-between text-sm font-medium mb-3">
                                <span className="text-[var(--mac-accent)]">Sending...</span>
                                <span className="text-[var(--mac-text-secondary)]">ETA: {senderStats.eta}</span>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                                <div className="h-full bg-[var(--mac-accent)] transition-all duration-300" style={{ width: `${senderStats.progress}%` }} />
                            </div>
                            <div className="text-right text-[var(--mac-accent)] font-bold text-sm mb-2">{senderStats.speed}</div>
                            <div className="mt-4 p-3 bg-red-50 rounded-xl border border-red-100 animate-pulse">
                                <p className="text-xs text-red-600 font-bold text-center flex items-center justify-center gap-1">
                                    <ShieldAlert size={14} /> {t('doNotCloseTab')}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
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
    isAuthRequired?: boolean;
    authError?: string | null;
    onVerifyPassword?: (password: string) => void;
    onReset?: () => void;
    onLog?: (msg: string) => void;
}

function ReceiverView({
    status, files, activeFile, progress, speed, activeStreams, error, onStartDownload, onDownloadAll,
    countdown, inputKey, isResume, isAuthRequired, authError, onVerifyPassword, onReset, onLog
}: ReceiverViewProps) {
    const { t } = useLanguage();
    const [passwordInput, setPasswordInput] = useState('');

    if (isAuthRequired) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--mac-bg)] p-6 relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-red-100 rounded-full blur-3xl opacity-40 animate-pulse" style={{ animationDuration: '8s' }} />
                </div>
                <div className="relative z-10 w-full max-w-md flex flex-col items-center animate-fade-in">
                    <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 text-[#ff6b6b] shadow-inner">
                        <Lock size={32} strokeWidth={1.5} />
                    </div>
                    <h2 className="text-2xl font-bold text-[var(--mac-text)] mb-2">{t('securityCheck')}</h2>
                    <p className="text-[var(--mac-text-secondary)] text-sm mb-8">{t('enterPassword')}</p>

                    <div className="w-full space-y-4">
                        <div className="relative">
                            <input
                                type="text"
                                value={passwordInput}
                                onChange={(e) => {
                                    setPasswordInput(e.target.value);
                                    if (authError) onVerifyPassword?.(''); // Send empty to signal clearing error on parent if we want, or better:
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && onVerifyPassword?.(passwordInput)}
                                className={`w-full bg-white border-2 ${authError ? 'border-red-400' : 'border-gray-200'} rounded-2xl px-6 py-4 text-center text-xl font-mono font-bold focus:border-[#ff6b6b] outline-none shadow-sm transition-all`}
                                placeholder="8 Characters"
                                maxLength={20}
                                autoFocus
                            />
                            {authError && <p className="text-red-500 text-xs font-bold mt-2 text-center">{authError}</p>}
                        </div>

                        <button
                            onClick={() => onVerifyPassword?.(passwordInput)}
                            className="w-full mac-button bg-[#ff6b6b] hover:bg-red-500 text-white flex items-center justify-center gap-2 py-4"
                        >
                            <ArrowRight size={20} />
                            {t('verify')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (status === 'connecting' && files.length === 0) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--mac-bg)] p-6 relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-100 rounded-full blur-3xl opacity-40 animate-pulse" style={{ animationDuration: '8s' }} />
                </div>
                <div className="relative z-10 w-full max-w-md flex flex-col items-center animate-fade-in">
                    <div className="w-16 h-16 bg-white/50 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6 text-[var(--mac-accent)] shadow-sm">
                        <Loader2 size={32} strokeWidth={1.5} className="animate-spin" />
                    </div>
                    <h2 className="text-xl font-bold text-[var(--mac-text)] mb-2">Connecting...</h2>
                    <p className="text-[var(--mac-text-secondary)] text-sm italic mb-8">Establishing secure P2P link</p>

                    <button
                        onClick={onReset}
                        className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest"
                    >
                        <XCircle size={14} /> {t('cancelConnection')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--mac-bg)] p-6 relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-100 rounded-full blur-3xl opacity-40 animate-pulse" style={{ animationDuration: '8s' }} />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-100 rounded-full blur-3xl opacity-40 animate-pulse" style={{ animationDuration: '10s' }} />
            </div>

            <div className="relative z-10 w-full max-w-4xl flex flex-col items-center">
                {/* Header */}
                <div className="mb-8 text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-[var(--mac-accent)] to-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl">
                        <Download size={36} className="text-white" />
                    </div>
                    <h2 className="text-3xl font-bold text-[var(--mac-text)] mb-2">{t('receiveFiles')}</h2>
                    <p className="text-[var(--mac-text-secondary)] mb-4">From: <span className="font-mono font-bold">{inputKey.slice(0, 3)}-{inputKey.slice(3)}</span></p>

                    <button
                        onClick={onReset}
                        className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest mx-auto"
                    >
                        <XCircle size={14} /> {t('cancelConnection')}
                    </button>
                </div>

                {/* Download All Button */}
                {files.length > 1 && onDownloadAll && (
                    <button
                        onClick={onDownloadAll}
                        className="mb-8 mac-button flex items-center gap-2 shadow-lg hover:scale-105 transition-transform"
                    >
                        <Download size={20} /> Download All
                    </button>
                )}

                {/* File Cards */}
                <div className="w-full grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[50vh] overflow-y-auto p-2">
                    {files.map((file) => (
                        <div key={file.id} className="ios-card-glass p-5 flex flex-col justify-between hover:shadow-lg transition-shadow">
                            <div>
                                <div className="flex justify-between items-start mb-3">
                                    <div className="w-10 h-10 bg-[var(--mac-accent)]/10 rounded-xl flex items-center justify-center">
                                        <FileIcon size={20} className="text-[var(--mac-accent)]" />
                                    </div>
                                    {activeFile?.id === file.id && status === 'connected' && (
                                        <div className="flex items-center gap-1 text-xs font-bold text-[var(--mac-accent)] animate-pulse">
                                            <Loader2 size={12} className="animate-spin" /> Downloading...
                                        </div>
                                    )}
                                    {status === 'waiting_for_save' && activeFile?.id === file.id && (
                                        <div className="bg-green-100 text-green-700 font-bold px-2 py-1 text-xs rounded-full flex items-center gap-1">
                                            <CheckCircle2 size={12} /> Done
                                        </div>
                                    )}
                                </div>
                                <h3 className="font-bold text-[var(--mac-text)] truncate mb-1">{file.name}</h3>
                                <p className="text-xs text-[var(--mac-text-secondary)]">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                            </div>

                            <button
                                onClick={() => onStartDownload(file)}
                                disabled={status === 'connected' || (activeFile !== null && activeFile.id !== file.id)}
                                className={`w-full mt-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
                                    ${activeFile?.id === file.id ? 'bg-gray-100 text-gray-400' : 'mac-button'}`}
                            >
                                {activeFile?.id === file.id ? (status === 'connected' ? 'Downloading...' : 'Starting...') : (
                                    <><Download size={16} /> Download</>
                                )}
                            </button>
                        </div>
                    ))}
                </div>

                {/* Transfer Progress */}
                {status === 'connected' && activeFile && (
                    <div className="mt-8 w-full max-w-md ios-card-glass p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-[var(--mac-accent)]/10 rounded-xl flex items-center justify-center">
                                <Loader2 size={20} className="text-[var(--mac-accent)] animate-spin" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-[var(--mac-text)] truncate">{activeFile.name}</h4>
                                <p className="text-xs text-[var(--mac-text-secondary)]">{activeStreams} parallel streams</p>
                            </div>
                        </div>
                        <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
                            <div className="h-full bg-gradient-to-r from-[var(--mac-accent)] to-blue-500 transition-all duration-200" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="flex justify-between text-sm mb-4">
                            <span className="text-[var(--mac-text-secondary)]">{Math.round(progress)}%</span>
                            <span className="text-[var(--mac-accent)] font-bold">{speed}</span>
                        </div>
                        <div className="p-3 bg-red-50 rounded-xl border border-red-100 animate-pulse">
                            <p className="text-xs text-red-600 font-bold text-center flex items-center justify-center gap-1">
                                <ShieldAlert size={14} /> {t('doNotCloseTab')}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Error Modal */}
            {error && (
                <div className="absolute inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                    <div className="ios-card-glass p-8 max-w-md w-full text-center">
                        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <ShieldAlert size={32} className="text-red-500" />
                        </div>
                        <h3 className="text-xl font-bold text-[var(--mac-text)] mb-2">Connection Error</h3>
                        <p className="text-[var(--mac-text-secondary)] mb-6">{error}</p>
                        {error !== "宛名が見つかりませんでした" && (
                            <div className="flex flex-col gap-2 w-full mt-6">
                                <button onClick={() => window.location.reload()} className="mac-button w-full">
                                    Retry
                                </button>
                                <button
                                    onClick={async () => {
                                        localStorage.clear();
                                        await clearTransferState();
                                        window.location.href = '/';
                                    }}
                                    className="text-xs text-gray-400 hover:text-red-500 transition-colors py-2"
                                >
                                    Reset App Data (Clear Cache)
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
