
let fileHandle = null;
let writable = null;
let writeQueue = [];
let isWriting = false;
let totalWritten = 0;

self.onmessage = async (e) => {
    const { type, data, offset, options, truncate } = e.data;

    try {
        if (type === 'init') {
            fileHandle = data; // FileHandle received

            // Create writable stream
            // options: { keepExistingData: boolean }
            writable = await fileHandle.createWritable(options || { keepExistingData: true });

            if (truncate) {
                await writable.truncate(0);
            } else if (offset > 0) {
                await writable.seek(offset);
            }

            totalWritten = offset || 0;
            self.postMessage({ type: 'ready' });
        }
        else if (type === 'write') {
            // data is ArrayBuffer (chunk)
            writeQueue.push(data);
            processQueue();
        }
        else if (type === 'close') {
            // Wait for queue to drain then close
            const checkQueue = setInterval(async () => {
                if (writeQueue.length === 0 && !isWriting) {
                    clearInterval(checkQueue);
                    if (writable) {
                        await writable.close();
                        self.postMessage({ type: 'complete', totalWritten });
                        writable = null;
                        fileHandle = null;
                        close(); // Terminate worker
                    }
                }
            }, 100);
        }
    } catch (err) {
        self.postMessage({ type: 'error', error: err.toString() });
    }
};

async function processQueue() {
    if (isWriting || writeQueue.length === 0 || !writable) return;

    isWriting = true;

    try {
        while (writeQueue.length > 0) {
            const chunk = writeQueue.shift();
            await writable.write(chunk);
            totalWritten += chunk.byteLength;
        }
    } catch (err) {
        self.postMessage({ type: 'error', error: err.toString() });
    } finally {
        isWriting = false;
        // Notify main thread that buffer is drained (useful for flow control if implemented)
        self.postMessage({ type: 'progress', totalWritten });
    }
}
