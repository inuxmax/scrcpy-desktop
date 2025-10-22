import { globalState } from '../state.js';
import { elements } from '../domElements.js';
import { appendLog } from '../loggerService.js';
import * as C from '../constants.js';

export function setupAudioPlayer(codecId, metadata, audioConfigData = null) {
	if (codecId !== C.CODEC_IDS.AAC) {
        appendLog(`Unsupported audio codec ID: ${codecId}`, true);
        return;
    }
	if (!window.AudioContext || !window.AudioDecoder) {
        appendLog('AudioContext or AudioDecoder not supported by browser.', true);
        return;
    }
	try {
		if (!globalState.audioContext || globalState.audioContext.state === 'closed') {
            globalState.audioContext = new AudioContext({ sampleRate: metadata?.sampleRate || 48000 });
        }
		
        if (globalState.webCodecsAudioDecoder && globalState.webCodecsAudioDecoder.state !== 'closed') {
            globalState.webCodecsAudioDecoder.close();
        }

		globalState.webCodecsAudioDecoder = new AudioDecoder({
			output: (audioData) => {
				try {
					if (!globalState.audioContext || globalState.audioContext.state === 'closed') return;
					const numberOfChannels = audioData.numberOfChannels;
					const sampleRate = audioData.sampleRate;
					const buffer = globalState.audioContext.createBuffer(numberOfChannels, audioData.numberOfFrames, sampleRate);
					const isInterleaved = audioData.format === 'f32' || audioData.format === 'f32-interleaved';
					if (isInterleaved) {
						const interleavedData = new Float32Array(audioData.numberOfFrames * numberOfChannels);
						audioData.copyTo(interleavedData, { planeIndex: 0 });
						for (let channel = 0; channel < numberOfChannels; channel++) {
							const channelData = buffer.getChannelData(channel);
							for (let i = 0; i < audioData.numberOfFrames; i++) channelData[i] = interleavedData[i * numberOfChannels + channel];
						}
					} else {
                        for (let channel = 0; channel < numberOfChannels; channel++) {
                            audioData.copyTo(buffer.getChannelData(channel), { planeIndex: channel });
                        }
                    }
					const source = globalState.audioContext.createBufferSource();
					source.buffer = buffer;
					source.connect(globalState.audioContext.destination);
					const currentTime = globalState.audioContext.currentTime;
					const bufferDuration = audioData.numberOfFrames / sampleRate;
                    const videoTime = (globalState.decoderType === 'mse' && elements.videoElement) ? elements.videoElement.currentTime : 0;

					if (!globalState.receivedFirstAudioPacket) {
						globalState.nextAudioTime = Math.max(currentTime, videoTime);
						globalState.receivedFirstAudioPacket = true;
					}
					if (globalState.nextAudioTime < currentTime) globalState.nextAudioTime = currentTime;
					source.start(globalState.nextAudioTime);
					globalState.nextAudioTime += bufferDuration;
				} catch (e) {
                    appendLog(`Error playing audio data: ${e.message}`, true);
                } finally {
                    audioData.close();
                }
			},
			error: (error) => {
                appendLog(`AudioDecoder error: ${error.message}`, true);
            },
		});

        const config = {
			codec: 'mp4a.40.2', 
			sampleRate: metadata?.sampleRate || 48000,
			numberOfChannels: metadata?.channelConfig || 2
		};
        if (audioConfigData) {
            config.description = audioConfigData;
        }

		globalState.webCodecsAudioDecoder.configure(config);
		globalState.audioCodecId = codecId;
		globalState.audioMetadata = metadata;
		globalState.receivedFirstAudioPacket = false;
		globalState.nextAudioTime = 0;
		globalState.totalAudioFrames = 0;
        appendLog('Audio player initialized for WebCodecs.');
	} catch (e) {
		appendLog(`Error setting up audio player: ${e.message}`, true);
		globalState.webCodecsAudioDecoder = null;
		globalState.audioContext = null;
	}
}

export function handleAudioData(arrayBuffer, timestamp) {
	if (!globalState.webCodecsAudioDecoder || !globalState.isRunning || globalState.audioCodecId !== C.CODEC_IDS.AAC || arrayBuffer.byteLength === 0) return;
	try {
		globalState.webCodecsAudioDecoder.decode(new EncodedAudioChunk({
			type: 'key', 
			timestamp: timestamp, 
			data: arrayBuffer
		}));
	} catch (e) {
        appendLog(`Error decoding audio data: ${e.message}`, true);
    }
}

export function closeAudio() {
    if (globalState.webCodecsAudioDecoder) {
		if (globalState.webCodecsAudioDecoder.state !== 'closed') globalState.webCodecsAudioDecoder.close();
		globalState.webCodecsAudioDecoder = null;
	}
	if (globalState.audioContext) {
		if (globalState.audioContext.state !== 'closed') globalState.audioContext.close();
		globalState.audioContext = null;
	}
	globalState.audioMetadata = null;
	globalState.receivedFirstAudioPacket = false;
	globalState.nextAudioTime = 0;
	globalState.totalAudioFrames = 0;
}