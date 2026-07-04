document.getElementById('startBtn').addEventListener('click', async () => {
    try {
        const api = typeof chrome !== 'undefined' ? chrome : browser;

        const tabs = await api.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0) {
            const tab = tabs[0];
            await api.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            }).catch(() => {});
        }

        api.tabs.create({ url: api.runtime.getURL('capture.html') });

    } catch (e) {
        document.getElementById('status').innerText = 'Erro ao inicializar: ' + e.message;
    }
});
