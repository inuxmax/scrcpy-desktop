import { globalState } from './state.js';
import { elements } from './domElements.js';

import { initializeWebSocket, sendWebSocketMessage, closeWebSocket } from './websocketService.js';
import { initGlobalErrorHandling, appendLog } from './loggerService.js';
import { initInputService } from './services/inputService.js';
import { stopVideoPlayback } from './services/videoPlaybackService.js';
import { closeAudio } from './services/audioPlaybackService.js';

import { initSidebarControls, startStreaming } from './ui/sidebarControls.js';
import { initTaskbarControls } from './ui/taskbarControls.js';
import { initModals, showSettingsModal } from './ui/modals.js';
import { initAppDrawer } from './ui/appDrawer.js';
import { initHeaderControls } from './ui/headerControls.js';

document.addEventListener('DOMContentLoaded', () => {
    initGlobalErrorHandling();

    initHeaderControls();
    initSidebarControls();
    initTaskbarControls();
    initModals();
    initAppDrawer();
    
            // Make functions globally available
            window.startStreaming = startStreaming;
            window.sendWebSocketMessage = sendWebSocketMessage;

    initInputService();

    initializeWebSocket();

    appendLog('Scrcpy Desktop Client Initialized.');

    window.addEventListener('beforeunload', () => {
        if (globalState.isRunning) {
            // Only send disconnect if WebSocket is still open
            if (globalState.ws && globalState.ws.readyState === WebSocket.OPEN) {
                        try {
                            sendWebSocketMessage({ action: 'disconnect' });
                        } catch (e) {
                            // Could not send disconnect message
                        }
            }

            if (globalState.checkStateIntervalId) {
                clearInterval(globalState.checkStateIntervalId);
                globalState.checkStateIntervalId = null;
            }
            closeAudio();
            stopVideoPlayback();

            closeWebSocket();
            appendLog('Attempted cleanup on page unload.');
        }
    });

    if (elements.toggleLogBtn && elements.logContent) {
        elements.toggleLogBtn.addEventListener('click', () => {
            const isExpanded = elements.toggleLogBtn.getAttribute('aria-expanded') === 'true';
            elements.toggleLogBtn.setAttribute('aria-expanded', (!isExpanded).toString());
            elements.toggleLogBtn.textContent = isExpanded ? 'Show Logs' : 'Hide Logs';
            elements.logContent.classList.toggle('hidden', isExpanded);
        });
    }

    // Stream popup controls
    const streamArea = document.getElementById('streamArea');
    const closeStreamBtn = document.getElementById('closeStreamBtn');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');

    // Show stream popup
    window.showStreamPopup = function() {
        if (streamArea) {
            streamArea.style.display = 'block';
            setTimeout(() => {
                streamArea.classList.add('show');
            }, 10);
        }
    };

    // Hide stream popup
    window.hideStreamPopup = function() {
        if (streamArea) {
            streamArea.classList.remove('show');
            setTimeout(() => {
                streamArea.style.display = 'none';
            }, 300);
        }
    };

    // Close stream popup button
    if (closeStreamBtn) {
        closeStreamBtn.addEventListener('click', () => {
            window.hideStreamPopup();
            if (stopBtn && !stopBtn.disabled) {
                stopBtn.click();
            }
        });
    }

    // Start stream button - show popup
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            window.showStreamPopup();
        });
    }

    // Stop stream button - hide popup
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            window.hideStreamPopup();
        });
    }

    // Render device list from WebSocket data
    window.renderDeviceList = function() {
        const deviceListBody = document.getElementById('deviceListBody');
        
        if (!deviceListBody) {
            return;
        }

        // Show loading state
        deviceListBody.innerHTML = `
            <tr class="loading-row">
                <td colspan="6" style="text-align: center; padding: 40px;">
                    <div class="loading-spinner">🔄</div>
                    <div>Đang tải danh sách thiết bị...</div>
                </td>
            </tr>
        `;
    };

    // Render device table with real data
    window.renderDeviceTable = function(devices) {
        const deviceListBody = document.getElementById('deviceListBody');
        
        if (!deviceListBody) {
            return;
        }

        if (!devices || devices.length === 0) {
            deviceListBody.innerHTML = `
                <tr class="no-devices-row">
                    <td colspan="6">
                        <div class="no-devices-icon">📱</div>
                        <div class="no-devices-title">Không có thiết bị nào được kết nối</div>
                        <div class="no-devices-subtitle">Hãy kết nối thiết bị Android qua USB hoặc WiFi</div>
                    </td>
                </tr>
            `;
            return;
        }

                let html = '';
                devices.forEach((device, index) => {
                    const deviceId = device.id || device.serial;
                    const serial = device.serial || device.id;
                    const isOnline = device.status === 'device' || device.type === 'device';
                    
                    // Parse device info from device object or use defaults
                    let deviceName = 'Unknown Device';
                    let osVersion = 'Unknown OS';
                    
                    // Check if we have cached device info
                    if (device.manufacturer && device.model) {
                        deviceName = `${device.manufacturer} ${device.model}`;
                    } else if (device.model) {
                        deviceName = device.model;
                    } else if (device.fullName) {
                        deviceName = device.fullName;
                    }
                    
                    if (device.androidVersion) {
                        // Check if androidVersion already has "Android" prefix
                        if (device.androidVersion.startsWith('Android')) {
                            osVersion = device.androidVersion;
                        } else {
                            osVersion = `Android ${device.androidVersion}`;
                        }
                        
                        // Fix duplicate "Android" if exists
                        if (osVersion.startsWith('Android Android')) {
                            osVersion = osVersion.replace('Android Android', 'Android');
                        }
                        
                    } else if (device.osVersion) {
                        // Check if osVersion already has "Android" prefix
                        if (device.osVersion.startsWith('Android')) {
                            osVersion = device.osVersion;
                        } else {
                            osVersion = `Android ${device.osVersion}`;
                        }
                        
                        // Fix duplicate "Android" if exists
                        if (osVersion.startsWith('Android Android')) {
                            osVersion = osVersion.replace('Android Android', 'Android');
                        }
                    }
                    
                    html += `
                        <tr>
                            <td><input type="checkbox" class="device-checkbox" data-device-id="${deviceId}"></td>
                            <td>${index + 1}</td>
                            <td class="device-name-cell">
                                <div>${deviceName}</div>
                                <small style="color: #6b7280;">Default</small>
                            </td>
                            <td class="device-serial-cell">${serial}</td>
                            <td><span class="status-badge red">No action</span></td>
                            <td><span class="status-badge gray">Package Empty</span></td>
                            <td><span class="status-badge ${isOnline ? 'green' : 'red'}">${isOnline ? 'Online' : 'Offline'}</span></td>
                            <td><span class="status-badge gray">WIFI</span></td>
                            <td></td>
                            <td>-</td>
                            <td>${osVersion}</td>
                            <td>
                                <div class="action-buttons">
                                    <button class="action-btn view" onclick="viewDevice('${deviceId}')" title="Xem">
                                        👁️
                                    </button>
                                    <button class="action-btn edit" onclick="editDevice('${deviceId}')" title="Chỉnh sửa">
                                        ✏️
                                    </button>
                                    <button class="action-btn share" onclick="shareDevice('${deviceId}')" title="Chia sẻ">
                                        📤
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                });

        deviceListBody.innerHTML = html;
    };

    // Global functions for device actions
    window.viewDevice = function(deviceId) {
        // Set selected device ID directly
        globalState.selectedDeviceId = deviceId;
        
        // Select device in dropdown (but don't trigger change event to avoid re-rendering)
        const devicesSelect = document.getElementById('devices');
        if (devicesSelect) {
            devicesSelect.value = deviceId;
            // Don't dispatch change event to avoid triggering renderDeviceList
        }
        
        // Show stream popup
        window.showStreamPopup();
        
        // Start stream immediately
        setTimeout(async () => {
            try {
                // Send a simple request to trigger device info
                if (window.sendWebSocketMessage) {
                    window.sendWebSocketMessage({ 
                        action: 'start', 
                        deviceId: globalState.selectedDeviceId,
                        settings: {
                            maxFps: 60,
                            bitrate: 8000000,
                            enableAudio: false,
                            enableControl: true,
                            video: true,
                            noPowerOn: false,
                            turnScreenOff: false,
                            powerOffOnClose: false,
                            displayMode: 'default',
                            rotationLock: 'unlocked',
                            resolution: '',
                            dpi: '',
                            decoderType: 'mse'
                        }
                    });
                }
                
                await startStreaming();
            } catch (error) {
                console.error('Error starting stream:', error);
                // Don't clear device list on error
            }
        }, 500);
    };

    window.editDevice = function(deviceId) {
        // Set selected device ID directly
        globalState.selectedDeviceId = deviceId;
        
        // Select device in dropdown (but don't trigger change event to avoid re-rendering)
        const devicesSelect = document.getElementById('devices');
        if (devicesSelect) {
            devicesSelect.value = deviceId;
            // Don't dispatch change event to avoid triggering renderDeviceList
        }
        // Open device settings modal
        showSettingsModal();
    };

    window.deleteDevice = function(deviceId) {
        // Remove device from list
    };

    // Refresh device list when devices select changes
    const devicesSelect = document.getElementById('devices');
    if (devicesSelect) {
        devicesSelect.addEventListener('change', () => {
            // Only refresh if we're not in the middle of a device action
            if (!globalState.isRunning) {
                window.renderDeviceList();
            }
        });
    }

    // Initial render - show loading state immediately
    window.renderDeviceList();

    // Navigation sidebar functionality
    const navSectionHeaders = document.querySelectorAll('.nav-section-header');
    navSectionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            header.classList.toggle('collapsed');
        });
    });
});