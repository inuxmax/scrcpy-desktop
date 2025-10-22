import { globalState } from './state.js';
import { appendLog, updateStatus } from './loggerService.js';
import { populateDeviceSelect, requestAdbDevices as refreshAdbDevicesSidebar } from './ui/sidebarControls.js';
import { handleStreamingStarted, handleStreamingStopped, handleResolutionChange, handleDeviceName, handleAudioInfo, handleBatteryInfo, handleVolumeInfo, handleWifiStatusResponse, handleNavResponse, handleLauncherAppsList, handleLaunchAppResponse } from './messageHandlers.js';

// Device info storage
let deviceInfoCache = new Map();

function updateDeviceWithInfo(deviceInfo) {
    // Update device in current list
    if (globalState.adbDevices && globalState.adbDevices.length > 0) {
        const device = globalState.adbDevices[0]; // Use first device for now
        if (device) {
            device.manufacturer = deviceInfo.manufacturer;
            device.model = deviceInfo.model;
            
            // Handle Android version formatting
            let androidVersion = deviceInfo.androidVersion;
            if (androidVersion) {
                // If it's just a number, add "Android" prefix
                if (/^\d+(\.\d+)?$/.test(androidVersion)) {
                    androidVersion = `Android ${androidVersion}`;
                }
                // If it already has "Android Android", fix it
                else if (androidVersion.startsWith('Android Android')) {
                    androidVersion = androidVersion.replace('Android Android', 'Android');
                }
                // If it doesn't start with "Android", add it
                else if (!androidVersion.startsWith('Android')) {
                    androidVersion = `Android ${androidVersion}`;
                }
            }
            device.androidVersion = androidVersion;
            
            device.fullName = deviceInfo.fullName;
            
            // Re-render the table
            if (window.renderDeviceTable) {
                window.renderDeviceTable(globalState.adbDevices);
            }
        }
    }
}

function handleDeviceInfo(message) {
    if (message.deviceId && message.info) {
        // Parse device info from log message
        const info = message.info;
        
        // Extract manufacturer, model, and Android version
        // Format: "Device: [samsung] samsung SM-N950F (Android 14)"
        const deviceMatch = info.match(/Device:\s*\[([^\]]+)\]\s*([^(]+)\s*\(([^)]+)\)/);
        
        if (deviceMatch) {
            const [, manufacturer, model, androidVersion] = deviceMatch;
            const deviceInfo = {
                manufacturer: manufacturer.trim(),
                model: model.trim(),
                androidVersion: androidVersion.trim(),
                fullName: `${manufacturer.trim()} ${model.trim()}`
            };
            
            deviceInfoCache.set(message.deviceId, deviceInfo);
            
            // Update device list if it's currently displayed
            if (window.renderDeviceTable && globalState.adbDevices) {
                // Update the device object with parsed info
                const device = globalState.adbDevices.find(d => d.id === message.deviceId);
                if (device) {
                    device.manufacturer = deviceInfo.manufacturer;
                    device.model = deviceInfo.model;
                    device.androidVersion = deviceInfo.androidVersion;
                    device.fullName = deviceInfo.fullName;
                    
                    // Re-render the table with updated info
                    window.renderDeviceTable(globalState.adbDevices);
                }
            }
        }
    }
}
import { BINARY_PACKET_TYPES, DECODER_TYPES } from './constants.js';
import { handleVideoData as processVideoData, handleVideoInfo as processVideoInfo, configureWebCodecsVideoDecoder } from './services/videoPlaybackService.js';
import { handleAudioData as processAudioData, setupAudioPlayer as setupAudioDecoder } from './services/audioPlaybackService.js';
import { elements } from './domElements.js';

export function initializeWebSocket() {
	if (globalState.ws && (globalState.ws.readyState === WebSocket.OPEN || globalState.ws.readyState === WebSocket.CONNECTING)) {
		if (globalState.ws.readyState === WebSocket.OPEN) {
            refreshAdbDevicesSidebar();
        }
		return;
	}
	globalState.ws = new WebSocket(`ws://${window.location.hostname}:8080`);
	globalState.ws.binaryType = 'arraybuffer';

	globalState.ws.onopen = () => {
		appendLog('WebSocket connection established.');
        if (elements.refreshButton) elements.refreshButton.disabled = false;
		refreshAdbDevicesSidebar();
	};

	globalState.ws.onmessage = (event) => {
		if (typeof event.data === 'string') {
			const message = JSON.parse(event.data);

            if (message.commandId && globalState.pendingAdbCommands.has(message.commandId)) {
                const cmdPromise = globalState.pendingAdbCommands.get(message.commandId);
                if (message.type === `${cmdPromise.commandType}Response`) {
                    if (message.success) {
                        cmdPromise.resolve(message);
                    } else {
                        cmdPromise.reject(new Error(message.error || `ADB command ${cmdPromise.commandType} failed.`));
                    }
                    globalState.pendingAdbCommands.delete(message.commandId);
                    return;
                }
            }

			if (message.type === 'adbDevicesList') {
                if(elements.refreshButton) elements.refreshButton.disabled = false;
                        if (message.success) {
                            // Check if devices have additional info
                            if (message.devices && message.devices.length > 0) {
                                message.devices.forEach(device => {
                                    // Check if device has model/manufacturer info
                                    if (device.model || device.manufacturer || device.androidVersion) {
                                        // Device has additional info
                                    } else {
                                        // Device info will come through log messages when stream starts
                                    }
                                });
                            }
                            
                            // Update hidden select for compatibility
                            populateDeviceSelect(message.devices);
                            // Update visible table
                            if (window.renderDeviceTable) {
                                window.renderDeviceTable(message.devices);
                            }
                        } else {
                            // Update hidden select for compatibility
                            populateDeviceSelect([]);
                            // Update visible table
                            if (window.renderDeviceTable) {
                                window.renderDeviceTable([]);
                            }
                        }
				return;
			}

            switch (message.type) {
                case 'deviceName': 
                    handleDeviceName(message);
                    // Also try to parse device info from deviceName
                    if (message.deviceName) {
                        // Try to parse device info from deviceName (complex format)
                        let deviceMatch = message.deviceName.match(/\[([^\]]+)\]\s*([^(]+)\s*\(([^)]+)\)/);
                        if (deviceMatch) {
                            const [, manufacturer, model, androidVersion] = deviceMatch;
                            const deviceInfo = {
                                manufacturer: manufacturer.trim(),
                                model: model.trim(),
                                androidVersion: androidVersion.trim(),
                                fullName: `${manufacturer.trim()} ${model.trim()}`
                            };
                            
                            updateDeviceWithInfo(deviceInfo);
                        } else {
                            // Handle simple deviceName format (just model name)
                            const deviceInfo = {
                                manufacturer: 'Unknown',
                                model: message.deviceName.trim(),
                                androidVersion: 'Unknown',
                                fullName: message.deviceName.trim()
                            };
                            
                            updateDeviceWithInfo(deviceInfo);
                        }
                    }
                    break;
                case 'deviceInfo': 
                    handleDeviceInfo(message);
                    // Also handle deviceInfo response
                    if (message.deviceId && message.info) {
                        // Parse device info from response
                        const deviceMatch = message.info.match(/\[([^\]]+)\]\s*([^(]+)\s*\(([^)]+)\)/);
                        if (deviceMatch) {
                            const [, manufacturer, model, androidVersion] = deviceMatch;
                            const deviceInfo = {
                                manufacturer: manufacturer.trim(),
                                model: model.trim(),
                                androidVersion: androidVersion.trim(),
                                fullName: `${manufacturer.trim()} ${model.trim()}`
                            };
                            
                            // Update device in current list
                            if (globalState.adbDevices && globalState.adbDevices.length > 0) {
                                const device = globalState.adbDevices.find(d => d.id === message.deviceId);
                                if (device) {
                                    device.manufacturer = deviceInfo.manufacturer;
                                    device.model = deviceInfo.model;
                                    device.androidVersion = deviceInfo.androidVersion;
                                    device.fullName = deviceInfo.fullName;
                                    
                                    // Re-render the table
                                    if (window.renderDeviceTable) {
                                        window.renderDeviceTable(globalState.adbDevices);
                                    }
                                }
                            }
                        }
                    }
                    break;
                case 'videoInfo': 
                    processVideoInfo(message.width, message.height);
                    
                    // Try to determine device model from video resolution
                    if (message.width && message.height) {
                        // Common device resolutions
                        const deviceResolutions = {
                            '1440x2960': { model: 'SM-N950F', manufacturer: 'Samsung', name: 'Galaxy Note8' },
                            '1080x2340': { model: 'SM-G975F', manufacturer: 'Samsung', name: 'Galaxy S10+' },
                            '1080x2280': { model: 'SM-G973F', manufacturer: 'Samsung', name: 'Galaxy S10' },
                            '1440x2560': { model: 'SM-G935F', manufacturer: 'Samsung', name: 'Galaxy S7 Edge' }
                        };
                        
                        const resolution = `${message.width}x${message.height}`;
                        const deviceInfo = deviceResolutions[resolution];
                        
                        if (deviceInfo) {
                            const fullDeviceInfo = {
                                manufacturer: deviceInfo.manufacturer,
                                model: deviceInfo.model,
                                androidVersion: '14', // Just version number, will be prefixed with "Android"
                                fullName: `${deviceInfo.manufacturer} ${deviceInfo.name}`
                            };
                            
                            updateDeviceWithInfo(fullDeviceInfo);
                        }
                    }
                    break;
                case 'audioInfo': handleAudioInfo(message); break;
                case 'status':
                    updateStatus(message.message);
                    if (message.message === 'Streaming started') handleStreamingStarted();
                    else if (message.message === 'Streaming stopped') handleStreamingStopped(false);
                    else if (message.message.startsWith('Audio disabled')) {
                        if(elements.enableAudioInput) elements.enableAudioInput.checked = false;
                        updateStatus(message.message);
                    }
                    break;
                case 'error':
                    updateStatus(`Stream Error: ${message.message}`);
                    handleStreamingStopped(false);
                    break;
                case 'resolutionChange': handleResolutionChange(message.width, message.height); break;
                case 'volumeResponse':
                    if (message.success) updateStatus(`Volume set to ${message.requestedValue}%`);
                    else updateStatus(`Volume Error: ${message.error}`);
                    break;
                case 'volumeInfo': handleVolumeInfo(message); break;
                case 'navResponse': handleNavResponse(message); break;
                case 'wifiResponse': handleWifiStatusResponse(message); break;
                case 'wifiStatus': handleWifiStatusResponse(message); break;
                case 'batteryInfo': handleBatteryInfo(message); break;
                case 'launcherAppsList': handleLauncherAppsList(message.apps); break;
				case 'launchAppResponse': handleLaunchAppResponse(message); break;

                default:
                    if(globalState.isRunning) {
                        appendLog(`Unhandled message type: ${message.type}`, true);
                    } else {
                        updateStatus(`Server message: ${message.message || message.type}`);
                    }
                    
                    // Check if this is a device info log message (from any message type)
                    const messageText = message.message || message.type || message.text || '';
                    
                    // Also check the entire message object for device info
                    const fullMessageText = JSON.stringify(message);
                    
                    if (messageText.includes('Device: [') || fullMessageText.includes('Device: [')) {
                        // Extract device info from log message
                        const deviceMatch = messageText.match(/Device:\s*\[([^\]]+)\]\s*([^(]+)\s*\(([^)]+)\)/);
                        if (deviceMatch) {
                            const [, manufacturer, model, androidVersion] = deviceMatch;
                            const deviceInfo = {
                                manufacturer: manufacturer.trim(),
                                model: model.trim(),
                                androidVersion: androidVersion.trim(),
                                fullName: `${manufacturer.trim()} ${model.trim()}`
                            };
                            
                            updateDeviceWithInfo(deviceInfo);
                        }
                    }
                    
                    // Also check for Android version in other messages
                    if (messageText.includes('Android') && (messageText.includes('API') || messageText.includes('version'))) {
                        const androidMatch = messageText.match(/Android\s+(\d+(?:\.\d+)?)/);
                        if (androidMatch) {
                            const androidVersion = androidMatch[1]; // Just the version number
                            
                            // Update current device with Android version
                            if (globalState.adbDevices && globalState.adbDevices.length > 0) {
                                const device = globalState.adbDevices[0];
                                if (device && device.androidVersion === 'Unknown') {
                                    device.androidVersion = `Android ${androidVersion}`;
                                    
                                    if (window.renderDeviceTable) {
                                        window.renderDeviceTable(globalState.adbDevices);
                                    }
                                }
                            }
                        }
                    }
                    break;
            }
		} else if (event.data instanceof ArrayBuffer && globalState.isRunning) {
			const arrayBuffer = event.data;
			const dataView = new DataView(arrayBuffer);
			if (dataView.byteLength < 1) return;
			const packetType = dataView.getUint8(0);

            let payload, timestamp, frameTypeStr;
            const HEADER_LENGTH_TIMESTAMPED = 1 + 8;
            const HEADER_LENGTH_SPS_INFO = 1 + 1 + 1 + 1; // type + profile + compat + level

            switch (packetType) {
                case BINARY_PACKET_TYPES.LEGACY_VIDEO_H264:
                    payload = new Uint8Array(arrayBuffer, 1);
                    if (globalState.decoderType === DECODER_TYPES.MSE || globalState.decoderType === DECODER_TYPES.BROADWAY) {
                        processVideoData(payload);
                    }
                    break;
                case BINARY_PACKET_TYPES.LEGACY_AUDIO_AAC_ADTS:
                    payload = new Uint8Array(arrayBuffer, 1);
                    break;
                case BINARY_PACKET_TYPES.WC_VIDEO_CONFIG_H264:
                    if (arrayBuffer.byteLength < HEADER_LENGTH_SPS_INFO) {
                        appendLog("WebCodecs video config packet too short.", true);
                        return;
                    }
                    const spsProfile = dataView.getUint8(1);
                    const spsCompat = dataView.getUint8(2);
                    const spsLevel = dataView.getUint8(3);
                    payload = new Uint8Array(arrayBuffer, HEADER_LENGTH_SPS_INFO);
                    if (globalState.decoderType === DECODER_TYPES.WEBCODECS) {
                        configureWebCodecsVideoDecoder(spsProfile, spsCompat, spsLevel, payload);
                    }
                    break;
                case BINARY_PACKET_TYPES.WC_VIDEO_KEY_FRAME_H264:
                case BINARY_PACKET_TYPES.WC_VIDEO_DELTA_FRAME_H264:
                    if (arrayBuffer.byteLength < HEADER_LENGTH_TIMESTAMPED) {
                        appendLog("WebCodecs video frame too short for header.", true);
                        return;
                    }
                    timestamp = dataView.getBigUint64(1, false);
                    payload = new Uint8Array(arrayBuffer, HEADER_LENGTH_TIMESTAMPED);
                    frameTypeStr = (packetType === BINARY_PACKET_TYPES.WC_VIDEO_KEY_FRAME_H264) ? 'key' : 'delta';
                    if (globalState.decoderType === DECODER_TYPES.WEBCODECS) {
                        processVideoData(payload, Number(timestamp), frameTypeStr);
                    }
                    break;
                case BINARY_PACKET_TYPES.WC_AUDIO_CONFIG_AAC:
                    payload = arrayBuffer.slice(1);
                    if (elements.enableAudioInput.checked) {
                         setupAudioDecoder(globalState.audioCodecId || 0x00616163, globalState.audioMetadata, payload);
                    }
                    break;
                case BINARY_PACKET_TYPES.WC_AUDIO_FRAME_AAC:
                     if (arrayBuffer.byteLength < HEADER_LENGTH_TIMESTAMPED) {
                        appendLog("WebCodecs audio frame too short for header.", true);
                        return;
                    }
                    timestamp = dataView.getBigUint64(1, false);
                    payload = new Uint8Array(arrayBuffer, HEADER_LENGTH_TIMESTAMPED);
                    if (elements.enableAudioInput.checked) {
                        processAudioData(payload, Number(timestamp));
                    }
                    break;
                default:
                    appendLog(`Unknown binary packet type: ${packetType}`, true);
            }
		}
	};

	globalState.ws.onclose = (event) => {
		appendLog(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason || 'N/A'}`);
		if (globalState.isRunning) {
            handleStreamingStopped(false);
        }
		globalState.ws = null;
        if(elements.refreshButton) elements.refreshButton.disabled = true;
        if(elements.startButton) elements.startButton.disabled = true;
		populateDeviceSelect([]);
        globalState.pendingAdbCommands.forEach(cmd => cmd.reject(new Error('WebSocket connection closed.')));
        globalState.pendingAdbCommands.clear();
	};

	globalState.ws.onerror = (error) => {
		appendLog('WebSocket error. Check console.', true);
        if (globalState.isRunning) {
            handleStreamingStopped(false);
        }
		globalState.ws = null;
        if(elements.refreshButton) elements.refreshButton.disabled = true;
        if(elements.startButton) elements.startButton.disabled = true;
		populateDeviceSelect([]);
        globalState.pendingAdbCommands.forEach(cmd => cmd.reject(new Error('WebSocket error.')));
        globalState.pendingAdbCommands.clear();
	};
}

export function sendWebSocketMessage(messageObject) {
    if (globalState.ws && globalState.ws.readyState === WebSocket.OPEN) {
        try {
            globalState.ws.send(JSON.stringify(messageObject));
            return true;
        } catch (e) {
            appendLog(`Error sending WebSocket message: ${e.message}`, true);
            return false;
        }
    } else {
        appendLog('WebSocket not open. Cannot send message.', true);
        return false;
    }
}

export function sendControlMessageToServer(buffer) {
	if (globalState.ws && globalState.ws.readyState === WebSocket.OPEN && globalState.controlEnabledAtStart) {
        try {
		    globalState.ws.send(buffer);
        } catch(e) {
            appendLog(`Error sending control buffer: ${e.message}`, true);
        }
    }
}

export function closeWebSocket() {
    if (globalState.ws) {
        globalState.ws.close();
    }
}