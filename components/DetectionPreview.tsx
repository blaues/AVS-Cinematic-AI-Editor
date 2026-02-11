import React, { useState } from 'react';
import { FilmCutDetector, CutDetectionResult } from '../services/sceneDetector';
import { SceneCut } from '../types';
import { Icons } from '../constants';

interface DetectionPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  onConfirm: (cuts: SceneCut[]) => void;
  onCancel: () => void;
}

export const DetectionPreview: React.FC<DetectionPreviewProps> = ({
  videoRef,
  onConfirm,
  onCancel
}) => {
  const [result, setResult] = useState<CutDetectionResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedCuts, setSelectedCuts] = useState<Set<number>>(new Set());
  const [threshold, setThreshold] = useState(0.7);

  const runDetection = async () => {
    if (!videoRef.current) return;
    
    setIsAnalyzing(true);
    
    // Create detector with current threshold
    const detector = new FilmCutDetector({
      histogramThreshold: threshold
    });
    
    const detectionResult = await detector.detectCuts(videoRef.current);
    setResult(detectionResult);
    
    // Auto-select high confidence cuts
    const autoSelected = new Set(
      detectionResult.cuts
        .filter(c => c.confidence > 0.8)
        .map(c => c.frameNumber)
    );
    setSelectedCuts(autoSelected);
    
    setIsAnalyzing(false);
  };

  const toggleCut = (frameNumber: number) => {
    const newSet = new Set(selectedCuts);
    if (newSet.has(frameNumber)) {
      newSet.delete(frameNumber);
    } else {
      newSet.add(frameNumber);
    }
    setSelectedCuts(newSet);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence > 0.8) return 'bg-green-500';
    if (confidence > 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const formatTimecode = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 24);
    return `${mins}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  if (isAnalyzing) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-400">Analyzing film content...</p>
        <p className="text-xs text-gray-600 mt-2">This may take 30-60 seconds</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="p-6 space-y-4">
        <div className="bg-amber-900/20 border border-amber-700/30 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
            <Icons.Scissors size={16} />
            Smart Scene Detection
          </h3>
          <p className="text-xs text-gray-400">
            AVS will analyze your film reel to find actual splice points and content changes.
            This is NOT time-based chunking—it's content-aware detection.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-gray-500 uppercase font-medium">Sensitivity: {threshold}</label>
          <input
            type="range"
            min="0.5"
            max="0.9"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Conservative (fewer scenes)</span>
            <span>Aggressive (more scenes)</span>
          </div>
        </div>

        <button
          onClick={runDetection}
          className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Icons.Play size={18} />
          Analyze Film Content
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
      {/* Diagnostics Summary */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-800/50 p-3 rounded">
          <div className="text-gray-500 mb-1">Frames Analyzed</div>
          <div className="text-white font-mono">{result.diagnostics.totalFrames}</div>
        </div>
        <div className="bg-gray-800/50 p-3 rounded">
          <div className="text-gray-500 mb-1">Raw Detections</div>
          <div className="text-white font-mono">{result.diagnostics.rawDetections}</div>
        </div>
        <div className="bg-gray-800/50 p-3 rounded">
          <div className="text-gray-500 mb-1">Flash Frames</div>
          <div className="text-amber-400 font-mono">{result.diagnostics.flashFramesFiltered}</div>
        </div>
        <div className="bg-gray-800/50 p-3 rounded">
          <div className="text-gray-500 mb-1">Final Scenes</div>
          <div className="text-green-400 font-mono text-lg">{result.diagnostics.finalSceneCount}</div>
        </div>
      </div>

      {/* Cut List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-500 uppercase">
          <span>Detected Cuts ({selectedCuts.size} selected)</span>
          <div className="flex gap-2">
            <button 
              onClick={() => setSelectedCuts(new Set(result.cuts.map(c => c.frameNumber)))}
              className="text-accent hover:text-accent/80"
            >
              Select All
            </button>
            <button 
              onClick={() => setSelectedCuts(new Set())}
              className="text-gray-400 hover:text-white"
            >
              Clear
            </button>
          </div>
        </div>

        {result.cuts.map((cut) => {
          const isSelected = selectedCuts.has(cut.frameNumber);
          const isHighConfidence = cut.confidence > 0.8;
          const isFlash = cut.type === 'splice';

          return (
            <div
              key={cut.frameNumber}
              onClick={() => toggleCut(cut.frameNumber)}
              className={`
                flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-all
                ${isSelected 
                  ? 'bg-primary/20 border-primary/50' 
                  : 'bg-gray-800/30 border-transparent hover:bg-gray-800/50'}
              `}
            >
              {/* Checkbox */}
              <div className={`
                w-5 h-5 rounded border flex items-center justify-center transition-colors
                ${isSelected ? 'bg-primary border-primary' : 'border-gray-600'}
              `}>
                {isSelected && <Icons.Check size={12} className="text-white" />}
              </div>

              {/* Timecode */}
              <div className="font-mono text-accent text-sm w-24">
                {formatTimecode(cut.timestamp)}
              </div>

              {/* Confidence bar */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${getConfidenceColor(cut.confidence)}`}
                      style={{ width: `${cut.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-8">
                    {Math.round(cut.confidence * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  {isFlash && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <Icons.Zap size={10} /> Splice
                    </span>
                  )}
                  <span>Hist: {(cut.histogramDistance * 100).toFixed(0)}%</span>
                  <span>Edge: {(cut.edgeDifference * 100).toFixed(0)}%</span>
                </div>
              </div>

              {/* Warning for low confidence */}
              {!isHighConfidence && !isSelected && (
                <Icons.AlertTriangle size={16} className="text-yellow-500" title="Low confidence - review recommended" />
              )}
            </div>
          );
        })}
      </div>

      {/* Warning if too many scenes */}
      {result.diagnostics.finalSceneCount > 20 && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 p-3 rounded text-xs">
          <p className="text-yellow-400 font-medium mb-1">Warning: Many scenes detected</p>
          <p className="text-gray-400">
            {result.diagnostics.finalSceneCount} scenes for a short reel is unusual. 
            Consider raising sensitivity threshold or merging short segments.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            const confirmedCuts = result.cuts.filter(c => selectedCuts.has(c.frameNumber));
            onConfirm(confirmedCuts);
          }}
          disabled={selectedCuts.size === 0}
          className="flex-1 py-2 bg-primary hover:bg-primary/90 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg text-sm"
        >
          Create {selectedCuts.size} Scenes
        </button>
      </div>
    </div>
  );
};
