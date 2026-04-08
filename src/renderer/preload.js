const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pneuma', {
    // Chat
    sendMessage: (message, sessionId) => ipcRenderer.send('chat:stream', { message, sessionId }),
    onChunk:  (cb) => ipcRenderer.on('chat:chunk', (_, d) => cb(d.chunk)),
    onDone:   (cb) => ipcRenderer.on('chat:done',  (_, d) => cb(d)),
    onError:  (cb) => ipcRenderer.on('chat:error', (_, d) => cb(d.error)),
    removeListeners: () => {
        ipcRenderer.removeAllListeners('chat:chunk');
        ipcRenderer.removeAllListeners('chat:done');
        ipcRenderer.removeAllListeners('chat:error');
    },

    // Session
    newSession: () => ipcRenderer.invoke('session:new'),
    getSession: () => ipcRenderer.invoke('session:get'),

    // Nawigacja
    openImporter: () => ipcRenderer.send('nav:importer'),
    openChat:     () => ipcRenderer.send('nav:chat'),

    // Importer
    importChunks: (data) => ipcRenderer.invoke('import:chunks', data),
});
