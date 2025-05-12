import { globalState, resetStreamRelatedState } from './state.js';
import { elements } from './domElements.js';
import { appendLog, updateStatus } from './loggerService.js';
import { sendWebSocketMessage } from './websocketService.js';
import { setupAudioPlayer as setupAudioDecoder, closeAudio } from './services/audioPlaybackService.js';
import { stopVideoPlayback, updateVideoResolutionInStream, checkForBadState, handleVideoInfo as processVideoInfoInternal } from './services/videoPlaybackService.js';
import { updateDisplayOptionsOnStreamStop, updateDisplayOptionsOnStreamStart } from './ui/sidebarControls.js';
import { renderAppDrawer } from './ui/appDrawer.js';
import { updateSpeakerIconFromVolume, updateSliderBackground, updateWifiIndicatorUI, updateBatteryLevelUI } from './ui/taskbarControls.js';
import { CHECK_STATE_INTERVAL_MS, CODEC_IDS, DECODER_TYPES } from './constants.js';


export function handleDeviceName(message) {
    updateStatus(`Streaming from ${message.name}`);
    appendLog(`Device Name: ${message.name}`);
}

export function handleVideoInfo(message) {
    processVideoInfoInternal(message.width, message.height);
    appendLog(`Video Info: ${message.width}x${message.height}`);
}

export function handleAudioInfo(message) {
    if (message.codecId === CODEC_IDS.AAC && message.metadata && elements.enableAudioInput.checked) {
        appendLog(`Received JSON audioInfo: Codec ${message.codecId}, Metadata: ${JSON.stringify(message.metadata)}`);
        globalState.audioCodecId = message.codecId; 
        globalState.audioMetadata = message.metadata; 
        // Actual setupAudioDecoder will happen when WC_AUDIO_CONFIG_AAC binary message arrives
    }
}

export function handleStreamingStarted() {
    let targetRenderElement = null;
    if (globalState.decoderType === DECODER_TYPES.MSE) {
        targetRenderElement = elements.videoElement;
    } else if (globalState.decoderType === DECODER_TYPES.BROADWAY) {
        targetRenderElement = globalState.broadwayPlayer ? globalState.broadwayPlayer.canvas : elements.broadwayCanvas;
    } else if (globalState.decoderType === DECODER_TYPES.WEBCODECS) {
        targetRenderElement = elements.webcodecCanvas;
    }

    if (targetRenderElement) {
        targetRenderElement.classList.toggle('control-enabled', globalState.controlEnabledAtStart);
    }

    if (globalState.decoderType === DECODER_TYPES.MSE) {
        if (globalState.checkStateIntervalId) clearInterval(globalState.checkStateIntervalId);
        globalState.checkStateIntervalId = setInterval(checkForBadState, CHECK_STATE_INTERVAL_MS);
    }


    sendWebSocketMessage({ action: 'getBatteryLevel' });
    sendWebSocketMessage({ action: 'getWifiStatus' });
    sendWebSocketMessage({ action: 'getVolume' });
    updateDisplayOptionsOnStreamStart();
    appendLog("Streaming started handler executed.");
}

export function handleStreamingStopped(sendDisconnect = true) {
    const wasRunning = globalState.isRunning;
    appendLog(`Handle streaming stopped. Was running: ${wasRunning}, Send disconnect: ${sendDisconnect}`);

    if (globalState.checkStateIntervalId) {
		clearInterval(globalState.checkStateIntervalId);
		globalState.checkStateIntervalId = null;
	}
    closeAudio();
    stopVideoPlayback();

    if (elements.videoElement) {
        elements.videoElement.classList.remove('visible');
        elements.videoElement.classList.remove('control-enabled');
    }
    if (elements.broadwayCanvas) {
        elements.broadwayCanvas.classList.remove('visible');
        elements.broadwayCanvas.classList.remove('control-enabled');
        if (globalState.broadwayPlayer && globalState.broadwayPlayer.canvas){
             const ctx = globalState.broadwayPlayer.canvas.getContext('2d');
             if (ctx) ctx.clearRect(0, 0, globalState.broadwayPlayer.canvas.width, globalState.broadwayPlayer.canvas.height);
        } else if(elements.broadwayCanvas.getContext) {
            const ctx = elements.broadwayCanvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, elements.broadwayCanvas.width, elements.broadwayCanvas.height);
        }
    }
     if (elements.webcodecCanvas) {
        elements.webcodecCanvas.classList.remove('visible');
        elements.webcodecCanvas.classList.remove('control-enabled');
        if (globalState.webCodecCanvasCtx) {
             globalState.webCodecCanvasCtx.clearRect(0, 0, elements.webcodecCanvas.width, elements.webcodecCanvas.height);
        }
    }


    if (elements.videoPlaceholder) elements.videoPlaceholder.classList.remove('hidden');
    if (elements.videoBorder) elements.videoBorder.style.display = 'none';
    if (elements.streamArea) elements.streamArea.style.aspectRatio = '9 / 16';

	if (wasRunning || sendDisconnect === false) {
        globalState.isRunning = false;
        updateStatus('Disconnected');
        updateDisplayOptionsOnStreamStop();
    }
    resetStreamRelatedState();
    appendLog("Streaming stopped handler completed.");
}


export function handleResolutionChange(width, height) {
	if (!globalState.isRunning) return;
    updateVideoResolutionInStream(width, height);
    appendLog(`Resolution changed to: ${width}x${height}`);
}

export function handleVolumeInfo(message) {
    if (message.success) {
        if (elements.mediaVolumeSlider) {
            elements.mediaVolumeSlider.value = message.volume;
            updateSliderBackground(elements.mediaVolumeSlider);
        }
        updateSpeakerIconFromVolume(message.volume);
        updateStatus(`Volume: ${message.volume}%`);
    } else updateStatus(`Get Volume Error: ${message.error}`);
    appendLog(`Volume info: ${JSON.stringify(message)}`);
}

export function handleNavResponse(message) {
    if (message.success) updateStatus(`Nav ${message.key} OK`);
    else updateStatus(`Nav ${message.key} Error: ${message.error}`);
    appendLog(`Nav response: ${JSON.stringify(message)}`);
}

export function handleWifiStatusResponse(message) {
    const wifiToggleBtn = elements.wifiToggleBtn;
    if (wifiToggleBtn) wifiToggleBtn.classList.remove('pending');
    if (message.success) {
        globalState.isWifiOn = message.isWifiOn !== undefined ? message.isWifiOn : message.currentState;
        globalState.wifiSsid = message.ssid;
        updateWifiIndicatorUI();
        updateStatus(`Wi-Fi ${globalState.isWifiOn ? 'On' : 'Off'}${globalState.wifiSsid ? ` (${globalState.wifiSsid})` : ''}`);
    } else updateStatus(`Wi-Fi Error: ${message.error}`);
    appendLog(`WiFi status response: ${JSON.stringify(message)}`);
}

export function handleBatteryInfo(message) {
    if (message.success) updateBatteryLevelUI(message.batteryLevel);
    else updateStatus(`Battery Error: ${message.error}`);
    appendLog(`Battery info: ${JSON.stringify(message)}`);
}

export function handleLauncherAppsList(apps) {
    if (Array.isArray(apps)) {
        renderAppDrawer(apps);
    }
    appendLog(`Launcher apps list received. Count: ${apps?.length || 0}`);
}

export function handleLaunchAppResponse(message) {
    if (message.success) updateStatus(`App ${message.packageName} launched successfully.`);
    else updateStatus(`App Launch Error: ${message.error}`);
    appendLog(`Launch app response: ${JSON.stringify(message)}`);
}