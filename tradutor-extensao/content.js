// Função para criar uma caixa de legenda se não existir
function getOrCreateBox(id, position) {
    let box = document.getElementById(id);
    if (!box) {
        box = document.createElement('div');
        box.id = id;
        const style = position === 'top' ? 'top: 50px;' : 'bottom: 50px;';
        box.innerHTML = `
            <div style="position: fixed; ${style} left: 50%; transform: translateX(-50%); z-index: 2147483647; 
                        background: rgba(0,0,0,0.85); color: #FFF; padding: 15px 25px; 
                        border-radius: 12px; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; 
                        min-width: 300px; max-width: 65%; text-align: center;
                        box-shadow: 0 4px 15px rgba(0,0,0,0.5); pointer-events: none; border: 1px solid #333; display: none;">
                <p class="texto-original" style="font-size: 13px; color: #BBB; margin: 0 0 5px 0; font-style: italic;"></p>
                <p class="texto-traduzido" style="font-size: 22px; font-weight: bold; margin: 0; text-shadow: 1px 1px 2px black;">...</p>
            </div>
        `;
        document.body.appendChild(box);
    }
    return box;
}

const boxSystem = getOrCreateBox('meu-tradutor-box-system', 'bottom');
const boxMic = getOrCreateBox('meu-tradutor-box-mic', 'top');

let timers = { system: null, mic: null };
const api = typeof chrome !== 'undefined' ? chrome : browser;

api.runtime.onMessage.addListener((message) => {
    if (message.action === "show_translation") {
        const isMic = message.source === 'mic';
        const box = isMic ? boxMic : boxSystem;
        const type = isMic ? 'mic' : 'system';
        
        const container = box.querySelector('div');
        const textOrig = container.querySelector('.texto-original');
        const textTrad = container.querySelector('.texto-traduzido');

        textOrig.innerText = message.original;
        textTrad.innerText = message.translated;
        
        container.style.display = 'block';

        // Estilos específicos
        if (isMic) {
            textTrad.style.color = '#40C4FF'; // Azul p/ o meu Mic
            container.style.borderColor = '#0091EA';
        } else {
            textTrad.style.color = '#4CAF50'; // Verde p/ o Sistema
            container.style.borderColor = '#2E7D32';
        }

        // Opacidade p/ Parcial
        textTrad.style.opacity = message.isPartial ? '0.7' : '1.0';

        if (timers[type]) clearTimeout(timers[type]);
        timers[type] = setTimeout(() => {
            container.style.display = 'none';
        }, 10000); 
    }
});
