/**
 * Professional 8mm Film Cut Detection
 * Content-aware, not time-based
 */

import { SceneCut, DetectionConfig, DetectionDiagnostics } from '../types';

export interface CutDetectionResult {
  cuts: SceneCut[];
  diagnostics: DetectionDiagnostics;
}

interface FrameAnalysis {
  frameNumber: number;
  timestamp: number;
  histogram: Float32Array; // HSV histogram
  edgeCount: number;
  meanLuma: number;
  stdLuma: number;
  isFlashFrame: boolean;
}

export class FilmCutDetector {
  private config: DetectionConfig;
  
  constructor(config: Partial<DetectionConfig> = {}) {
    this.config = {
      // 8mm film tuned defaults
      histogramThreshold: 0.7,        // Bhattacharyya distance
      edgeThreshold: 0.4,
      minSceneDuration: 1.5,           // seconds
      flashFrameBrightness: 240,       // 0-255
      flashFrameVariance: 20,          // std dev
      fadeDetectionWindow: 5,        // frames
      temporalDebounce: 0.5,         // seconds
      
      ...config
    };
  }
  
  /**
   * Main detection entry point
   */
  async detectCuts(videoElement: HTMLVideoElement): Promise<CutDetectionResult> {
    const fps = videoElement.videoWidth > 0 ? 30 : 24; // detect actual fps (approximate if metadata unavailable)
    const totalDuration = videoElement.duration;
    const totalFrames = Math.floor(totalDuration * fps);
    
    console.log(`🎞️ Analyzing ${totalFrames} frames at ${fps}fps`);
    
    // Step 1: Sample and analyze frames
    const analyses: FrameAnalysis[] = [];
    const sampleInterval = 1; // analyze every frame for precision
    
    for (let i = 0; i < totalFrames; i += sampleInterval) {
      const time = i / fps;
      videoElement.currentTime = time;
      
      // Wait for seek
      await this.waitForSeek(videoElement);
      
      const frame = this.captureFrame(videoElement);
      const analysis = this.analyzeFrame(frame, i, time);
      analyses.push(analysis);
      
      // Progress callback every 10%
      if (i % Math.floor(totalFrames / 10) === 0) {
        const progress = (i / totalFrames) * 100;
        console.log(`Analyzing... ${progress.toFixed(0)}%`);
      }
    }
    
    // Step 2: Detect flash frames
    const flashFrames = this.detectFlashFrames(analyses);
    console.log(`⚡ Detected ${flashFrames.size} flash frames`);
    
    // Step 3: Find candidate cuts using histogram + edge detection
    const rawCuts = this.findCandidateCuts(analyses);
    console.log(`🔍 Found ${rawCuts.length} raw cut candidates`);
    
    // Step 4: Filter by flash frames and debounce
    const filteredCuts = this.filterCuts(rawCuts, flashFrames, analyses, fps);
    console.log(`✂️ ${filteredCuts.length} cuts after filtering`);
    
    // Step 5: Detect and merge fades
    const { cuts, fadeCount } = this.mergeFades(filteredCuts, analyses);
    console.log(`🎬 ${cuts.length} scenes after fade detection (${fadeCount} fades)`);
    
    // Step 6: Final validation - merge extremely short segments
    const finalCuts = this.validateSceneLengths(cuts, totalDuration, fps);
    
    // Build diagnostics
    const diagnostics: DetectionDiagnostics = {
      totalFrames,
      rawDetections: rawCuts.length,
      flashFramesFiltered: flashFrames.size,
      shortSegmentsMerged: rawCuts.length - filteredCuts.length,
      fadeDetections: fadeCount,
      finalSceneCount: finalCuts.length + 1, // cuts define boundaries
      averageSceneDuration: totalDuration / (finalCuts.length + 1),
      confidenceHistogram: this.calculateConfidenceHistogram(finalCuts)
    };
    
    return { cuts: finalCuts, diagnostics };
  }
  
  /**
   * Analyze single frame - extract features
   */
  private analyzeFrame(
    imageData: ImageData, 
    frameNumber: number, 
    timestamp: number
  ): FrameAnalysis {
    const data = imageData.data;
    const pixelCount = data.length / 4;
    
    // Calculate RGB histograms
    const rHist = new Float32Array(256);
    const gHist = new Float32Array(256);
    const bHist = new Float32Array(256);
    
    // Simple edge detection (count horizontal differences)
    let edgeCount = 0;
    let totalLuma = 0;
    let lumaSqSum = 0;
    
    const width = imageData.width;
    const height = imageData.height;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      rHist[r]++;
      gHist[g]++;
      bHist[b]++;
      
      // Luma (BT.709)
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      totalLuma += luma;
      lumaSqSum += luma * luma;
      
      // Edge detection (horizontal neighbor)
      if (i % (width * 4) < (width - 1) * 4) {
        const nextLuma = 0.2126 * data[i + 4] + 0.7152 * data[i + 5] + 0.0722 * data[i + 6];
        if (Math.abs(luma - nextLuma) > 30) {
          edgeCount++;
        }
      }
    }
    
    // Normalize histograms
    for (let i = 0; i < 256; i++) {
      rHist[i] /= pixelCount;
      gHist[i] /= pixelCount;
      bHist[i] /= pixelCount;
    }
    
    // Calculate statistics
    const meanLuma = totalLuma / pixelCount;
    const variance = (lumaSqSum / pixelCount) - (meanLuma * meanLuma);
    const stdLuma = Math.sqrt(variance);
    
    // Flash frame detection
    const isFlashFrame = meanLuma > this.config.flashFrameBrightness && 
                         stdLuma < this.config.flashFrameVariance;
    
    // Create HSV-like combined histogram for comparison
    // Weight hue heavily, saturation medium, ignore value for cut detection
    const combinedHist = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      // Simple approximation: emphasize chroma channels
      combinedHist[i] = (rHist[i] + bHist[i]) * 0.4 + gHist[i] * 0.2;
    }
    
    return {
      frameNumber,
      timestamp,
      histogram: combinedHist,
      edgeCount: edgeCount / pixelCount, // normalize
      meanLuma,
      stdLuma,
      isFlashFrame
    };
  }
  
  /**
   * Detect flash frames (overexposed splice points)
   */
  private detectFlashFrames(analyses: FrameAnalysis[]): Set<number> {
    const flashFrames = new Set<number>();
    
    for (let i = 0; i < analyses.length; i++) {
      if (analyses[i].isFlashFrame) {
        // Mark this frame and neighbors as flash zone
        for (let j = Math.max(0, i - 2); j <= Math.min(analyses.length - 1, i + 2); j++) {
          flashFrames.add(j);
        }
      }
    }
    
    return flashFrames;
  }
  
  /**
   * Find candidate cuts using histogram and edge differences
   */
  private findCandidateCuts(analyses: FrameAnalysis[]): SceneCut[] {
    const cuts: SceneCut[] = [];
    
    for (let i = 1; i < analyses.length; i++) {
      const prev = analyses[i - 1];
      const curr = analyses[i];
      
      // Bhattacharyya histogram distance
      let histDiff = 0;
      for (let j = 0; j < 256; j++) {
        histDiff += Math.sqrt(prev.histogram[j] * curr.histogram[j]);
      }
      histDiff = 1 - histDiff; // convert to distance (0 = identical, 1 = completely different)
      
      // Edge difference
      const edgeDiff = Math.abs(prev.edgeCount - curr.edgeCount);
      
      // Combined score
      const confidence = (histDiff * 0.7) + (edgeDiff * 0.3);
      
      // Detection threshold
      if (histDiff > this.config.histogramThreshold || 
          (histDiff > 0.5 && edgeDiff > this.config.edgeThreshold)) {
        cuts.push({
          frameNumber: i,
          timestamp: curr.timestamp,
          confidence,
          histogramDistance: histDiff,
          edgeDifference: edgeDiff,
          type: 'candidate'
        });
      }
    }
    
    return cuts;
  }
  
  /**
   * Filter cuts by removing flash artifacts and enforcing minimum duration
   */
  private filterCuts(
    cuts: SceneCut[], 
    flashFrames: Set<number>, 
    analyses: FrameAnalysis[],
    fps: number
  ): SceneCut[] {
    const filtered: SceneCut[] = [];
    let lastCutTime = -this.config.minSceneDuration;
    
    for (const cut of cuts) {
      // Skip if in flash frame zone
      if (flashFrames.has(cut.frameNumber)) {
        continue;
      }
      
      // Check temporal debounce (minimum time from last cut)
      if (cut.timestamp - lastCutTime < this.config.temporalDebounce) {
        // Too close to last cut - keep only if much higher confidence
        if (filtered.length > 0 && cut.confidence > filtered[filtered.length - 1].confidence * 1.3) {
          // Replace previous cut with this stronger one
          filtered[filtered.length - 1] = {
            ...cut,
            type: 'splice' // likely a physical splice
          };
          lastCutTime = cut.timestamp;
        }
        continue;
      }
      
      // Valid cut
      filtered.push({
        ...cut,
        type: 'content' // content change, not splice artifact
      });
      lastCutTime = cut.timestamp;
    }
    
    return filtered;
  }
  
  /**
   * Detect fades and merge consecutive fade frames into single scene
   */
  private mergeFades(
    cuts: SceneCut[], 
    analyses: FrameAnalysis[]
  ): { cuts: SceneCut[]; fadeCount: number } {
    if (cuts.length < 2) return { cuts, fadeCount: 0 };
    
    const merged: SceneCut[] = [];
    let fadeCount = 0;
    let inFade = false;
    
    for (let i = 0; i < cuts.length; i++) {
      const cut = cuts[i];
      
      // Check if this cut is part of a fade sequence
      const frameIdx = cut.frameNumber;
      const window = this.config.fadeDetectionWindow;
      
      // Look at direction of change in surrounding frames
      let consistentDirection = true;
      let prevLuma = analyses[Math.max(0, frameIdx - window)].meanLuma;
      
      for (let j = frameIdx - window + 1; j <= frameIdx + window && j < analyses.length; j++) {
        if (j < 0) continue;
        
        const currLuma = analyses[j].meanLuma;
        const direction = currLuma > prevLuma ? 'up' : 'down';
        
        if (j > frameIdx - window + 1) {
          // Check if direction changed
          const prevDirection = analyses[j - 1].meanLuma > analyses[j - 2]?.meanLuma ? 'up' : 'down';
          if (direction !== prevDirection && Math.abs(currLuma - prevLuma) > 5) {
            consistentDirection = false;
            break;
          }
        }
        prevLuma = currLuma;
      }
      
      // If consistent gradual change, it's a fade, not a cut
      if (consistentDirection && !inFade) {
        inFade = true;
        fadeCount++;
        // Don't add this cut, it's a fade boundary
      } else if (!consistentDirection) {
        inFade = false;
        merged.push(cut);
      }
    }
    
    return { cuts: merged, fadeCount };
  }
  
  /**
   * Final validation: ensure no scenes are too short
   */
  private validateSceneLengths(
    cuts: SceneCut[], 
    totalDuration: number, 
    fps: number
  ): SceneCut[] {
    const minDuration = this.config.minSceneDuration;
    const validated: SceneCut[] = [];
    
    // Add implicit start
    let prevTime = 0;
    
    for (const cut of cuts) {
      const duration = cut.timestamp - prevTime;
      
      if (duration < minDuration && validated.length > 0) {
        // Too short - merge with previous by not adding this cut
        console.log(`Merging short scene at ${cut.timestamp.toFixed(2)}s (${duration.toFixed(2)}s)`);
        continue;
      }
      
      validated.push(cut);
      prevTime = cut.timestamp;
    }
    
    // Check final segment
    const finalDuration = totalDuration - prevTime;
    if (finalDuration < minDuration && validated.length > 0) {
      // Remove last cut to merge with previous
      validated.pop();
    }
    
    return validated;
  }
  
  /**
   * Utility: Wait for video seek
   */
  private waitForSeek(video: HTMLVideoElement): Promise<void> {
    return new Promise(resolve => {
      if (video.seeking) {
        const handler = () => {
          video.removeEventListener('seeked', handler);
          resolve();
        };
        video.addEventListener('seeked', handler);
      } else {
        resolve();
      }
    });
  }
  
  /**
   * Utility: Capture frame from video
   */
  private captureFrame(video: HTMLVideoElement): ImageData {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  
  /**
   * Calculate confidence distribution for diagnostics
   */
  private calculateConfidenceHistogram(cuts: SceneCut[]): number[] {
    const bins = [0, 0, 0, 0, 0]; // 0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0
    
    for (const cut of cuts) {
      const idx = Math.min(4, Math.floor(cut.confidence * 5));
      bins[idx]++;
    }
    
    return bins;
  }
}

// Export singleton with 8mm film defaults
export const filmCutDetector = new FilmCutDetector({
  histogramThreshold: 0.7,
  minSceneDuration: 1.5,  // 1.5 seconds minimum for 8mm
  flashFrameBrightness: 240,
  temporalDebounce: 0.5
});
