import React, { useRef, useEffect, useState } from 'react';
import { VideoMetadata, EditorState, ColorCorrection, SceneData } from '../types';
import { Icons } from '../constants';

interface VideoPreviewProps {
  metadata: VideoMetadata | null;
  editorState: EditorState;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  playbackRange?: { start: number; end: number } | null;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  metadata,
  editorState,
  onTimeUpdate,
  onDurationChange,
  videoRef,
  playbackRange
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Toggle Play/Pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      // If we are at the end of the range (or video), loop back to start before playing
      if (playbackRange && videoRef.current.currentTime >= playbackRange.end) {
          videoRef.current.currentTime = playbackRange.start;
      } else if (videoRef.current.ended) {
          videoRef.current.currentTime = 0;
      }
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Sync internal play state with external if needed
  useEffect(() => {
    if (videoRef.current) {
        if (editorState.isPlaying && videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
            setIsPlaying(true);
        } else if (!editorState.isPlaying && !videoRef.current.paused) {
            videoRef.current.pause();
            setIsPlaying(false);
        }
    }
  }, [editorState.isPlaying]);

  // Handle Playback Range / Looping
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const time = e.currentTarget.currentTime;
      onTimeUpdate(time);

      if (playbackRange && !editorState.isExporting) {
          if (time >= playbackRange.end || time < playbackRange.start) {
              if (isPlaying) {
                 e.currentTarget.currentTime = playbackRange.start;
              } else if (time < playbackRange.start) {
                  // If scrubbed before start, clamp
                  e.currentTarget.currentTime = playbackRange.start;
              } else if (time > playbackRange.end) {
                  // If scrubbed after end, clamp
                  e.currentTarget.currentTime = playbackRange.end;
              }
          }
      }
  };

  // Helper to generate CSS filter string
  const getFilterString = (c: ColorCorrection) => {
    return `
      brightness(${c.brightness}) 
      contrast(${c.contrast}) 
      saturate(${c.saturation}) 
      sepia(${Math.abs(c.temperature) / 100}) 
      hue-rotate(${c.tint}deg)
    `;
  };

  // Determine active correction based on scenes
  const getActiveCorrection = (): ColorCorrection => {
    const scenes = editorState.scenes || [];
    if (scenes.length === 0) return editorState.globalCorrection;

    // If scene selected, force that correction regardless of playhead (if within range)
    // But usually we want playhead driven.
    // However, if we are isolating a scene, we only play that scene, so playhead logic works fine.
    
    const sortedScenes = [...scenes].sort((a, b) => b.timestamp - a.timestamp);
    const activeScene = sortedScenes.find(s => s.timestamp <= editorState.currentTime);
    
    return activeScene ? activeScene.correction : editorState.globalCorrection;
  };

  const activeCorrection = getActiveCorrection();

  // Transform styles
  const stabilizationScale = editorState.stabilizationEnabled 
    ? 1 + (0.1 * editorState.stabilizationStrength) 
    : 1;

  const cropScale = editorState.crop.active ? editorState.crop.zoom : 1;
  const totalScale = stabilizationScale * cropScale;
  
  const translateX = editorState.crop.active ? (50 - editorState.crop.x) : 0;
  const translateY = editorState.crop.active ? (50 - editorState.crop.y) : 0;

  const transformStyle = `
    scale(${totalScale}) 
    translate(${translateX}%, ${translateY}%)
  `;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !metadata) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    let newTime = percentage * metadata.duration;
    
    // Clamp to range if active
    if (playbackRange) {
        newTime = Math.max(playbackRange.start, Math.min(playbackRange.end, newTime));
    }

    videoRef.current.currentTime = newTime;
    onTimeUpdate(newTime);
  };

  if (!metadata) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black/40 rounded-lg border border-gray-800">
        <p className="text-gray-500">No video loaded</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-black rounded-xl overflow-hidden shadow-2xl shadow-black/50 border border-gray-800">
      
      {/* Video Container */}
      <div 
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-black flex items-center justify-center"
      >
        <video
          ref={videoRef}
          src={metadata.url}
          className="max-w-full max-h-full object-contain transition-all duration-300 ease-out"
          style={{
            filter: getFilterString(activeCorrection),
            transform: transformStyle,
            transformOrigin: 'center center'
          }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={(e) => onDurationChange(e.currentTarget.duration)}
          onEnded={() => setIsPlaying(false)}
          loop={!!playbackRange} // Use native loop if range is entire video, manual loop in handler for range
          muted={false} 
        />
        
        {/* Isolation Indicator */}
        {playbackRange && (
            <div className="absolute top-4 right-4 bg-accent/90 text-black text-xs font-bold px-3 py-1 rounded shadow-lg animate-pulse">
                SCENE ISOLATION ACTIVE
            </div>
        )}

        {/* Overlays */}
        {editorState.crop.active && (
            <div className="absolute inset-0 pointer-events-none border-2 border-accent/30 z-10">
                <div className="absolute top-1/2 left-1/2 w-4 h-4 border-l-2 border-t-2 border-accent transform -translate-x-1/2 -translate-y-1/2 opacity-50"></div>
                <div className="absolute bottom-4 right-4 bg-black/60 text-accent text-xs px-2 py-1 rounded">
                    Smart Crop Active
                </div>
            </div>
        )}

        {editorState.stabilizationEnabled && (
             <div className="absolute top-4 left-4 bg-black/60 text-primary text-xs px-2 py-1 rounded flex items-center gap-1">
                <Icons.Activity size={12} />
                Stabilized ({(editorState.stabilizationStrength * 100).toFixed(0)}%)
            </div>
        )}
      </div>

      {/* Controls Bar */}
      <div className="h-16 bg-surface border-t border-gray-700 flex items-center px-4 gap-4 z-20">
        <button 
          onClick={togglePlay}
          disabled={editorState.isExporting}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-black hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {isPlaying ? <Icons.Pause size={20} fill="currentColor" /> : <Icons.Play size={20} fill="currentColor" className="ml-1"/>}
        </button>

        {/* Progress Bar */}
        <div 
            className="flex-1 h-3 bg-gray-700/50 rounded-full overflow-hidden relative group cursor-pointer hover:h-4 transition-all"
            onClick={handleSeek}
        >
            {/* Range Highlight if Isolation Active */}
            {playbackRange && (
                <div 
                    className="absolute top-0 h-full bg-accent/20"
                    style={{
                        left: `${(playbackRange.start / metadata.duration) * 100}%`,
                        width: `${((playbackRange.end - playbackRange.start) / metadata.duration) * 100}%`
                    }}
                />
            )}

            {/* Hover/Buffer bg */}
            <div className="absolute inset-0 w-full h-full opacity-0 group-hover:opacity-10 bg-white/10" />
            
            <div 
                className="absolute top-0 left-0 h-full bg-primary transition-all duration-75 ease-linear"
                style={{ width: `${(editorState.currentTime / metadata.duration) * 100}%` }}
            />
            
            {/* Scrubber Knob */}
            <div 
                className="absolute top-0 h-full w-1 bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)] opacity-0 group-hover:opacity-100"
                style={{ left: `${(editorState.currentTime / metadata.duration) * 100}%` }}
            />
        </div>

        <span className="text-xs font-mono text-gray-400 min-w-[80px] text-right">
          {new Date(editorState.currentTime * 1000).toISOString().substr(14, 5)} / 
          {new Date(metadata.duration * 1000).toISOString().substr(14, 5)}
        </span>
      </div>
    </div>
  );
};
