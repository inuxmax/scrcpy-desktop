import { elements } from '../domElements.js';
import { globalState } from '../state.js';
import { handleConnectByIp, handlePairByQr as initiatePairByQr, cancelQrPairingSession } from '../services/adbClientService.js';
import { appendLog } from '../loggerService.js';
import { requestAdbDevices } from './sidebarControls.js';


function connectToQrWebSocket() {
	if (globalState.qrWs && globalState.qrWs.readyState === WebSocket.OPEN) return;
	globalState.qrWs = new WebSocket(`ws://${window.location.hostname}:3001`);
	globalState.qrWs.onopen = () => { appendLog('QR WebSocket connection established.'); };
	globalState.qrWs.onmessage = (event) => {
		try {
			const data = JSON.parse(event.data);
			appendLog(`QR Status: ${data.statusMessage}`);
			elements.qrPairingMessage.textContent = data.statusMessage;
			elements.qrPairingSpinner.style.display = data.isProcessing ? 'inline-block' : 'none';
			elements.qrPairingStatus.className = 'modal-status';
			if (data.status === 'success') {
				elements.qrPairingStatus.classList.add('success');
				requestAdbDevices();
				setTimeout(hideQrPairingModal, 3000);
			} else if (data.status === 'error' || data.status === 'cancelled') {
				elements.qrPairingStatus.classList.add(data.status === 'error' ? 'error' : 'info');
			}
			if (!data.isProcessing) {
				elements.qrPairingDoneBtn.style.display = 'block';
				globalState.isQrProcessActive = false;
			}
		} catch (e) {
			appendLog('Error parsing QR WebSocket message: ' + e.message, true);
			elements.qrPairingMessage.textContent = 'Error processing status update.';
			elements.qrPairingSpinner.style.display = 'none';
			elements.qrPairingStatus.className = 'modal-status error';
			elements.qrPairingDoneBtn.style.display = 'block';
			globalState.isQrProcessActive = false;
		}
	};
	globalState.qrWs.onclose = () => {
		appendLog('QR WebSocket connection closed.');
		if (globalState.isQrProcessActive) {
			elements.qrPairingSpinner.style.display = 'none';
			elements.qrPairingDoneBtn.style.display = 'block';
			if (!elements.qrPairingStatus.classList.contains('success') && !elements.qrPairingStatus.classList.contains('error')) {
                 elements.qrPairingMessage.textContent = 'QR Process ended or connection lost.';
            }
			globalState.isQrProcessActive = false;
		}
	};
	globalState.qrWs.onerror = (error) => {
		appendLog('QR WebSocket error: ' + error.message, true);
		elements.qrPairingMessage.textContent = 'QR WebSocket error. Check console.';
		elements.qrPairingSpinner.style.display = 'none';
		elements.qrPairingStatus.className = 'modal-status error';
		elements.qrPairingDoneBtn.style.display = 'block';
		globalState.isQrProcessActive = false;
	};
}


export function showAddWirelessDeviceModal() {
	elements.ipAddressInput.value = '';
	elements.ipConnectStatus.textContent = '';
	elements.ipConnectStatus.className = 'modal-status';
	elements.addWirelessDeviceModalOverlay.style.display = 'flex';
}

export function hideAddWirelessDeviceModal() {
	elements.addWirelessDeviceModalOverlay.style.display = 'none';
}

export function showQrPairingModal() {
	elements.qrCodeDisplay.innerHTML = '';
	if (globalState.qrCodeInstance) globalState.qrCodeInstance.clear();
	elements.qrPairingMessage.textContent = 'Initializing...';
	elements.qrPairingSpinner.style.display = 'inline-block';
	elements.qrPairingStatus.className = 'modal-status';
	elements.qrPairingDoneBtn.style.display = 'none';
	elements.qrPairingModalOverlay.style.display = 'flex';
}

export async function hideQrPairingModal() {
	await cancelQrPairingSession();
	elements.qrPairingModalOverlay.style.display = 'none';
}

// Settings Modal Functions
export function showSettingsModal() {
	// Copy current values from main form to modal
	if (elements.decoderTypeSelect && elements.modalDecoderType) {
		elements.modalDecoderType.value = elements.decoderTypeSelect.value;
	}
	if (elements.resolutionSelect && elements.modalResolution) {
		elements.modalResolution.value = elements.resolutionSelect.value;
	}
	if (elements.customResolutionInput && elements.modalCustomResolution) {
		elements.modalCustomResolution.value = elements.customResolutionInput.value;
	}
	if (elements.dpiSelect && elements.modalDpi) {
		elements.modalDpi.value = elements.dpiSelect.value;
	}
	if (elements.customDpiInput && elements.modalCustomDpi) {
		elements.modalCustomDpi.value = elements.customDpiInput.value;
	}
	if (elements.maxFpsSelect && elements.modalMaxFps) {
		elements.modalMaxFps.value = elements.maxFpsSelect.value;
	}
	if (elements.rotationLockSelect && elements.modalRotationLock) {
		elements.modalRotationLock.value = elements.rotationLockSelect.value;
	}
	if (elements.bitrateSelect && elements.modalBitrate) {
		elements.modalBitrate.value = elements.bitrateSelect.value;
	}
	if (elements.customBitrateInput && elements.modalCustomBitrate) {
		elements.modalCustomBitrate.value = elements.customBitrateInput.value;
	}
	
	// Copy Display Mode values
	if (elements.displayModeCheckboxes && elements.displayModeCheckboxes.length > 0) {
		elements.displayModeCheckboxes.forEach(checkbox => {
			const modalCheckbox = document.getElementById(`modal${checkbox.id.charAt(0).toUpperCase() + checkbox.id.slice(1)}`);
			if (modalCheckbox) {
				modalCheckbox.checked = checkbox.checked;
			}
		});
	}
	
	// Copy Additional Options values
	if (elements.noPowerOnInput && elements.modalNoPowerOn) {
		elements.modalNoPowerOn.checked = elements.noPowerOnInput.checked;
	}
	if (elements.turnScreenOffInput && elements.modalTurnScreenOff) {
		elements.modalTurnScreenOff.checked = elements.turnScreenOffInput.checked;
	}
	if (elements.powerOffOnCloseInput && elements.modalPowerOffOnClose) {
		elements.modalPowerOffOnClose.checked = elements.powerOffOnCloseInput.checked;
	}
	if (elements.enableAudioInput && elements.modalEnableAudio) {
		elements.modalEnableAudio.checked = elements.enableAudioInput.checked;
	}
	if (elements.enableControlInput && elements.modalEnableControl) {
		elements.modalEnableControl.checked = elements.enableControlInput.checked;
	}
	
	elements.settingsModalOverlay.style.display = 'flex';
}

function hideSettingsModal() {
	elements.settingsModalOverlay.style.display = 'none';
}

function saveSettings() {
	// Copy values from modal back to main form
	if (elements.modalDecoderType && elements.decoderTypeSelect) {
		elements.decoderTypeSelect.value = elements.modalDecoderType.value;
	}
	if (elements.modalResolution && elements.resolutionSelect) {
		elements.resolutionSelect.value = elements.modalResolution.value;
	}
	if (elements.modalCustomResolution && elements.customResolutionInput) {
		elements.customResolutionInput.value = elements.modalCustomResolution.value;
	}
	if (elements.modalDpi && elements.dpiSelect) {
		elements.dpiSelect.value = elements.modalDpi.value;
	}
	if (elements.modalCustomDpi && elements.customDpiInput) {
		elements.customDpiInput.value = elements.modalCustomDpi.value;
	}
	if (elements.modalMaxFps && elements.maxFpsSelect) {
		elements.maxFpsSelect.value = elements.modalMaxFps.value;
	}
	if (elements.modalRotationLock && elements.rotationLockSelect) {
		elements.rotationLockSelect.value = elements.modalRotationLock.value;
	}
	if (elements.modalBitrate && elements.bitrateSelect) {
		elements.bitrateSelect.value = elements.modalBitrate.value;
	}
	if (elements.modalCustomBitrate && elements.customBitrateInput) {
		elements.customBitrateInput.value = elements.modalCustomBitrate.value;
	}
	
	// Copy Display Mode values back
	if (elements.displayModeCheckboxes && elements.displayModeCheckboxes.length > 0) {
		elements.displayModeCheckboxes.forEach(checkbox => {
			const modalCheckbox = document.getElementById(`modal${checkbox.id.charAt(0).toUpperCase() + checkbox.id.slice(1)}`);
			if (modalCheckbox) {
				checkbox.checked = modalCheckbox.checked;
			}
		});
	}
	
	// Copy Additional Options values back
	if (elements.modalNoPowerOn && elements.noPowerOnInput) {
		elements.noPowerOnInput.checked = elements.modalNoPowerOn.checked;
	}
	if (elements.modalTurnScreenOff && elements.turnScreenOffInput) {
		elements.turnScreenOffInput.checked = elements.modalTurnScreenOff.checked;
	}
	if (elements.modalPowerOffOnClose && elements.powerOffOnCloseInput) {
		elements.powerOffOnCloseInput.checked = elements.modalPowerOffOnClose.checked;
	}
	if (elements.modalEnableAudio && elements.enableAudioInput) {
		elements.enableAudioInput.checked = elements.modalEnableAudio.checked;
	}
	if (elements.modalEnableControl && elements.enableControlInput) {
		elements.enableControlInput.checked = elements.modalEnableControl.checked;
	}
	
	// Trigger change events to update the UI
	if (elements.decoderTypeSelect) {
		elements.decoderTypeSelect.dispatchEvent(new Event('change'));
	}
	if (elements.resolutionSelect) {
		elements.resolutionSelect.dispatchEvent(new Event('change'));
	}
	if (elements.dpiSelect) {
		elements.dpiSelect.dispatchEvent(new Event('change'));
	}
	if (elements.rotationLockSelect) {
		elements.rotationLockSelect.dispatchEvent(new Event('change'));
	}
	
	// Trigger change events for checkboxes
	if (elements.displayModeCheckboxes && elements.displayModeCheckboxes.length > 0) {
		elements.displayModeCheckboxes.forEach(checkbox => {
			checkbox.dispatchEvent(new Event('change'));
		});
	}
	if (elements.enableControlInput) {
		elements.enableControlInput.dispatchEvent(new Event('change'));
	}
	
	hideSettingsModal();
}


export function initModals() {
    if (elements.addWirelessDeviceBtn) {
        elements.addWirelessDeviceBtn.addEventListener('click', showAddWirelessDeviceModal);
    }
	if (elements.closeAddWirelessModalBtn) {
        elements.closeAddWirelessModalBtn.addEventListener('click', hideAddWirelessDeviceModal);
    }
	if (elements.connectByIpBtn) {
        elements.connectByIpBtn.addEventListener('click', handleConnectByIp);
    }
	if (elements.pairByQrBtn) {
        elements.pairByQrBtn.addEventListener('click', () => initiatePairByQr(connectToQrWebSocket));
    }
	if (elements.closeQrPairingModalBtn) {
        elements.closeQrPairingModalBtn.addEventListener('click', hideQrPairingModal);
    }
	if (elements.qrPairingDoneBtn) {
        elements.qrPairingDoneBtn.addEventListener('click', hideQrPairingModal);
    }

    if (elements.addWirelessDeviceModalOverlay) {
        elements.addWirelessDeviceModalOverlay.addEventListener('click', (event) => {
            if (event.target === elements.addWirelessDeviceModalOverlay) hideAddWirelessDeviceModal();
        });
    }
	if (elements.qrPairingModalOverlay) {
        elements.qrPairingModalOverlay.addEventListener('click', (event) => {
            if (event.target === elements.qrPairingModalOverlay) hideQrPairingModal();
        });
    }
	
	// Settings Modal
	if (elements.settingsBtn) {
		elements.settingsBtn.addEventListener('click', () => {
			showSettingsModal();
		});
	}
	
	if (elements.closeSettingsModalBtn) {
		elements.closeSettingsModalBtn.addEventListener('click', () => {
			hideSettingsModal();
		});
	}
	
	if (elements.saveSettingsBtn) {
		elements.saveSettingsBtn.addEventListener('click', () => {
			saveSettings();
		});
	}
	
	if (elements.cancelSettingsBtn) {
		elements.cancelSettingsBtn.addEventListener('click', () => {
			hideSettingsModal();
		});
	}
	
	if (elements.settingsModalOverlay) {
		elements.settingsModalOverlay.addEventListener('click', (event) => {
			if (event.target === elements.settingsModalOverlay) hideSettingsModal();
		});
	}
	
	// Add event listeners for modal display mode checkboxes
	const modalDisplayModeCheckboxes = document.querySelectorAll('input[name="modalDisplayMode"]');
	if (modalDisplayModeCheckboxes.length > 0) {
		modalDisplayModeCheckboxes.forEach(checkbox => {
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					// Uncheck all other display mode checkboxes
					modalDisplayModeCheckboxes.forEach(cb => {
						if (cb !== checkbox) cb.checked = false;
					});
				}
			});
		});
	}
}