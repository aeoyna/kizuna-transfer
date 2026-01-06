"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    Copy, CheckCircle2, FileIcon, Download, Upload, XCircle, Loader2, HardDrive, Zap,
    CalendarClock, KeyRound, ArrowRight, Terminal, Share2, Mail, Twitter, ShieldAlert,
    QrCode, Users, Play
} from 'lucide-react';
import type { DataConnection } from 'peerjs';
import { QRCodeSVG } from 'qrcode.react';

// バージョン情報
const APP_VERSION = "v2.9.0 (Rich Share UI)";

// 設定値
const PARALLEL_STREAMS = 5;
const CHUNK_SIZE = 16 * 1024;
const BUFFER_THRESHOLD = 256 * 1024;
const ID_PREFIX = 'kizuna-transfer-v2-';

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

    const [senderStats, setSenderStats] = useState<{ speed: string; eta: string; isTransferring: boolean, progress: number }>({ speed: '', eta: '', isTransferring: false, progress: 0 });
    const [peerDiffs, setPeerDiffs] = useState<{ [id: string]: { name: string, progress: number, speed: string } }>({});


    // Security & Captcha
    const [isCaptchaActive, setIsCaptchaActive] = useState(false);
    const [captcha, setCaptcha] = useState({ q: '', a: '' });
    const failedAttemptsRef = useRef(0);

    // デバッグログ用
    const [logs, setLogs] = useState<string[]>([]);

    const peerRef = useRef<any>(null);
    const connectionsRef = useRef<DataConnection[]>([]);
    const hostedFilesRef = useRef<HostedFile[]>([]);
    const incomingDataRef = useRef<TransferState | null>(null);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // ログ追加関数
    // ログ追加関数
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

    const downloadFile = (blob: Blob, fileName: string) => {
        addLog(`Saving file via Blob: ${fileName}`);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // 並列送信ロジック
    const sendFileParallel = async (file: File, targetPeerId: string, startOffset: number = 0, availableFrom?: number) => {
        addLog(`Attempting to send: ${file.name} to ${targetPeerId}`);

        let conns = connectionsRef.current.filter(c => c.open && c.peer === targetPeerId);

        if (conns.length === 0) {
            addLog(`Target ${targetPeerId} not found. Broadcasting to ALL active connections.`);
            conns = connectionsRef.current.filter(c => c.open);
        }

        if (conns.length === 0) {
            addLog("ERROR: No active connections found. Aborting transfer.");
            setError("No active connections.");
            return;
        }

        if (availableFrom && Date.now() < availableFrom) {
            addLog(`Transfer scheduled for ${new Date(availableFrom).toLocaleTimeString()}`);
            conns[0].send({ type: 'transfer_scheduled', time: availableFrom, fileName: file.name });
            const delay = availableFrom - Date.now();
            setTimeout(() => sendFileParallel(file, targetPeerId, startOffset), delay);
            return;
        }

        await requestWakeLock();
        addLog(`Starting transfer via ${conns.length} streams.`);

        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        let chunkIndex = Math.floor(startOffset / CHUNK_SIZE);
        const startTime = Date.now();

        conns[0].send({
            type: 'file_start',
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            totalChunks: totalChunks,
            startOffset: startOffset
        });

        const fileReader = new FileReader();
        fileReader.onerror = (e) => addLog(`FileReader Error: ${fileReader.error}`);

        const readNextChunk = () => {
            // Check if transfer is done (or close to done) to reset stats eventually
            if (chunkIndex >= totalChunks) return;
            const offset = chunkIndex * CHUNK_SIZE;
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            fileReader.readAsArrayBuffer(slice);
        };

        fileReader.onload = async (e) => {
            if (!e.target?.result) return;
            const chunkData = e.target.result as ArrayBuffer;
            const currentIdx = chunkIndex;
            chunkIndex++;

            // Calculate Stats
            const connIndex = currentIdx % conns.length;
            const conn = conns[connIndex];

            // Per-connection stats tracking
            // Note: In a true round-robin parallel split to ONE receiver, this 'progress' is just their slice.
            // If broadcasting to multiple receivers, logic would need to be different (sending all chunks to all).
            // For now, assuming visualize existing streams.

            // Just for visualization, we roughly estimate per-stream progress based on total * (1/streams) assumption or just their chunk count
            // Let's track chunks sent per conn
            // @ts-ignore
            if (!conn.chunksSent) conn.chunksSent = 0;
            // @ts-ignore
            conn.chunksSent++;

            if (currentIdx % 20 === 0 || currentIdx === totalChunks - 1) {
                const now = Date.now();
                const elapsed = (now - startTime) / 1000;

                if (elapsed > 0.5) {
                    const bytesSent = currentIdx * CHUNK_SIZE;
                    const speedBytes = bytesSent / elapsed;
                    const remainingBytes = file.size - bytesSent;
                    const etaSeconds = remainingBytes / speedBytes;

                    const speedStr = `${(speedBytes / 1024 / 1024).toFixed(1)} MB/s`;
                    const etaStr = etaSeconds > 60
                        ? `${Math.floor(etaSeconds / 60)}m ${Math.floor(etaSeconds % 60)}s`
                        : `${Math.floor(etaSeconds)}s`;

                    setSenderStats({
                        speed: speedStr,
                        eta: etaStr,
                        isTransferring: true,
                        progress: (currentIdx / totalChunks) * 100
                    });

                    // Update Peer Diffs
                    setPeerDiffs(prev => {
                        const next = { ...prev };
                        conns.forEach(c => {
                            // @ts-ignore
                            const cSent = c.chunksSent || 0;
                            // Estimate progress relative to what this stream IS EXPECTED to do (1/N of total) ?? 
                            // Or just make it look good relative to Total File? 
                            // Let's show "Contribution to Total" for now, or scaled 0-100 for "Activity"
                            // If we want "Opponent Progress", and it's 1 file split, they finish together.
                            // Let's show (ChunksSent / (TotalChunks/Conns)) * 100
                            const fairShare = totalChunks / conns.length;
                            const p = Math.min(100, (cSent / fairShare) * 100);

                            next[c.peer] = {
                                name: `Peer ${c.peer.slice(0, 4)}...`, // Or custom name if we had it
                                progress: p,
                                speed: speedStr // Sharing global speed for now as per-stream calc is noisy
                            };
                        });
                        return next;
                    });
                }
            }

            // @ts-ignore
            if (conn.dataChannel?.bufferedAmount > BUFFER_THRESHOLD) {
                const waitStart = Date.now();
                // @ts-ignore
                while (conn.dataChannel?.bufferedAmount > BUFFER_THRESHOLD) {
                    if (Date.now() - waitStart > 1000) {
                        break;
                    }
                    await new Promise(r => setTimeout(r, 10));
                }
            }

            try {
                conn.send({ type: 'chunk', index: currentIdx, data: chunkData });
            } catch (err) {
                addLog(`Send Error on stream ${connIndex}: ${err}`);
            }

            if (chunkIndex < totalChunks) {
                readNextChunk();
            } else {
                addLog("All chunks sent. Sending file_end.");
                setSenderStats(prev => ({ ...prev, isTransferring: false, progress: 100 }));
                setTimeout(() => {
                    conns[0].send({ type: 'file_end' });
                    setHostedFiles(prev => prev.map(f => f.file.name === file.name ? { ...f, downloads: f.downloads + 1 } : f));
                    releaseWakeLock();
                }, 500);
            }
        };
        readNextChunk();
    };

    // クリーンアップ処理 (ロック解放)
    const cleanupTransfer = async () => {
        const state = incomingDataRef.current;
        if (!state) return;

        try {
            if (state.writable) {
                addLog("Closing file stream...");
                await state.writable.close();
                addLog("File stream closed.");
            }
        } catch (e) {
            addLog(`Error closing stream: ${e}`);
        }

        await releaseWakeLock();
        incomingDataRef.current = null;
        setStatus('ready');
    };

    // 受信開始処理
    const startDownload = async () => {
        if (!incomingFile || !incomingDataRef.current) return;
        addLog(`Starting download: ${incomingFile.name}`);

        try {
            let offset = 0;
            let fileHandle;
            let writable;

            // @ts-ignore
            if (window.showSaveFilePicker) {
                try {
                    // @ts-ignore
                    fileHandle = await window.showSaveFilePicker({ suggestedName: incomingFile.name });
                    addLog("File handle obtained.");
                    const fileData = await fileHandle.getFile();

                    if (fileData.size > 0) {
                        if (confirm(`File "${fileData.name}" exists. Resume download?`)) {
                            offset = fileData.size;
                            addLog(`Resuming from offset: ${offset}`);
                            writable = await fileHandle.createWritable({ keepExistingData: true });
                            await writable.seek(offset);
                        } else {
                            addLog("Overwriting: Truncating file content...");
                            writable = await fileHandle.createWritable({ keepExistingData: true });
                            await writable.truncate(0);
                            addLog("File truncated to 0 bytes.");
                        }
                    } else {
                        writable = await fileHandle.createWritable();
                    }

                    incomingDataRef.current.fileHandle = fileHandle;
                    incomingDataRef.current.writable = writable;

                } catch (e: any) {
                    if (e.name === 'AbortError') {
                        addLog("Save cancelled by user.");
                        return;
                    }
                    throw e;
                }
            } else {
                addLog("FileSystem Access API not supported. Using memory buffer.");
                incomingDataRef.current.chunks = new Array(incomingDataRef.current.totalChunks);
            }

            setStatus('connected');
            await requestWakeLock();

            // ファイル要求
            requestFile(offset);

        } catch (err: any) {
            addLog(`Start Download Error: ${err}`);
            setError('Failed to save file.');
            await cleanupTransfer();
        }
    };

    const requestFile = (offset: number) => {
        const activeConn = connectionsRef.current.find(c => c.open);
        if (activeConn) {
            addLog(`Requesting file from ${activeConn.peer} (offset: ${offset})`);
            activeConn.send({ type: 'request_file', fileName: incomingFile?.name, offset: offset });
        } else {
            addLog("ERROR: No active connection to sender.");
            setError("No active connection to sender.");
        }
    };

    const connectToPeer = async (key: string) => {
        if (!peerRef.current) return;

        setStatus('connecting');
        const targetPeerId = ID_PREFIX + key;
        addLog(`Connecting to ${targetPeerId}...`);

        const newConns: DataConnection[] = [];
        let connectedCount = 0;

        for (let i = 0; i < PARALLEL_STREAMS; i++) {
            const conn = peerRef.current.connect(targetPeerId, { reliable: true, label: `stream-${i}` });
            newConns.push(conn);

            conn.on('open', () => {
                connectedCount++;
                addLog(`Stream ${i} connected.`);
                setActiveStreamCount(connectedCount);

                if (connectedCount === PARALLEL_STREAMS) {
                    connectionsRef.current = newConns;
                    addLog("All streams connected. Requesting metadata.");
                    newConns[0].send({ type: 'get_metadata' });
                }
            });

            conn.on('data', (data: any) => handleData(data, conn.peer));
            conn.on('error', (e: any) => {
                addLog(`Stream ${i} Error: ${e}`);
            });

            conn.on('close', () => {
                addLog(`Stream ${i} closed.`);
                connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
                setActiveStreamCount(connectionsRef.current.length);
            });
        }
    };

    const handleData = async (data: any, remotePeerId: string) => {
        if (data.type !== 'chunk') {
            addLog(`Received data: ${data.type} from ${remotePeerId}`);
        }

        try {
            if (data.type === 'metadata') {
                setIncomingFile({
                    name: data.fileName,
                    size: data.fileSize,
                    peerId: data.peerId
                });
                setStatus('waiting_for_save');
                incomingDataRef.current = {
                    fileName: data.fileName,
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
                    } else {
                        addLog(`Could not send metadata: No active connection to ${remotePeerId}`);
                    }
                }
            }
            else if (data.type === 'transfer_scheduled') {
                setStatus('scheduled');
                if (incomingDataRef.current) incomingDataRef.current.scheduledTime = data.time;
            }
            else if (data.type === 'file_start') {
                setStatus('connected');
                if (incomingDataRef.current) {
                    incomingDataRef.current.totalChunks = data.totalChunks;
                    incomingDataRef.current.startTime = Date.now();
                    incomingDataRef.current.isFinished = false;
                    if (data.startOffset > 0) incomingDataRef.current.receivedChunks = Math.floor(data.startOffset / CHUNK_SIZE);
                    if (!incomingDataRef.current.writable && !incomingDataRef.current.chunks) incomingDataRef.current.chunks = new Array(data.totalChunks);
                }
                setProgress(0);
            }
            else if (data.type === 'chunk') {
                const state = incomingDataRef.current;
                if (!state || state.isFinished) return;

                try {
                    // Check if writable is valid and not closed
                    if (state.writable && !state.writable.locked) {
                        await state.writable.write({ type: 'write', position: data.index * CHUNK_SIZE, data: data.data });
                    } else if (state.chunks) {
                        state.chunks[data.index] = data.data;
                    }
                } catch (e: any) {
                    // Ignore errors if we are finished or stream is closing
                    if (state.isFinished || e.message?.includes('closing') || e.name === 'TypeError') {
                        return;
                    }
                    addLog(`Write Error: ${e}`);
                    setError(`Write Error: ${e}`);
                    await cleanupTransfer();
                    return;
                }

                state.receivedChunks++;

                if (state.receivedChunks % 50 === 0 || state.receivedChunks === state.totalChunks) {
                    setProgress((state.receivedChunks / state.totalChunks) * 100);
                    const elapsed = (Date.now() - state.startTime) / 1000;
                    if (elapsed > 0.5) setTransferSpeed(`${((state.receivedChunks * CHUNK_SIZE) / elapsed / 1024 / 1024).toFixed(1)} MB/s`);
                }
            }
            else if (data.type === 'file_end') {
                addLog("File transfer finished.");
                const state = incomingDataRef.current;
                if (!state || state.isFinished) return;

                state.isFinished = true; // Mark as finished

                if (state.chunks) {
                    downloadFile(new Blob(state.chunks), state.fileName);
                    await cleanupTransfer();
                    alert('Download Complete!');
                } else {
                    await cleanupTransfer();
                    alert('Download Complete!');
                }

                setProgress(100);
                setTransferSpeed('Complete');
            }
            else if (data.type === 'request_file') {
                addLog(`Peer ${remotePeerId} requested file.`);
                const f = hostedFilesRef.current.find(h => h.file.name === data.fileName);
                if (f) sendFileParallel(f.file, remotePeerId, data.offset || 0, f.availableFrom);
            }
        } catch (err) {
            addLog(`HandleData Error: ${err}`);
            await cleanupTransfer();
        }
    };

    useEffect(() => {
        if (status === 'scheduled' && incomingDataRef.current?.scheduledTime) {
            timerRef.current = setInterval(() => {
                const diff = incomingDataRef.current!.scheduledTime! - Date.now();
                if (diff <= 0) {
                    setCountdown("Starting...");
                    clearInterval(timerRef.current!);
                } else {
                    const h = Math.floor(diff / 3600000);
                    const m = Math.floor((diff % 3600000) / 60000);
                    const s = Math.floor((diff % 60000) / 1000);
                    setCountdown(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
                }
            }, 1000);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [status]);

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

    const setupConnection = useCallback((conn: DataConnection) => {
        connectionsRef.current.push(conn);
        const count = connectionsRef.current.length;
        setActiveStreamCount(count);
        conn.on('data', (data: any) => handleData(data, conn.peer));
        conn.on('close', () => {
            addLog(`Connection closed: ${conn.peer}`);
            connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
            setActiveStreamCount(connectionsRef.current.length);
        });
    }, [addLog, handleData]); // Dependencies for useCallback

    const initPeer = useCallback(async (retryCount = 0, specificKey?: string) => {
        if (retryCount > 5) { setError("Could not generate a unique Key. Please reload."); return; }

        // Clean up existing peer if any
        if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
        }

        try {
            const Peer = (await import('peerjs')).default;
            // Use specific key if provided (for file adding), otherwise generate random
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

                // Only connect as receiver if we are NOT the host (no specific key generation involved)
                if (keyParam && !specificKey) {
                    setInputKey(keyParam);
                    connectToPeer(keyParam);
                } else if (!specificKey) {
                    setStatus('input_key');
                }
            });

            peer.on('connection', (conn: DataConnection) => {
                addLog(`Peer Connected: ${conn.peer}`);
                setupConnection(conn);
            });

            peer.on('error', (err: any) => {
                addLog(`PeerJS Error: ${err.type} - ${err}`);
                if (err.type === 'unavailable-id') {
                    peer.destroy();
                    initPeer(retryCount + 1);
                } else if (err.type === 'peer-unavailable') {
                    // Handle failed attempt
                    failedAttemptsRef.current += 1;
                    setInputKey(''); // Clear input box

                    addLog(`Failed attempt ${failedAttemptsRef.current}/5`);

                    if (failedAttemptsRef.current >= 5) {
                        setIsCaptchaActive(true);
                        setCaptcha(generateCaptcha());
                        setError('Too many failed attempts. Please verify you are human.');
                    } else {
                        setError('Transfer Key not found.');
                    }

                    setStatus('input_key');
                }
            });
        } catch (err) {
            console.error(err);
            setError("Failed to load PeerJS");
        }
    }, [initialKey, addLog, setMyId, setInputKey, connectToPeer, setStatus, setError, failedAttemptsRef, setIsCaptchaActive, setCaptcha, setupConnection]); // Dependencies

    useEffect(() => {
        let mounted = true;
        // let peer: any; // Removed as peerRef.current is used directly now

        // initPeer is now a useCallback, so it can be called directly
        // We only want to run this once on mount, regardless of initPeer changing
        initPeer();

        return () => {
            mounted = false;
            // workerRef.current?.terminate();
            releaseWakeLock();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleFileSelect = async (file: File) => {
        // Generate NEW key for every addition to support "fresh code" requirement
        const newKey = Math.floor(100000 + Math.random() * 900000).toString();
        const baseUrl = window.location.origin;
        const shareUrl = `${baseUrl}/${newKey}`;

        addLog(`File added: ${file.name} (${file.size} bytes). New Key: ${newKey}`);

        // Re-initialize Peer with new key
        await initPeer(0, newKey);

        const newFile: HostedFile = {
            id: newKey,
            file,
            downloadUrl: shareUrl,
            downloads: 0,
            transferKey: newKey
        };

        setHostedFiles(prev => {
            // Update ALL previous files to share the same new key/URL
            const updatedPrev = prev.map(f => ({
                ...f,
                id: newKey,
                transferKey: newKey,
                downloadUrl: shareUrl
            }));
            return [...updatedPrev, newFile];
        });
        setStatus('ready');
    };

    const updateSchedule = (timestamp: number) => {
        setHostedFiles(prev => prev.map(f => ({ ...f, availableFrom: timestamp })));
    };

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
                        onStartDownload={startDownload}
                        countdown={countdown}
                        inputKey={inputKey}
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

// --- UI Components ---

function Footer() {
    return <div className="fixed bottom-4 right-4 text-xs text-gray-500 font-mono">{APP_VERSION}</div>;
}

function LogViewer({ logs }: { logs: string[] }) {
    const [isOpen, setIsOpen] = useState(true);

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

function InitialView({ onFileSelect, onJoin, inputKey, setInputKey, error, isCaptchaActive, captcha, onCaptchaVerify }: any) {
    const [isDragging, setIsDragging] = useState(false);
    const [captchaInput, setCaptchaInput] = useState('');

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFileSelect(file);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] gap-16 animate-fade-in">
            {/* Title */}
            <h1 className="text-5xl font-bold tracking-[0.2em] text-[#1a1a1a] drop-shadow-sm">KIZUNA</h1>

            {/* POST Box Design */}
            <div
                className={`relative w-72 h-96 bg-[#FFB000] rounded-t-[5rem] rounded-b-3xl shadow-[0_30px_60px_-12px_rgba(255,176,0,0.4)] flex flex-col items-center justify-between p-8 cursor-pointer transition-all duration-300 hover:translate-y-[-8px] hover:shadow-[0_40px_70px_-12px_rgba(255,176,0,0.6)] group overflow-hidden border-b-8 border-[#CC8D00] ${isDragging ? 'ring-4 ring-[#1a1a1a]' : ''}`}
                onClick={() => document.getElementById('file-input')?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
            >
                <input id="file-input" type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])} />

                {/* Top: POST Label */}
                <div className="w-full flex justify-center mt-4">
                    <span className="text-4xl font-black text-[#1a1a1a] tracking-[0.2em] drop-shadow-sm group-hover:scale-110 transition-transform opacity-80">
                        POST
                    </span>
                </div>

                {/* Middle: Slot & Icon */}
                <div className="w-full flex-1 flex flex-col items-center justify-center gap-6">
                    {/* The Slot */}
                    <div className="w-full h-4 bg-[#1a1a1a] rounded-full shadow-[inset_0_2px_5px_rgba(0,0,0,0.3)] relative overflow-hidden group-hover:scale-x-105 transition-all">
                        <div className={`absolute top-0 left-0 h-full w-full bg-gradient-to-r from-transparent via-white to-transparent opacity-0 ${isDragging ? 'animate-slide-loop opacity-50' : ''}`} />
                    </div>

                    {/* Icon */}
                    <div className="text-[#1a1a1a]/20 group-hover:text-[#1a1a1a]/60 transition-colors">
                        <Mail size={48} strokeWidth={1.5} />
                    </div>
                </div>

                {/* Bottom: Instructions */}
                <div className="text-center space-y-2">
                    <p className="text-xs text-[#1a1a1a]/60 font-mono font-bold group-hover:text-[#1a1a1a] transition-colors leading-tight px-2">
                        Drag and drop files here,<br />or click here to select a folder.
                    </p>
                    <div className="w-12 h-1 bg-[#CC8D00] rounded-full mx-auto" />
                </div>
            </div>

            {/* Passcode Input or Captcha */}
            {isCaptchaActive ? (
                <div className="flex flex-col items-center gap-4 animate-slide-up p-6 bg-gray-50 rounded-xl border border-gray-200 shadow-inner">
                    <ShieldAlert className="text-red-500 mb-2" size={32} />
                    <p className="text-sm text-gray-600 font-mono text-center max-w-[200px]">Security Check<br />Solve to continue</p>
                    <div className="text-2xl font-bold font-mono tracking-widest">{captcha.q} = ?</div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            className="w-20 text-center border-b-2 border-gray-300 focus:border-[#ff5500] outline-none text-xl font-mono"
                            value={captchaInput}
                            onChange={(e) => setCaptchaInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    onCaptchaVerify(captchaInput);
                                    setCaptchaInput('');
                                }
                            }}
                        />
                        <button
                            onClick={() => {
                                onCaptchaVerify(captchaInput);
                                setCaptchaInput('');
                            }}
                            className="bg-black text-white px-4 py-1 rounded text-xs hover:bg-[#ff5500] transition-colors"
                        >
                            VERIFY
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-6 w-full max-w-md z-10">
                    <div className="relative w-full flex justify-center gap-2 sm:gap-4">
                        <input
                            type="text"
                            maxLength={6}
                            value={inputKey}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                                setInputKey(val);
                                if (val.length === 6) onJoin(val);
                            }}
                            pattern="[0-9]*"
                            inputMode="numeric"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-text z-20"
                            autoFocus={!isCaptchaActive}
                        />
                        {[...Array(6)].map((_, i) => (
                            <div
                                key={i}
                                className={`w-10 h-14 sm:w-12 sm:h-16 border-2 rounded-lg flex items-center justify-center text-2xl sm:text-3xl font-mono transition-all duration-200 z-10 bg-white
                                    ${inputKey.length === i ? 'border-[#ff5500] shadow-[0_0_15px_rgba(255,85,0,0.3)] scale-105' : 'border-gray-200'}
                                    ${inputKey[i] ? 'text-[#1a1a1a] border-gray-400' : 'text-gray-300'}
                                `}
                            >
                                {inputKey[i] || ''}
                            </div>
                        ))}
                    </div>

                    <div className="h-6 text-center">
                        {error ? (
                            <p className="text-red-500 text-sm font-mono animate-pulse">{error}</p>
                        ) : (
                            <p className="text-gray-400 text-xs tracking-widest uppercase">Enter 6-digit Code</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function SenderView({ hostedFiles, activeStreams, onSchedule, onAddFile, senderStats, peerDiffs, onStopPeer }: any) {
    const [isCopied, setIsCopied] = useState(false);
    const [isUrlCopied, setIsUrlCopied] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // 直近に追加されたファイル、またはリストの先頭を表示
    const primaryFile = hostedFiles[hostedFiles.length - 1]; // Use the latest context for Key/URL

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onAddFile(file);
    };

    // Combine file info
    const totalSize = hostedFiles.reduce((acc: number, f: any) => acc + f.file.size, 0);

    // Initial Estimate Calculation (Assumed Speed: 3MB/s)
    const assumedSpeed = 3 * 1024 * 1024; // 3 MB/s
    const initialEtaSeconds = totalSize / assumedSpeed;
    const initialEtaStr = initialEtaSeconds > 60
        ? `${Math.floor(initialEtaSeconds / 60)}m ${Math.floor(initialEtaSeconds % 60)}s`
        : `${Math.ceil(initialEtaSeconds)}s`;

    const copyKey = () => {
        navigator.clipboard.writeText(primaryFile.transferKey);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const copyUrl = () => {
        navigator.clipboard.writeText(primaryFile.downloadUrl);
        setIsUrlCopied(true);
        setTimeout(() => setIsUrlCopied(false), 2000);
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8 animate-fade-in p-4 pt-12">

            {/* "MORE" Button (Restored Large POST Design) - Hidden during transfer */}
            {!senderStats?.isTransferring && (
                <div
                    className={`relative w-72 h-96 bg-[#FFB000] rounded-t-[5rem] rounded-b-3xl shadow-[0_30px_60px_-12px_rgba(255,176,0,0.4)] flex flex-col items-center justify-between p-8 cursor-pointer transition-all duration-300 hover:translate-y-[-8px] hover:shadow-[0_40px_70px_-12px_rgba(255,176,0,0.6)] group overflow-hidden border-b-8 border-[#CC8D00] z-20 mb-12 ${isDragging ? 'ring-4 ring-[#1a1a1a]' : ''}`}
                    onClick={() => document.getElementById('add-file-input')?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                >
                    <input id="add-file-input" type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onAddFile(e.target.files[0])} />

                    {/* Top: MORE Label */}
                    <div className="w-full flex justify-center mt-4">
                        <span className="text-4xl font-black text-[#1a1a1a] tracking-[0.2em] drop-shadow-sm group-hover:scale-110 transition-transform opacity-80">
                            MORE
                        </span>
                    </div>

                    {/* Middle: Slot */}
                    <div className="w-full flex-1 flex flex-col items-center justify-center gap-6">
                        <div className="w-full h-4 bg-[#1a1a1a] rounded-full shadow-[inset_0_2px_5px_rgba(0,0,0,0.3)] relative overflow-hidden group-hover:scale-x-105 transition-all">
                            <div className={`absolute top-0 left-0 h-full w-full bg-gradient-to-r from-transparent via-white to-transparent opacity-0 ${isDragging ? 'animate-slide-loop opacity-50' : ''}`} />
                        </div>
                        <div className="text-[#1a1a1a]/20 group-hover:text-[#1a1a1a]/60 transition-colors">
                            <Upload size={48} strokeWidth={1.5} />
                        </div>
                    </div>

                    {/* Bottom: Label */}
                    <div className="text-center space-y-2">
                        <p className="text-xs text-[#1a1a1a]/60 font-mono font-bold group-hover:text-[#1a1a1a] transition-colors uppercase tracking-widest leading-tight">
                            Drag & Drop or<br />Click to Add File
                        </p>
                        <div className="w-12 h-1 bg-[#CC8D00] rounded-full mx-auto" />
                    </div>
                </div>
            )}

            {/* Sketched Card UI */}
            <div className="w-full max-w-2xl bg-white border-2 border-[#1a1a1a] rounded-xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 sm:p-8 relative overflow-hidden z-10 animate-slide-up">
                <div className="flex flex-col sm:flex-row gap-8">

                    {/* LEFT COLUMN: Key, URL, Actions */}
                    <div className="flex-1 flex flex-col justify-between gap-6">
                        <div>
                            {/* Key */}
                            <div
                                className="text-6xl sm:text-8xl font-mono font-medium tracking-tighter text-[#1a1a1a] cursor-pointer hover:text-[#ff5500] transition-colors select-all leading-none mb-4"
                                onClick={copyKey}
                            >
                                {primaryFile.transferKey}
                            </div>

                            {/* URL */}
                            <div
                                className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 font-mono bg-gray-100 p-2 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors max-w-fit"
                                onClick={copyUrl}
                                title="Click to copy URL"
                            >
                                {isUrlCopied ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                <span className="truncate max-w-[200px] sm:max-w-xs">{primaryFile.downloadUrl}</span>
                            </div>
                        </div>

                        {/* Bottom Row: Size & Icons & ETA */}
                        <div className="flex items-end gap-6 flex-wrap">
                            {/* Total Size & ETA */}
                            <div className="flex flex-col">
                                <div className={`flex items-center gap-1 text-xs font-mono mb-1 ${senderStats?.isTransferring ? 'text-[#ff5500] animate-pulse' : 'text-gray-400'}`}>
                                    <CalendarClock size={12} />
                                    <span>
                                        Est. {senderStats?.isTransferring ? senderStats.eta : initialEtaStr}
                                    </span>
                                    {senderStats?.isTransferring && <span className="text-gray-400">({senderStats.speed})</span>}
                                </div>
                                <div className="text-2xl sm:text-3xl font-bold font-mono text-[#1a1a1a]">
                                    {formatSize(totalSize)}
                                </div>
                            </div>

                            {/* Icons */}
                            <div className="flex items-center gap-3 pb-1">
                                <button className="text-[#1a1a1a] hover:text-[#ff5500] transition-colors"><Twitter size={24} /></button>
                                <button className="text-[#1a1a1a] hover:text-[#ff5500] transition-colors"><Mail size={24} /></button>
                                <button className="flex items-center gap-1 border border-[#1a1a1a] rounded px-2 py-0.5 text-xs font-bold hover:bg-[#1a1a1a] hover:text-white transition-colors">
                                    <Users size={14} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: File List, QR */}
                    <div className="flex flex-col justify-between gap-4 sm:w-48 border-t-2 sm:border-t-0 sm:border-l-2 border-gray-100 pt-4 sm:pt-0 sm:pl-6">
                        {/* File List */}
                        <div className="flex flex-col gap-1 overflow-y-auto max-h-20 pr-2 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent hover:scrollbar-thumb-gray-300 transition-colors">
                            {hostedFiles.map((file: any, index: number) => (
                                <div key={index} className="text-xs font-mono text-gray-600 truncate flex gap-2 items-center flex-shrink-0">
                                    <span className="font-bold text-[#1a1a1a] min-w-[1.5em]">{index + 1}:</span>
                                    <span className="truncate" title={file.file.name}>{file.file.name}</span>
                                </div>
                            ))}
                        </div>

                        {/* QR Code Box */}
                        <div className="aspect-square border-2 border-[#1a1a1a] rounded-lg p-2 flex items-center justify-center relative bg-white">
                            <QRCodeSVG value={primaryFile.downloadUrl} size={120} className="w-full h-full" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Transfer Progress Bar List (Per-Peer) */}
            {senderStats?.isTransferring && peerDiffs && Object.keys(peerDiffs).length > 0 && (
                <div className="w-full max-w-2xl mt-8 animate-slide-up bg-white rounded-xl border-2 border-[#1a1a1a] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-6 space-y-4">
                    <h3 className="text-xs font-bold font-mono text-gray-400 uppercase tracking-widest mb-4">Active Transfers</h3>

                    {Object.entries(peerDiffs).map(([peerId, stats]: [string, any]) => (
                        <div key={peerId} className="flex items-center gap-4">
                            {/* Peer Name */}
                            <div className="w-24 text-xs font-mono font-bold text-[#1a1a1a] truncate" title={peerId}>
                                {stats.name}
                            </div>

                            {/* Progress Bar */}
                            <div className="flex-1 h-3 bg-gray-100 rounded-full border border-gray-200 overflow-hidden relative">
                                <div
                                    className="h-full bg-stripes-orange animate-move-stripes"
                                    style={{ width: `${stats.progress}%` }}
                                />
                            </div>

                            {/* Stop Button */}
                            <button
                                onClick={() => onStopPeer(peerId)}
                                className="w-6 h-6 border border-[#1a1a1a] rounded flex items-center justify-center hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
                                title="Stop Transfer"
                            >
                                <div className="w-2 h-2 bg-current rounded-[1px]" />
                            </button>

                            {/* Percentage */}
                            <div className="w-12 text-right text-xs font-bold font-mono text-[#1a1a1a]">
                                {Math.round(stats.progress)}%
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Connected Peers Indicator */}
            <div className="text-center text-xs text-gray-400 font-mono mt-4">
                {activeStreams > 0 ? (
                    <span className="text-emerald-500 flex items-center justify-center gap-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        {activeStreams} devices connected
                    </span>
                ) : (
                    "Waiting for connection..."
                )}
            </div>
        </div>
    );
}

function ReceiverView({ status, file, progress, speed, activeStreams, error, onStartDownload, countdown, inputKey }: any) {
    const [isCopied, setIsCopied] = useState(false);

    // Construct URL for display
    const downloadUrl = typeof window !== 'undefined' ? `${window.location.origin}/${inputKey}` : '';

    const copyKey = () => {
        navigator.clipboard.writeText(inputKey);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const copyUrl = () => {
        navigator.clipboard.writeText(downloadUrl);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 animate-fade-in p-4 pt-12">
            {/* Card UI (Same as Sender) */}
            <div className="w-full max-w-2xl bg-white border-2 border-[#1a1a1a] rounded-xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 sm:p-8 relative overflow-hidden z-10 animate-slide-up">

                {/* Status Badge */}
                <div className="absolute top-0 right-0 p-4">
                    {status === 'waiting_for_save' && <span className="text-xs font-bold bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Ready to Download</span>}
                    {status === 'connected' && progress < 100 && <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded-full animate-pulse">Downloading...</span>}
                    {progress === 100 && <span className="text-xs font-bold bg-green-100 text-green-800 px-2 py-1 rounded-full">Complete</span>}
                </div>

                <div className="flex flex-col sm:flex-row gap-8">
                    {/* LEFT COLUMN: Key, URL, Actions */}
                    <div className="flex-1 flex flex-col justify-between gap-6">
                        <div>
                            {/* Key */}
                            <div
                                className="text-6xl sm:text-8xl font-mono font-medium tracking-tighter text-[#1a1a1a] cursor-pointer hover:text-[#ff5500] transition-colors select-all leading-none mb-4"
                                onClick={copyKey}
                            >
                                {inputKey}
                            </div>

                            {/* URL */}
                            <div
                                className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 font-mono bg-gray-100 p-2 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors max-w-fit"
                                onClick={copyUrl}
                            >
                                <Copy size={14} />
                                <span className="truncate max-w-[200px] sm:max-w-xs">{downloadUrl}</span>
                            </div>

                            {/* DOWNLOAD ACTION AREA (Moved from Right) */}
                            <div className="mt-8">
                                {status === 'waiting_for_save' ? (
                                    <button
                                        onClick={onStartDownload}
                                        className="w-full sm:w-auto px-8 py-4 bg-[#1a1a1a] text-white font-bold font-mono rounded-xl hover:bg-[#ff5500] transition-all shadow-lg hover:shadow-xl active:scale-95 flex items-center justify-center gap-3 group"
                                    >
                                        <Download size={24} className="group-hover:scale-110 transition-transform" />
                                        <span>START DOWNLOAD</span>
                                    </button>
                                ) : status === 'connected' ? (
                                    <div className="w-full sm:w-auto min-w-[200px] bg-gray-100 rounded-xl h-14 flex items-center px-4 relative overflow-hidden border border-gray-200">
                                        <div
                                            className="absolute left-0 top-0 h-full bg-[#ff5500]/20 transition-all duration-300 ease-out"
                                            style={{ width: `${progress}%` }}
                                        />
                                        <div className="relative z-10 flex items-center justify-between w-full font-mono">
                                            <span className="font-bold text-[#ff5500] text-sm animate-pulse flex items-center gap-2">
                                                <Loader2 size={16} className="animate-spin" />
                                                Downloading...
                                            </span>
                                            <span className="font-bold text-lg">{Math.round(progress)}%</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-gray-400 font-mono text-sm flex items-center gap-2">
                                        <Loader2 size={16} className="animate-spin" />
                                        Waiting for sender...
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bottom Row: Size & Speed */}
                        <div className="flex items-end gap-6 flex-wrap">
                            <div className="flex flex-col">
                                {status === 'connected' && progress < 100 && (
                                    <div className="flex items-center gap-1 text-xs font-mono text-[#ff5500] animate-pulse mb-1">
                                        <span>{speed}</span>
                                    </div>
                                )}
                                <div className="text-2xl sm:text-3xl font-bold font-mono text-[#1a1a1a]">
                                    {formatSize(file.size)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: File List Only */}
                    <div className="flex flex-col gap-2 sm:w-64 border-t-2 sm:border-t-0 sm:border-l-2 border-gray-100 pt-4 sm:pt-0 sm:pl-6 min-h-[300px]">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Files</h3>
                        {/* File List - Expanded Height */}
                        <div className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-[350px] pr-2 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                            <div className="text-xs font-mono text-gray-600 truncate flex gap-3 items-center py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors rounded px-1">
                                <span className="font-bold text-[#1a1a1a] min-w-[1.5em] text-right">1:</span>
                                <FileIcon size={14} className="flex-shrink-0" />
                                <span className="truncate flex-1" title={file.name}>{file.name}</span>
                            </div>
                            {/* Placeholder for potential multiple files */}
                        </div>
                    </div>
                </div>
            </div>

            {/* Connected Peers Indicator */}
            <div className="text-center text-xs text-gray-400 font-mono mt-4">
                {activeStreams > 0 ? (
                    <span className="text-emerald-500 flex items-center justify-center gap-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        Connected to Peer
                    </span>
                ) : (
                    "Connecting..."
                )}
            </div>
            {error && <p className="text-red-500 font-bold">{error}</p>}
        </div>
    );
}
