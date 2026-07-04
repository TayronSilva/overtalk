let mediaRecorder = null;
let captureStream = null;

// Escutando mensagens do Popup
browser.runtime.onMessage.addListener(async (message, sender) => {
    if (message.action === 'start_capture') {
        const tabId = message.tabId;
        console.log("Iniciando captura na aba:", tabId);
        
        try {
            // Requisita a stream de áudio da aba
            captureStream = await browser.tabCapture.capture({ audio: true, video: false });
            
            // É preciso conectar a captura no destino de áudio local
            // Para não mutar a aba para o usuário! Sendo assim ele ainda escuta a call.
            const audioCtx = new window.AudioContext();
            const source = audioCtx.createMediaStreamSource(captureStream);
            source.connect(audioCtx.destination);
            
            // Grava a stream em pedaços de 3 segundos
            mediaRecorder = new MediaRecorder(captureStream, { mimeType: 'audio/webm' });
            
            mediaRecorder.ondataavailable = async (e) => {
                if (e.data.size > 0) {
                    processAudioChunk(e.data, tabId);
                }
            };
            
            mediaRecorder.start(3000); 
            console.log("MediaRecorder iniciado com blocos de 3s.");
            
        } catch (error) {
            console.error("Erro na captura de aba:", error);
        }
    } else if (message.action === 'stop_capture') {
        if (mediaRecorder) {
            mediaRecorder.stop();
            mediaRecorder = null;
        }
        if (captureStream) {
            captureStream.getTracks().forEach(t => t.stop());
            captureStream = null;
        }
    }
});

async function processAudioChunk(blob, tabId) {
    try {
        const arrayBuffer = await blob.arrayBuffer();
        
        // Decodificando via AudioContext nativo do Chrome/Firefox
        // Isso converte automaticamente o formato (webm) pra Float32 PCM na Sample Rate que pedirmos (16000)
        const offlineCtx = new window.AudioContext({ sampleRate: 16000 });
        const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
        
        // Dados mono 16kHz em Float32:
        const float32Array = audioBuffer.getChannelData(0);
        
        // Enviar os dados binários puros para nossa API Node.js (sem chaves, 100% grátis e local)
        const response = await fetch("http://localhost:3000/translate", {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: float32Array.buffer
        });
        
        const json = await response.json();
        
        if (json.translated && json.translated.trim() !== "") {
            console.log("Enviando legenda para tela:", json.translated);
            // Avisa o injetor HTML na página para exibir as legendas
            browser.tabs.sendMessage(tabId, { 
                action: "show_translation", 
                original: json.original, 
                translated: json.translated 
            }).catch(() => {});
        }
    } catch(err) {
        // Ignora erros de decodeAudioData de "blocos vazios"
        if (!err.message.includes("Unable to decode")) {
            console.error("Erro no processamento do bloco de áudio:", err);
        }
    }
}
