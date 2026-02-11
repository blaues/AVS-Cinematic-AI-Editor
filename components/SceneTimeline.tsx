import React from 'react';
import { SceneData } from '../types';
import { Icons } from '../constants';

interface SceneTimelineProps {
  scenes: SceneData[];
  selectedSceneId: string | null;
  onSceneSelect: (id: string) => void;
  onSceneDoubleClick: (id: string) => void;
  onExportScene: (id: string) => void;
  onAddScene: () => void;
  videoDuration: number;
}

export const SceneTimeline: React.FC<SceneTimelineProps> = ({
  scenes,
  selectedSceneId,
  onSceneSelect,
  onSceneDoubleClick,
  onExportScene,
  onAddScene,
  videoDuration
}) => {
  
  // Helper to calculate end time based on next scene start or video duration
  const getSceneRange = (index: number) => {
    const start = scenes[index].timestamp;
    const end = (index < scenes.length - 1) 
      ? scenes[index + 1].timestamp 
      : videoDuration;
    return { start, end };
  };

  const formatTime = (t: number) => new Date(t * 1000).toISOString().substr(14, 5);

  return (
    <div className="w-full bg-surface border-t border-gray-700 p-4 select-none">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <Icons.Film size={16} />
            Scene Timeline
        </h3>
        <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 mr-2">
                Double-click scene to reset view
            </span>
            <button 
                onClick={onAddScene}
                className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-white flex items-center gap-1"
            >
                <Icons.Wand2 size={12} />
                Detect Scene
            </button>
        </div>
      </div>
      
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {scenes.length === 0 && (
            <div className="text-xs text-gray-500 italic p-2 border border-dashed border-gray-700 rounded w-full text-center">
                No scenes detected yet. Click 'Detect Scene' or use the AI Assistant.
            </div>
        )}
        
        {scenes.map((scene, idx) => {
          const { start, end } = getSceneRange(idx);
          const duration = end - start;
          const isSelected = selectedSceneId === scene.id;

          return (
            <div
              key={scene.id}
              onClick={() => onSceneSelect(scene.id)}
              onDoubleClick={() => onSceneDoubleClick(scene.id)}
              className={`
                relative min-w-[160px] h-24 rounded-lg border-2 cursor-pointer transition-all overflow-hidden group shrink-0
                ${isSelected ? 'border-primary ring-2 ring-primary/20 scale-105 z-10' : 'border-gray-700 hover:border-gray-500'}
              `}
            >
              {/* Scene Thumbnail / Background */}
              <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  {scene.thumbnail ? (
                      <img src={scene.thumbnail} alt="" className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"/>
                  ) : (
                      <span className="text-xs text-gray-600">Scene {idx + 1}</span>
                  )}
              </div>
              
              {/* Time Overlay */}
              <div className="absolute top-0 left-0 right-0 p-1 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent">
                  <span className="text-[10px] font-mono text-gray-300 bg-black/40 px-1 rounded">
                      {formatTime(start)} - {formatTime(end)}
                  </span>
                  {isSelected && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onExportScene(scene.id); }}
                        className="text-gray-300 hover:text-white bg-black/50 hover:bg-primary/80 rounded p-1 transition-colors"
                        title="Export Scene"
                      >
                          <Icons.Download size={10} />
                      </button>
                  )}
              </div>

              {/* Description Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-1.5">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] text-gray-200 truncate font-medium max-w-[100px]">{scene.description}</p>
                    <span className="text-[9px] text-gray-500 font-mono">{duration.toFixed(1)}s</span>
                  </div>
              </div>

              {/* Status Indicators */}
              {scene.correction.saturation !== 1 && (
                  <div className="absolute top-6 right-1 w-1.5 h-1.5 rounded-full bg-accent shadow shadow-black" title="Color Adjusted" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
