// ... (imports remain the same)
import { globalState } from '../state.js';
import { elements } from '../domElements.js';
import { Player } from 'broadway-player';

import { appendLog } from '../loggerService.js';
import * as C from '../constants.js';

import * as H264ConverterModule from 'h264-converter';

const VideoConverter = H264ConverterModule.default;
const setLoggerFunc = H264ConverterModule.setLogger;

if (typeof setLoggerFunc === 'function') {
    setLoggerFunc(() => {}, (message) => appendLog(message, true));
}
if (typeof VideoConverter !== 'function') {
    console.error('h264-converter.default (VideoConverter) is not a constructor.');
}


function onMseVideoCanPlay() {
    if (globalState.decoderType === C.DECODER_TYPES.MSE &&
        globalState.isRunning &&
        elements.videoElement && typeof VideoConverter === 'function') {
        elements.videoElement.play().catch(e => {
            appendLog(`Video play error: ${e.message}`, true)
        });
    }
}

function onVideoError(e) {
    appendLog(`Video element error: ${e.message || JSON.stringify(e)}`, true);
}

export function handleVideoInfo(width, height) {
    globalState.deviceWidth = width;
    globalState.deviceHeight = height;
    globalState.videoResolution = `${width}x${height}`;

    if (elements.streamArea) {
        elements.streamArea.style.aspectRatio = (width > 0 && height > 0) ? `${width} / ${height}` : '9 / 16';
    }
    if (elements.videoPlaceholder) {
        elements.videoPlaceholder.classList.toggle('hidden', width > 0 || height > 0);
    }

    const targetCanvas = globalState.decoderType === C.DECODER_TYPES.WEBCODECS ? elements.webcodecCanvas :
                         globalState.decoderType === C.DECODER_TYPES.BROADWAY ? (globalState.broadwayPlayer ? globalState.broadwayPlayer.canvas : elements.broadwayCanvas) :
                         null;

    if (globalState.decoderType === C.DECODER_TYPES.MSE && elements.videoElement) {
        elements.videoElement.classList.toggle('visible', width > 0 || height > 0);
    } else if (targetCanvas) {
        targetCanvas.classList.toggle('visible', width > 0 || height > 0);
        if (width > 0 && height > 0) {
            targetCanvas.width = width;
            targetCanvas.height = height;
             if (globalState.decoderType === C.DECODER_TYPES.BROADWAY && globalState.broadwayPlayer) {
                globalState.broadwayPlayer.size = { width, height };
            }
        }
    }
}


export function initializeVideoPlayback() {
    if (globalState.broadwayPlayer && globalState.broadwayPlayer.canvas && globalState.broadwayPlayer.canvas.parentElement) {
        globalState.broadwayPlayer.canvas.parentElement.removeChild(globalState.broadwayPlayer.canvas);
    }
    globalState.broadwayPlayer = null;

    if (globalState.webCodecsVideoDecoder && globalState.webCodecsVideoDecoder.state !== 'closed') {
        globalState.webCodecsVideoDecoder.close();
    }
    globalState.webCodecsVideoDecoder = null;
    globalState.webCodecCanvasCtx = null;


    if (elements.videoElement) elements.videoElement.style.display = 'none';
    if (elements.broadwayCanvas) elements.broadwayCanvas.style.display = 'none';
    if (elements.webcodecCanvas) elements.webcodecCanvas.style.display = 'none';


    if (globalState.decoderType === C.DECODER_TYPES.MSE) {
        if (elements.videoElement) {
            elements.videoElement.style.display = 'block';
            elements.videoElement.classList.add('mse-active');
        }
        if (typeof VideoConverter !== 'function') {
            appendLog('VideoConverter class not available. Cannot initialize MSE.', true); return;
        }
        const fps = parseInt(elements.maxFpsSelect.value) || C.DEFAULT_FRAMES_PER_SECOND;
        globalState.converter = new VideoConverter(elements.videoElement, fps, C.DEFAULT_FRAMES_PER_FRAGMENT);
        globalState.sourceBufferInternal = globalState.converter?.sourceBuffer || null;
        if (elements.videoElement) {
            elements.videoElement.removeEventListener('canplay', onMseVideoCanPlay);
            elements.videoElement.addEventListener('canplay', onMseVideoCanPlay, { once: true });
            elements.videoElement.removeEventListener('error', onVideoError);
            elements.videoElement.addEventListener('error', onVideoError);
        }
    } else if (globalState.decoderType === C.DECODER_TYPES.BROADWAY) {
        if (elements.broadwayCanvas) elements.broadwayCanvas.style.display = 'block';
        let BroadwayPlayerInstance = Player;
        if (typeof Player !== 'function') {
            if (Player && typeof Player.Player === 'function') BroadwayPlayerInstance = Player.Player;
            else { appendLog('Broadway Player class not available.', true); return; }
        }
        globalState.broadwayPlayer = new BroadwayPlayerInstance({
            useWorker: true, workerFile: 'vendor/node_modules/broadway-player/Player/Decoder.js', webgl: 'auto', reuseMemory: true
        });
        if (!globalState.broadwayPlayer || !globalState.broadwayPlayer.canvas) {
            appendLog('Broadway: Player or player.canvas is null!', true); globalState.broadwayPlayer = null; return;
        }
        if (elements.broadwayCanvas && elements.broadwayCanvas !== globalState.broadwayPlayer.canvas) {
             elements.broadwayCanvas.style.display = 'none';
        }
        const playerCanvas = globalState.broadwayPlayer.canvas;
        playerCanvas.id = 'broadwayPlayerRenderCanvas';
        playerCanvas.style.width = '100%'; playerCanvas.style.height = '100%';
        playerCanvas.style.objectFit = 'contain'; playerCanvas.style.background = 'var(--video-bg)';
        elements.streamArea.insertBefore(playerCanvas, elements.videoBorder);
        if (playerCanvas.width === 0 || playerCanvas.height === 0) { playerCanvas.width = 360; playerCanvas.height = 640; }
        playerCanvas.classList.add('visible');
    } else if (globalState.decoderType === C.DECODER_TYPES.WEBCODECS) {
        if (!window.VideoDecoder) { appendLog('VideoDecoder API not supported.', true); return; }
        if (elements.webcodecCanvas) {
            elements.webcodecCanvas.style.display = 'block';
            globalState.webCodecCanvasCtx = elements.webcodecCanvas.getContext('2d', { alpha: false });
        }
        globalState.webCodecsVideoDecoder = new VideoDecoder({
            output: (videoFrame) => {
                if (globalState.webCodecCanvasCtx && videoFrame && elements.webcodecCanvas.width > 0 && elements.webcodecCanvas.height > 0) {
                    globalState.webCodecCanvasCtx.drawImage(videoFrame, 0, 0, elements.webcodecCanvas.width, elements.webcodecCanvas.height);
                    videoFrame.close();
                } else if (videoFrame) {
                    videoFrame.close();
                }
            },
            error: (e) => appendLog(`VideoDecoder error: ${e.message}`, true),
        });
        appendLog('WebCodecs video decoder initialized (awaiting config).');
        globalState.videoRenderHandle = requestAnimationFrame(renderVideoFrame);
    }
    handleVideoInfo(0,0);
}

export function stopVideoPlayback() {
    if (globalState.decoderType === C.DECODER_TYPES.MSE) {
        if (elements.videoElement) {
            elements.videoElement.classList.remove('mse-active');
        }
        if (globalState.converter) {
            try {
                globalState.converter.appendRawData(new Uint8Array([]));
                globalState.converter.pause();
            } catch (e) { appendLog(`Error stopping MSE converter: ${e.message}`, true); }
            globalState.converter = null;
        }
        globalState.sourceBufferInternal = null;
        if (elements.videoElement) {
            elements.videoElement.pause();
            try { elements.videoElement.src = ""; elements.videoElement.removeAttribute('src'); elements.videoElement.load(); }
            catch (e) { appendLog(`Error resetting video element: ${e.message}`, true); }
        }
    } else if (globalState.decoderType === C.DECODER_TYPES.BROADWAY) {
        if (globalState.broadwayPlayer) {
            if (globalState.broadwayPlayer.worker) globalState.broadwayPlayer.worker.terminate();
            if (globalState.broadwayPlayer.canvas && globalState.broadwayPlayer.canvas.parentElement) {
                globalState.broadwayPlayer.canvas.parentElement.removeChild(globalState.broadwayPlayer.canvas);
            }
            globalState.broadwayPlayer = null;
        }
        if (elements.broadwayCanvas) {
            elements.broadwayCanvas.style.display = 'none';
            elements.broadwayCanvas.classList.remove('visible');
        }
    } else if (globalState.decoderType === C.DECODER_TYPES.WEBCODECS) {
        if (globalState.videoRenderHandle) {
            cancelAnimationFrame(globalState.videoRenderHandle);
            globalState.videoRenderHandle = null;
        }
        if (globalState.webCodecsVideoDecoder && globalState.webCodecsVideoDecoder.state !== 'closed') {
            globalState.webCodecsVideoDecoder.close();
        }
        globalState.webCodecsVideoDecoder = null;
        if (elements.webcodecCanvas) {
            elements.webcodecCanvas.style.display = 'none';
            elements.webcodecCanvas.classList.remove('visible');
            if(globalState.webCodecCanvasCtx) globalState.webCodecCanvasCtx.clearRect(0,0, elements.webcodecCanvas.width, elements.webcodecCanvas.height);
            globalState.webCodecCanvasCtx = null;
        }
        globalState.videoFrameBuffer = [];
    }
    handleVideoInfo(0, 0);
    if (elements.videoElement && globalState.decoderType === C.DECODER_TYPES.MSE) elements.videoElement.style.display = 'block';
    else if(elements.videoElement) elements.videoElement.style.display = 'none';

    if (elements.broadwayCanvas && globalState.decoderType !== C.DECODER_TYPES.BROADWAY) elements.broadwayCanvas.style.display = 'none';
    if (elements.webcodecCanvas && globalState.decoderType !== C.DECODER_TYPES.WEBCODECS) elements.webcodecCanvas.style.display = 'none';
}

function renderVideoFrame() {
    if (globalState.decoderType === C.DECODER_TYPES.WEBCODECS) {
        if (globalState.videoFrameBuffer.length > 0) {
            const chunk = globalState.videoFrameBuffer.shift();
            if (globalState.webCodecsVideoDecoder && globalState.webCodecsVideoDecoder.state === 'configured') {
                globalState.webCodecsVideoDecoder.decode(chunk);
            }
        }
        globalState.videoRenderHandle = requestAnimationFrame(renderVideoFrame);
    }
}

function isIFrame(frameData) {
    if (!frameData || frameData.length < 4) return false;
    let offset = 0;
    if (frameData[0] === 0 && frameData[1] === 0) {
        if (frameData[2] === 1) offset = 3;
        else if (frameData.length > 3 && frameData[2] === 0 && frameData[3] === 1) offset = 4;
    }
    return offset > 0 && frameData.length > offset && (frameData[offset] & 0x1F) === C.NALU_TYPE_IDR;
}

function cleanSourceBuffer() {
    if (!globalState.sourceBufferInternal || globalState.sourceBufferInternal.updating || globalState.removeStart < 0 || globalState.removeEnd <= globalState.removeStart) {
        globalState.sourceBufferInternal?.removeEventListener('updateend', cleanSourceBuffer);
        globalState.removeStart = globalState.removeEnd = -1;
        return;
    }
    try {
        globalState.sourceBufferInternal.remove(globalState.removeStart, globalState.removeEnd);
        globalState.sourceBufferInternal.addEventListener('updateend', cleanSourceBuffer, { once: true });
    } catch (e) {
        appendLog(`Error cleaning source buffer: ${e.message}`, true);
        globalState.sourceBufferInternal?.removeEventListener('updateend', cleanSourceBuffer);
        globalState.removeStart = globalState.removeEnd = -1;
    }
}

function checkForIFrameAndCleanBuffer(frameData) {
    globalState.frameCheckCounter = (globalState.frameCheckCounter + 1) % C.FRAME_CHECK_INTERVAL;
    if (globalState.frameCheckCounter !== 0) return;

    if (!elements.videoElement?.buffered || !elements.videoElement.buffered.length) return;
    const buffered = elements.videoElement.buffered.end(0) - elements.videoElement.currentTime;
    const MAX_BUFFER_CLEAN = 0.5;
    if (buffered < MAX_BUFFER_CLEAN * 1.5) return;

    if (!globalState.sourceBufferInternal) {
        globalState.sourceBufferInternal = globalState.converter?.sourceBuffer || null;
        if (!globalState.sourceBufferInternal) return;
    }
    if (!isIFrame(frameData)) return;

    const start = elements.videoElement.buffered.start(0);
    const end = elements.videoElement.buffered.end(0) | 0;
    if (end !== 0 && start < end) {
        if (globalState.removeEnd !== -1) globalState.removeEnd = Math.max(globalState.removeEnd, end);
        else { globalState.removeStart = start; globalState.removeEnd = end; }
        if(globalState.sourceBufferInternal) {
            globalState.sourceBufferInternal.addEventListener('updateend', cleanSourceBuffer, { once: true });
        }
    }
}


export function handleVideoData(payloadArrayBuffer, timestamp = null, frameType = null) {
    if (!globalState.isRunning) return;

    if (globalState.decoderType === C.DECODER_TYPES.MSE) {
        if (!globalState.converter || typeof VideoConverter !== 'function') return;
        const payloadUint8 = new Uint8Array(payloadArrayBuffer);
        if (globalState.inputBytes.length > 200) globalState.inputBytes.shift();
        globalState.inputBytes.push({ timestamp: Date.now(), bytes: payloadArrayBuffer.byteLength });
        globalState.converter.appendRawData(payloadUint8);
        checkForIFrameAndCleanBuffer(payloadUint8);
    } else if (globalState.decoderType === C.DECODER_TYPES.BROADWAY) {
        if (!globalState.broadwayPlayer) return;
        const dataToDecode = new Uint8Array(payloadArrayBuffer);
        try { globalState.broadwayPlayer.decode(dataToDecode); }
        catch (e) { appendLog(`Broadway: Error during decode(): ${e.message}`, true); }
    } else if (globalState.decoderType === C.DECODER_TYPES.WEBCODECS) {
        if (!globalState.webCodecsVideoDecoder || timestamp === null || frameType === null) {
             if (!globalState.webCodecsVideoDecoder) appendLog("WebCodecs Video: Decoder not ready.", true);
             if (timestamp === null) appendLog("WebCodecs Video: Timestamp missing.", true);
             if (frameType === null) appendLog("WebCodecs Video: Frame type missing.", true);
            return;
        }
        if (globalState.webCodecsVideoDecoder.state !== "configured") {
            appendLog("WebCodecs Video: Decoder not configured, cannot decode frame.", true);
            return;
        }
        try {
            if (globalState.videoFrameBuffer.length > C.MAX_VIDEO_FRAME_BUFFER_SIZE) {
                appendLog('Video buffer full, dropping frames to catch up.', true);
                let lastKeyFrameIndex = -1;
                for (let i = globalState.videoFrameBuffer.length - 1; i >= 0; i--) {
                    if (globalState.videoFrameBuffer[i].type === 'key') {
                        lastKeyFrameIndex = i;
                        break;
                    }
                }
                if (lastKeyFrameIndex > 0) {
                    globalState.videoFrameBuffer.splice(0, lastKeyFrameIndex);
                }
            }
            const chunk = new EncodedVideoChunk({
                type: frameType, // 'key' or 'delta'
                timestamp: timestamp,
                data: payloadArrayBuffer
            });
            globalState.videoFrameBuffer.push(chunk);
        } catch (e) {
            appendLog(`WebCodecs Video: Error creating chunk: ${e.message}`, true);
        }
    }
}

export function configureWebCodecsVideoDecoder(spsProfile, spsCompat, spsLevel, avccBuffer) {
    if (globalState.decoderType === C.DECODER_TYPES.WEBCODECS && globalState.webCodecsVideoDecoder) {
        if (globalState.webCodecsVideoDecoder.state === "configured") {
            appendLog("WebCodecs video decoder already configured. Reconfiguring.", true);
            try { globalState.webCodecsVideoDecoder.reset(); } catch(e) { appendLog(`Error resetting decoder: ${e.message}`, true); }
        }
        try {
            const profileHex = spsProfile.toString(16).padStart(2, '0');
            const compatHex = spsCompat.toString(16).padStart(2, '0');
            const levelHex = spsLevel.toString(16).padStart(2, '0');
            // The codec string should match the profile, compatibility, and level from SPS
            const codecString = `avc1.${profileHex}${compatHex}${levelHex}`;
            appendLog(`Configuring WebCodecs VideoDecoder with: codec: ${codecString}, description length: ${avccBuffer.byteLength}`);

            globalState.webCodecsVideoDecoder.configure({
                codec: codecString,
                description: avccBuffer, // AVCC buffer is already length-prefixed format
                hardwareAcceleration: 'prefer-hardware',
            });
            appendLog('WebCodecs video decoder configured successfully.');
        } catch (e) {
            appendLog(`WebCodecs Video: Error configuring decoder: ${e.message}`, true);
        }
    }
}


function getVideoPlaybackQuality() {
    const video = globalState.decoderType === C.DECODER_TYPES.MSE ? elements.videoElement : null;
    if (!video) return null;
    const now = Date.now();
    if (typeof video.getVideoPlaybackQuality === 'function') {
        const temp = video.getVideoPlaybackQuality();
        return { timestamp: now, decodedFrames: temp.totalVideoFrames, droppedFrames: temp.droppedVideoFrames };
    }
    if (typeof video.webkitDecodedFrameCount !== 'undefined') {
        return { timestamp: now, decodedFrames: video.webkitDecodedFrameCount, droppedFrames: video.webkitDroppedFrameCount };
    }
    return null;
}

function calculateMomentumStats() {
    const stat = getVideoPlaybackQuality(); if (!stat) return;
    const timestamp = Date.now();
    globalState.videoStats.push(stat);
    globalState.inputBytes.push({ timestamp, bytes: globalState.inputBytes.length > 0 ? globalState.inputBytes[globalState.inputBytes.length - 1].bytes : 0 });
    if (globalState.videoStats.length > 10) { globalState.videoStats.shift(); globalState.inputBytes.shift(); }
    const inputBytesSum = globalState.inputBytes.reduce((sum, item) => sum + item.bytes, 0);
    const inputFrames = globalState.inputBytes.length;
    if (globalState.videoStats.length > 1) {
        const oldest = globalState.videoStats[0];
        const decodedFrames = stat.decodedFrames - oldest.decodedFrames;
        const droppedFrames = stat.droppedFrames - oldest.droppedFrames;
        globalState.momentumQualityStats = { decodedFrames, droppedFrames, inputBytes: inputBytesSum, inputFrames, timestamp };
    }
}

export function checkForBadState() {
    if (globalState.decoderType !== C.DECODER_TYPES.MSE) return;

    if (!globalState.isRunning || !globalState.converter || !elements.videoElement ||
        elements.videoElement.paused || typeof VideoConverter !== 'function') return;

    const { currentTime } = elements.videoElement; const now = Date.now();
    let hasReasonToJump = false;
    if (elements.videoElement.buffered && elements.videoElement.buffered.length > 0) {
        const end = elements.videoElement.buffered.end(0);
        const buffered = end - currentTime;
        const MAX_BUFFER_CHECK = 0.5;
        if (buffered > MAX_BUFFER_CHECK || buffered < C.MAX_AHEAD) calculateMomentumStats();
    }
    if (globalState.momentumQualityStats && globalState.momentumQualityStats.decodedFrames === 0 && globalState.momentumQualityStats.inputFrames > 0) {
        if (globalState.noDecodedFramesSince === -1) globalState.noDecodedFramesSince = now;
        else if (now - globalState.noDecodedFramesSince > C.MAX_TIME_TO_RECOVER) hasReasonToJump = true;
    } else globalState.noDecodedFramesSince = -1;

    if (currentTime === globalState.lastVideoTime && globalState.currentTimeNotChangedSince === -1) globalState.currentTimeNotChangedSince = now;
    else if (currentTime !== globalState.lastVideoTime) globalState.currentTimeNotChangedSince = -1;
    globalState.lastVideoTime = currentTime;

    if (elements.videoElement.buffered && elements.videoElement.buffered.length > 0) {
        const end = elements.videoElement.buffered.end(0);
        const buffered = end - currentTime;
        const MAX_BUFFER_JUMP = 0.5;
        if (buffered > MAX_BUFFER_JUMP) {
            if (globalState.bigBufferSince === -1) globalState.bigBufferSince = now;
            else if (now - globalState.bigBufferSince > C.MAX_TIME_TO_RECOVER) hasReasonToJump = true;
        } else globalState.bigBufferSince = -1;
        if (buffered < C.MAX_AHEAD) {
            if (globalState.aheadOfBufferSince === -1) globalState.aheadOfBufferSince = now;
            else if (now - globalState.aheadOfBufferSince > C.MAX_TIME_TO_RECOVER) hasReasonToJump = true;
        } else globalState.aheadOfBufferSince = -1;
        if (globalState.currentTimeNotChangedSince !== -1 && now - globalState.currentTimeNotChangedSince > C.MAX_TIME_TO_RECOVER) hasReasonToJump = true;
        if (!hasReasonToJump) return;
        if (globalState.seekingSince !== -1 && now - globalState.seekingSince < C.MAX_SEEK_WAIT_MS) return;
        const onSeekEnd = () => {
            globalState.seekingSince = -1;
            elements.videoElement.removeEventListener('seeked', onSeekEnd);
            elements.videoElement.play().catch(e => { appendLog(`Video play error after seek: ${e.message}`, true); });
        };
        if (globalState.seekingSince !== -1) appendLog('Seek already in progress, but attempting again due to bad state.', true);
        globalState.seekingSince = now;
        elements.videoElement.addEventListener('seeked', onSeekEnd);
        elements.videoElement.currentTime = end;
        appendLog(`Jumped video to ${end} due to bad state.`);
    }
}

export function updateVideoResolutionInStream(width, height) {
    if (!globalState.isRunning) return;
    if (width !== globalState.deviceWidth || height !== globalState.deviceHeight) {
        handleVideoInfo(width, height);
    }
}