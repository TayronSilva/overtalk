let audioCtx = null;
let systemStream = null;
let micStream = null;

const api = typeof chrome !== 'undefined' ? chrome : browser;

// Configurações Globais
const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 650; // Cortado pela metade para reagir na velocidade da conversa
const PARTIAL_SEND_INTERVAL_MS = 1000; // Pulso parcial a cada 1 segundo para efeito "Ao Vivo"

// Estado das Legendas para o Canvas (PiP)
let lastSystemMsg = "Esperando Áudio do Sistema...";
let lastMicMsg = "Segure [SHIFT DIREITO] para falar em PT";
let isShiftRightPressed = false;

// Conexão com o Monitor Global (Hacker/Backend)
let eventSource = null;
function connectToGlobalMonitor() {
    if (eventSource) return;
    log("📡 Conectando ao Monitor de Teclas Global...");
    eventSource = new EventSource('http://localhost:3000/events');
    
    eventSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'ptt_status') {
            const isDown = data.state === 'mic_on';
            if (isDown !== isShiftRightPressed) {
                isShiftRightPressed = isDown;
                if (isShiftRightPressed) {
                    lastMicMsg = "🔴 FALE AGORA EM PT...";
                } else {
                    lastMicMsg = "Segure [SHIFT DIREITO] para falar em PT";
                    if (micProcessor) micProcessor.forceStop();
                }
            }
        }
    };

    eventSource.onerror = () => {
        console.error("Erro na conexão SSE. Tentando reconectar...");
        eventSource.close();
        eventSource = null;
        setTimeout(connectToGlobalMonitor, 3000);
    };
}

class AudioProcessor {
    constructor(sourceName, statusElId, volumeBarId) {
        this.sourceName = sourceName;
        this.statusEl = document.getElementById(statusElId);
        this.volumeBar = document.getElementById(volumeBarId);
        
        this.isSpeaking = false;
        this.silenceStartTime = null;
        this.lastPartialSendTime = 0;
        this.audioBufferAccumulator = [];
    }

    process(inputData, threshold) {
        // Lógica de Push-to-Talk (PTT) - Só para Microfone
        if (this.sourceName === 'mic' && document.getElementById('chkPTT').checked) {
            if (!isShiftRightPressed) {
                this.volumeBar.style.width = '0%';
                if (this.isSpeaking) this.forceStop();
                return;
            }
        }

        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);

        const volumePercent = Math.min(100, (rms / 0.15) * 100);
        this.volumeBar.style.width = volumePercent + '%';

        const now = performance.now();

        if (rms > threshold) {
            if (!this.isSpeaking) {
                this.isSpeaking = true;
                this.statusEl.innerText = "🗣️ CAPTANDO...";
                this.statusEl.style.color = this.sourceName === 'mic' ? '#2196F3' : '#4CAF50';
                this.lastPartialSendTime = now;
            }
            this.silenceStartTime = null;

            if (now - this.lastPartialSendTime > PARTIAL_SEND_INTERVAL_MS) {
                this.lastPartialSendTime = now;
                if (this.audioBufferAccumulator.length > 16000) {
                    sendAudioToBackend([...this.audioBufferAccumulator], this.sourceName, true);
                }
            }
        } else {
            if (this.isSpeaking) {
                if (this.silenceStartTime === null) {
                    this.silenceStartTime = now;
                    this.statusEl.innerText = "⏳ PROCESSANDO...";
                } else if (now - this.silenceStartTime > SILENCE_DURATION_MS) {
                    this.forceStop();
                }
            }
        }

        if (this.isSpeaking || this.silenceStartTime !== null) {
            this.audioBufferAccumulator.push(...inputData);
            
            // CORREÇÃO CRÍTICA: Em jogos barulhentos (ex: Roblox), o silêncio 
            // pode nunca ocorrer. Cortamos brutalmente o buffer aos 15 segundos
            // para evitar que o Whisper estoure o limite de 30s e crash.
            if (this.audioBufferAccumulator.length > (16000 * 15)) {
                this.forceStop();
            }
        }
    }

    forceStop() {
        this.isSpeaking = false;
        this.silenceStartTime = null;
        this.statusEl.innerText = "😶 SILÊNCIO";
        this.statusEl.style.color = "#999";
        if (this.audioBufferAccumulator.length > (16000 * 0.5)) {
            sendAudioToBackend([...this.audioBufferAccumulator], this.sourceName, false);
        }
        this.audioBufferAccumulator = [];
    }

    reset() {
        this.isSpeaking = false;
        this.silenceStartTime = null;
        this.audioBufferAccumulator = [];
        this.volumeBar.style.width = '0%';
        this.statusEl.innerText = "INATIVO";
        this.statusEl.style.color = "#999";
    }
}

let systemProcessor = null;
let micProcessor = null;

function log(msg) {
    const el = document.getElementById('log');
    if (el) {
        el.innerHTML += msg + '<br>';
        el.scrollTop = el.scrollHeight;
    }
}

// Lógica de Teclado (Removida localmente, agora é Global via Backend)
// (Mantido vazio para evitar conflitos com o Monitor Global)

// Lógica de Desenho no Canvas (PiP - TAMANHO CUSTOMIZADO)
const canvas = document.getElementById('pipCanvas');
const ctx = canvas.getContext('2d');

function updateCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Fundo preto semi-transparente
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    // Legenda Mic (Topo - 11px)
    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = isShiftRightPressed ? "#ff8a80" : "#bbdefb";
    wrapText(ctx, lastMicMsg, canvas.width/2, 25, canvas.width - 15, 12);

    // Legenda Nativa (Base - 11px)
    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = "#c8e6c9";
    wrapText(ctx, lastSystemMsg, canvas.width/2, 70, canvas.width - 15, 12);

    requestAnimationFrame(updateCanvas);
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
    let words = text.split(' ');
    let line = '';
    for(let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = context.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            context.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    context.fillText(line, x, y);
}

// Inicialização
updateCanvas(); 

document.getElementById('btnPiP').addEventListener('click', async () => {
    try {
        const video = document.getElementById('pipVideo');
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else {
            const stream = canvas.captureStream(30);
            video.srcObject = stream;
            
            // Tenta reproduzir e abrir o PiP
            await video.play();
            await video.requestPictureInPicture();
            log("✅ Janela flutuante aberta com sucesso!");
        }
    } catch(err) {
        log('<span style="color:red">❌ Erro ao abrir janela flutuante: ' + err.message + '</span>');
        console.error("Erro no PiP:", err);
    }
});

document.getElementById('btnCapture').addEventListener('click', async () => {
    try {
        log("Solicitando permissões (Tela + Microfone)...");
        
        // 1. Captura Sistema
        systemStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        
        const sysAudioTracks = systemStream.getAudioTracks();
        if (sysAudioTracks.length === 0) {
            log('<span style="color:red">⚠️ AVISO: Você não marcou a caixa "Compartilhar Áudio" ao selecionar a tela. O áudio do sistema (nativos) não será ouvido.</span>');
            log('💡 <b>Dica DC/Jogos:</b> Compartilhe a "Tela Inteira" e marque "Áudio do Sistema" para capturar o som de outros apps.');
        }

        systemStream.getVideoTracks().forEach(t => t.stop());

        // 2. Captura Microfone com Redução de Ruído Profissional
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
        } catch (e) { log("⚠️ Usando apenas áudio do sistema."); }

        log("✅ Captura iniciada. Monitor Global Ativo!");
        connectToGlobalMonitor(); // Liga o receptor de teclas do backend
        updateCanvas(); 
        
        document.getElementById('btnCapture').style.display = 'none';
        document.getElementById('btnStop').style.display = 'inline-block';

        audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const silentGain = audioCtx.createGain();
        silentGain.gain.value = 0;
        silentGain.connect(audioCtx.destination);

        const getThreshold = () => parseFloat(document.getElementById('rangeSensitivity').value) || 0.01;

        // Só configura o processador de sistema se houver track de áudio
        if (sysAudioTracks.length > 0) {
            systemProcessor = new AudioProcessor('system', 'statusVAD', 'volumeBar');
            const sysSource = audioCtx.createMediaStreamSource(systemStream);
            const sysNode = audioCtx.createScriptProcessor(4096, 1, 1);
            sysNode.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                systemProcessor.process(inputData, 0.005);
            };
            sysSource.connect(sysNode);
            sysNode.connect(silentGain);
        }

        if (micStream) {
            micProcessor = new AudioProcessor('mic', 'statusVADMic', 'volumeBarMic');
            const micSource = audioCtx.createMediaStreamSource(micStream);
            const micNode = audioCtx.createScriptProcessor(4096, 1, 1);
            micNode.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                micProcessor.process(inputData, getThreshold());
            };
            micSource.connect(micNode);
            micNode.connect(silentGain);
        }

    } catch (error) { log('<span style="color:red">❌ Erro: ' + error.message + '</span>'); }
});

document.getElementById('btnStop').addEventListener('click', () => {
    if (audioCtx) audioCtx.close();
    if (systemStream) systemStream.getTracks().forEach(t => t.stop());
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    if (systemProcessor) systemProcessor.reset();
    if (micProcessor) micProcessor.reset();
    document.getElementById('btnCapture').style.display = 'inline-block';
    document.getElementById('btnStop').style.display = 'none';
    log("Parado.");
});

// Variável para guardar o último áudio do sistema para treinamento
let lastSystemAudioBuffer = null;

async function sendAudioToBackend(float32DataArray, source, isPartial) {
    try {
        const float32Array = new Float32Array(float32DataArray);
        
        // Cacheia o áudio se for do sistema para permitir registro de voz
        if (source === 'system' && !isPartial) {
            lastSystemAudioBuffer = float32Array;
        }

        const response = await fetch(`http://localhost:3000/translate?source=${source}&isPartial=${isPartial}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: float32Array.buffer
        });
        
        const json = await response.json();
        const speakerName = json.speaker || (source === 'mic' ? 'Você' : 'Native');
        
        if (json.translated && json.translated.trim() !== "") {
            // Atualiza mensagens para o Canvas/PiP
            if (source === 'mic') lastMicMsg = `${speakerName}: ${json.translated}`;
            else lastSystemMsg = `${speakerName}: ${json.translated}`;

            if (!isPartial) {
                log(`[${speakerName.toUpperCase()}] ${json.original} -> <b>${json.translated}</b>`);
            }
            
            const tabs = await api.tabs.query({});
            for (let tab of tabs) {
                api.tabs.sendMessage(tab.id, { 
                    action: "show_translation", 
                    speaker: speakerName,
                    original: json.original, 
                    translated: json.translated,
                    isPartial: isPartial,
                    source: source
                }).catch(() => {});
            }
        }
    } catch(err) { console.error("Erro no envio:", err); }
}

// --- Gerenciamento de Vozes (Interface) ---
async function refreshSpeakerList() {
    try {
        const response = await fetch('http://localhost:3000/list_speakers');
        const speakers = await response.json();
        const container = document.getElementById('speakerList');
        container.innerHTML = '';
        
        speakers.forEach(name => {
            const chip = document.createElement('div');
            chip.style = "background: rgba(255,255,255,0.08); border: 1px solid var(--border); padding: 5px 12px; border-radius: 8px; font-size: 11px; display: flex; align-items: center; gap: 10px; color: var(--text-main); transition: all 0.2s;";
            
            const nameSpan = document.createElement('span');
            nameSpan.style.fontWeight = "600";
            nameSpan.textContent = name;
            
            const deleteBtn = document.createElement('span');
            deleteBtn.style.cursor = "pointer";
            deleteBtn.style.color = "#ef4444";
            deleteBtn.style.fontWeight = "900";
            deleteBtn.style.fontSize = "16px";
            deleteBtn.style.lineHeight = "1";
            deleteBtn.title = "Excluir Voz";
            deleteBtn.textContent = "×";
            deleteBtn.addEventListener('click', () => deleteSpeaker(name));
            
            chip.appendChild(nameSpan);
            chip.appendChild(deleteBtn);
            
            container.appendChild(chip);
        });
    } catch (e) { console.error("Erro lista vozes:", e); }
}

window.deleteSpeaker = async (name) => {
    // Removido confirm() para evitar erro de permissão do navegador
    await fetch(`http://localhost:3000/delete_speaker?name=${encodeURIComponent(name)}`, { method: 'POST' });
    refreshSpeakerList();
};

document.getElementById('btnClearSpeakers').addEventListener('click', async () => {
    const speakers = await (await fetch('http://localhost:3000/list_speakers')).json();
    for (const name of speakers) {
        await fetch(`http://localhost:3000/delete_speaker?name=${encodeURIComponent(name)}`, { method: 'POST' });
    }
    refreshSpeakerList();
    log("📌 Sistema de Vozes Resetado.");
});

// Lógica de Registro de Voz (Treinamento)
document.getElementById('btnRegisterVoice').addEventListener('click', async () => {
    const name = document.getElementById('speakerName').value.trim();
    const status = document.getElementById('registerStatus');

    if (!name) {
        status.innerText = "❌ Digite um nome primeiro!";
        return;
    }
    if (!lastSystemAudioBuffer) {
        status.innerText = "❌ Nenhum áudio capturado ainda.";
        return;
    }

    status.innerText = "⏳ Registrando voz...";
    try {
        const response = await fetch(`http://localhost:3000/register_voice?name=${encodeURIComponent(name)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: lastSystemAudioBuffer.buffer
        });
        const res = await response.json();
        if (res.success) {
            status.innerText = `✅ Voz de ${name} salva!`;
            document.getElementById('speakerName').value = '';
            refreshSpeakerList();
            log(`✨ Perfil de voz criado: <b>${name}</b>`);
        } else {
            status.innerText = "❌ Erro ao registrar.";
        }
    } catch (e) {
        status.innerText = "❌ Erro de conexão.";
    }
});

// Inicialização
refreshSpeakerList();


