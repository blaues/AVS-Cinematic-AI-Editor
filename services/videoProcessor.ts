import { ColorCorrection, SceneData, CropSettings } from "../types";

/**
 * Extracts a frame from a video element at the current time.
 */
export const captureFrame = (videoElement: HTMLVideoElement): string => {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
};

/**
 * Generates the CSS filter string for canvas
 */
const getFilterString = (c: ColorCorrection) => {
    return `brightness(${c.brightness}) contrast(${c.contrast}) saturate(${c.saturation}) sepia(${Math.abs(c.temperature) / 100}) hue-rotate(${c.tint}deg)`;
};

/**
 * Interpolates between two color corrections
 */
const interpolateCorrection = (a: ColorCorrection, b: ColorCorrection, t: number): ColorCorrection => {
    // Clamp t between 0 and 1
    const progress = Math.max(0, Math.min(1, t));
    return {
        brightness: a.brightness + (b.brightness - a.brightness) * progress,
        contrast: a.contrast + (b.contrast - a.contrast) * progress,
        saturation: a.saturation + (b.saturation - a.saturation) * progress,
        temperature: a.temperature + (b.temperature - a.temperature) * progress,
        tint: a.tint + (b.tint - a.tint) * progress,
    };
};

/**
 * Helper to determine the active correction for a given timestamp with temporal smoothing
 */
const getCorrectionForTime = (time: number, scenes: SceneData[], global: ColorCorrection): ColorCorrection => {
    if (!scenes || scenes.length === 0) return global;
    
    // Assumes scenes are sorted by timestamp
    const sortedScenes = [...scenes].sort((a, b) => a.timestamp - b.timestamp);
    
    // Find active scene index
    let activeIdx = -1;
    for (let i = 0; i < sortedScenes.length; i++) {
        if (time >= sortedScenes[i].timestamp) {
            activeIdx = i;
        } else {
            break;
        }
    }

    if (activeIdx === -1) return global;

    const activeScene = sortedScenes[activeIdx];
    const targetCorrection = activeScene.correction;

    // Temporal Smoothing / Cross-fade Logic
    // If we are within the first 1.0s of the new scene, blend from the previous scene's correction
    const TRANSITION_DURATION = 1.0; 
    const timeSinceStart = time - activeScene.timestamp;

    if (timeSinceStart < TRANSITION_DURATION) {
        // Determine what the previous correction was
        // If it's the first scene, blend from global (or just start instant)
        const prevCorrection = activeIdx > 0 ? sortedScenes[activeIdx - 1].correction : global;
        
        const progress = timeSinceStart / TRANSITION_DURATION;
        return interpolateCorrection(prevCorrection, targetCorrection, progress);
    }

    return targetCorrection;
};

/**
 * Scans video for visual changes to detect scenes, filtering out flash frames
 */
export const scanForScenes = async (
    video: HTMLVideoElement,
    onProgress: (percent: number) => void
): Promise<number[]> => {
    const duration = video.duration;
    const timestamps: number[] = [0];
    const width = 64; 
    const height = 64;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if(!ctx) return timestamps;

    let prevData: Uint8ClampedArray | null = null;
    
    // Sample rate: Check every ~0.5s for finer granularity on 8mm film
    const step = 0.5; 
    
    const originalTime = video.currentTime;
    video.pause();

    for (let t = 0; t < duration; t += step) {
        video.currentTime = t;
        // Wait for seek
        await new Promise(r => {
             const handler = () => {
                 video.removeEventListener('seeked', handler);
                 r(null);
             };
             video.addEventListener('seeked', handler);
        });

        ctx.drawImage(video, 0, 0, width, height);
        const data = ctx.getImageData(0, 0, width, height).data;

        // Flash Frame Detection: Check for extreme brightness
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
            totalBrightness += (data[i] + data[i+1] + data[i+2]) / 3;
        }
        const avgBrightness = totalBrightness / (data.length / 4);

        // If average brightness > 230 (out of 255), likely a flash frame or burnout. Skip logic.
        if (avgBrightness > 230) {
            continue;
        }

        if (prevData) {
            let diff = 0;
            // Compare pixel difference
            for (let i = 0; i < data.length; i += 4 * 4) { 
                diff += Math.abs(data[i] - prevData[i]) + 
                        Math.abs(data[i+1] - prevData[i+1]) + 
                        Math.abs(data[i+2] - prevData[i+2]);
            }
            const avgDiff = diff / (data.length / 16 * 3);
            
            // Threshold for scene change
            if (avgDiff > 30) {
                timestamps.push(t);
            }
        }
        prevData = data;
        onProgress((t / duration) * 100);
    }
    
    video.currentTime = originalTime;
    return timestamps;
};

/**
 * Processes the video from start to finish and exports it.
 */
export const processAndExportVideo = async (
    videoElement: HTMLVideoElement,
    scenes: SceneData[],
    globalCorrection: ColorCorrection,
    cropSettings: CropSettings,
    stabilizationEnabled: boolean,
    stabilizationStrength: number,
    onProgress: (progress: number) => void
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject("No context");
            return;
        }

        // Setup Canvas Size
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        // Create stream and recorder
        const stream = canvas.captureStream(30); // 30 FPS recording

        // Determine best supported MIME type for high quality export
        // Prioritize MP4/H.264
        const mimeTypes = [
            "video/mp4;codecs=avc1.42E01E", // H.264
            "video/mp4",
            "video/webm;codecs=h264",
            "video/webm;codecs=vp9",
            "video/webm"
        ];
        
        let selectedMimeType = "";
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                selectedMimeType = type;
                break;
            }
        }
        
        if (!selectedMimeType) {
            reject("No supported recording format found in this browser.");
            return;
        }

        console.log(`Exporting using MIME: ${selectedMimeType} at 25Mbps`);

        const recorder = new MediaRecorder(stream, { 
            mimeType: selectedMimeType,
            videoBitsPerSecond: 25000000 // 25 Mbps Production Quality
        });

        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: selectedMimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Determine extension
            const ext = selectedMimeType.includes('mp4') ? 'mp4' : 'webm';
            a.download = `avs_cinematic_restored_${Date.now()}.${ext}`;
            
            a.click();
            
            // Cleanup
            videoElement.currentTime = 0; 
            videoElement.muted = false; 
            videoElement.loop = true;
            resolve();
        };

        recorder.start();
        videoElement.currentTime = 0;
        videoElement.muted = true; 
        videoElement.loop = false;

        const duration = videoElement.duration;
        
        // Processing Loop
        const processFrame = () => {
            if (videoElement.paused || videoElement.ended) {
                 if (Math.abs(videoElement.currentTime - duration) < 0.5 || videoElement.currentTime >= duration) {
                     recorder.stop();
                 } else {
                     videoElement.play();
                     requestAnimationFrame(processFrame);
                 }
                 return;
            }

            // Apply Filters
            const currentTime = videoElement.currentTime;
            const correction = getCorrectionForTime(currentTime, scenes, globalCorrection);
            
            // Canvas Filter
            ctx.filter = getFilterString(correction);

            // Handle Transform (Crop & Stabilization)
            ctx.save();
            
            const stabScale = stabilizationEnabled ? 1 + (0.15 * stabilizationStrength) : 1;
            const cropZoom = cropSettings.active ? cropSettings.zoom : 1;
            const totalScale = stabScale * cropZoom;
            
            let tx = 0;
            let ty = 0;
            
            if (cropSettings.active) {
                const offsetX = (cropSettings.x - 50) / 100 * canvas.width;
                const offsetY = (cropSettings.y - 50) / 100 * canvas.height;
                tx = -offsetX;
                ty = -offsetY;
            }

            // Center origin
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(totalScale, totalScale);
            ctx.translate(tx, ty);
            ctx.translate(-canvas.width / 2, -canvas.height / 2);

            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            onProgress((currentTime / duration) * 100);
            
            if (videoElement.currentTime < duration) {
                 requestAnimationFrame(processFrame);
            } else {
                recorder.stop();
            }
        };

        videoElement.play().then(() => {
            processFrame();
        }).catch(e => {
            console.error("Export playback failed", e);
            reject(e);
        });
    });
};