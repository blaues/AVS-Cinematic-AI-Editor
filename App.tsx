import React, { useState, useRef, useEffect } from 'react';
import { VideoDropzone } from './components/VideoDropzone';
import { VideoPreview } from './components/VideoPreview';
import { Slider } from './components/Slider';
import { SceneTimeline } from './components/SceneTimeline';
import { SettingsModal } from './components/SettingsModal';
import { ChatPanel } from './components/ChatPanel';
import { DetectionPreview } from './components/DetectionPreview';
import { analyzeFrameForColor, analyzeForSmartCrop } from './services/geminiService';
import { captureFrame, processAndExportVideo } from './services/videoProcessor';
import { AIServiceRegistry } from './services/aiRegistry';
import { 
    VideoMetadata, EditorState, ColorCorrection, ProcessingStatus, 
    SettingsState, AIProviderId, ChatMessage, AgentAction, SceneCut 
} from './types';
import { Icons, DEFAULT_CORRECTION, DEFAULT_CROP, PROVIDERS } from './constants';

const loadSettings = (): SettingsState => {
    const saved = localStorage.getItem('avs_settings');
    if (saved) return JSON.parse(saved);
    const defaults: SettingsState = {
        activeProvider: 'google',
        configs: {} as any
    };
    PROVIDERS.forEach(p => {
        defaults.configs[p.id as AIProviderId] = {
            provider: p.id as AIProviderId,
            apiKey: process.env.API_KEY && p.id === 'google' ? process.env.API_KEY : '',
            model: p.models[0],
            isValid: !!(process.env.API_KEY && p.id === 'google')
        };
    });
    return defaults;
};

function App() {
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [exportProgress, setExportProgress] = useState(0);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showDetectionPreview, setShowDetectionPreview] = useState(false);
  const [settings, setSettings] = useState<SettingsState>(loadSettings());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAgentProcessing, setIsAgentProcessing] = useState(false);

  const [editorState, setEditorState] = useState<EditorState>({
    isProcessing: false,
    isExporting: false,
    isPlaying: false,
    currentTime: 0,
    stabilizationEnabled: false,
    stabilizationStrength: 0.5,
    autoColorEnabled: false,
    smartCropEnabled: false,
    globalCorrection: { ...DEFAULT_CORRECTION },
    crop: { ...DEFAULT_CROP },
    scenes: [],
    selectedSceneId: null,
  });

  // Calculate playback range based on selected scene
  const getPlaybackRange = () => {
      if (!editorState.selectedSceneId || !metadata) return null;
      
      const scenes = [...editorState.scenes].sort((a,b) => a.timestamp - b.timestamp);
      const index = scenes.findIndex(s => s.id === editorState.selectedSceneId);
      if (index === -1) return null;

      const start = scenes[index].timestamp;
      const end = (index < scenes.length - 1) ? scenes[index+1].timestamp : metadata.duration;
      
      return { start, end };
  };

  const playbackRange = getPlaybackRange();

  useEffect(() => {
    localStorage.setItem('avs_settings', JSON.stringify(settings));
  }, [settings]);

  const handleFileSelect = (file: File) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      setMetadata({
        name: file.name,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        url,
        file
      });
    };
    video.src = url;
  };

  const updateCorrection = (key: keyof ColorCorrection, value: number) => {
    setEditorState(prev => {
        if (prev.selectedSceneId) {
            return {
                ...prev,
                scenes: prev.scenes.map(s => 
                    s.id === prev.selectedSceneId 
                    ? { ...s, correction: { ...s.correction, [key]: value } }
                    : s
                )
            };
        } else {
            return {
                ...prev,
                globalCorrection: { ...prev.globalCorrection, [key]: value }
            };
        }
    });
  };

  // --- Scene Logic ---

  const handleSceneSelect = (id: string) => {
      // Single click: Focus on scene (restrict playback)
      setEditorState(prev => {
         const scene = prev.scenes.find(s => s.id === id);
         return {
             ...prev,
             selectedSceneId: id,
             currentTime: scene ? scene.timestamp : prev.currentTime
         };
      });
      // Optionally seek immediately
      const scene = editorState.scenes.find(s => s.id === id);
      if (scene && videoRef.current) {
          videoRef.current.currentTime = scene.timestamp;
      }
  };

  const handleSceneDoubleClick = (id: string) => {
      // Double click: Reset selection to allow full video scrub
      setEditorState(prev => ({ ...prev, selectedSceneId: null }));
  };

  const handleExportScene = async (id: string) => {
    if(!videoRef.current || !metadata) return;
    
    setEditorState(prev => ({ ...prev, isExporting: true, selectedSceneId: id })); // Lock to scene
    setStatus(ProcessingStatus.EXPORTING);
    setExportProgress(0);

    try {
        alert("Scene Export Initiated (Full video export for demo - selective export requires backend ffmpeg)");
        await handleExport(); 

    } catch (e) {
        console.error(e);
        setStatus(ProcessingStatus.ERROR);
    } finally {
        setEditorState(prev => ({ ...prev, isExporting: false }));
        setTimeout(() => setStatus(ProcessingStatus.IDLE), 2000);
    }
  };


  // --- Agent Logic ---

  const handleChatMessage = async (text: string) => {
    const providerId = settings.activeProvider;
    const config = settings.configs[providerId];
    
    if (!config?.isValid) {
        setChatMessages(prev => [
            ...prev, 
            { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() },
            { id: (Date.now()+1).toString(), role: 'assistant', content: "Please configure a valid API Key in Settings to use AVSTECH AI.", timestamp: Date.now() }
        ]);
        return;
    }

    const newUserMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() };
    setChatMessages(prev => [...prev, newUserMsg]);
    setIsAgentProcessing(true);

    try {
        const registry = AIServiceRegistry.getInstance();
        const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
        history.push({ role: 'user', content: text });

        const response = await registry.sendChat(
            providerId,
            config.apiKey,
            config.model,
            history.slice(-10),
            editorState
        );

        let appliedActionDesc = "";
        if (response.action) {
            applyAgentAction(response.action);
            appliedActionDesc = response.action.explanation || "Action applied.";
        }

        const newBotMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'assistant',
            content: response.message,
            timestamp: Date.now(),
            actionApplied: appliedActionDesc
        };

        setChatMessages(prev => [...prev, newBotMsg]);

    } catch (e) {
        console.error("Chat error", e);
        setChatMessages(prev => [...prev, { 
            id: Date.now().toString(), 
            role: 'assistant', 
            content: "Connection error. Please check your API key and model availability.", 
            timestamp: Date.now() 
        }]);
    } finally {
        setIsAgentProcessing(false);
    }
  };

  const applyAgentAction = (action: AgentAction) => {
      switch (action.type) {
          case 'UPDATE_CORRECTION':
              if (action.payload) {
                  const updates = action.payload;
                  setEditorState(prev => {
                      const updateLogic = (c: ColorCorrection) => ({ ...c, ...updates });
                      if (prev.selectedSceneId) {
                          return {
                              ...prev,
                              scenes: prev.scenes.map(s => s.id === prev.selectedSceneId ? { ...s, correction: updateLogic(s.correction) } : s)
                          };
                      }
                      return { ...prev, globalCorrection: updateLogic(prev.globalCorrection) };
                  });
              }
              break;
          case 'SET_CROP':
              if (action.payload) {
                   setEditorState(prev => ({ ...prev, crop: { ...prev.crop, active: true, ...action.payload }, smartCropEnabled: true }));
              }
              break;
          case 'ENABLE_STABILIZATION':
              setEditorState(prev => ({ 
                  ...prev, 
                  stabilizationEnabled: true, 
                  stabilizationStrength: action.payload?.strength || 0.5 
              }));
              break;
          case 'ANALYZE_SCENE':
              handleSmartScan();
              break;
      }
  };

  // --- Handlers ---

  const handleSmartScan = () => {
      setShowDetectionPreview(true);
  };

  const handleDetectionConfirm = async (cuts: SceneCut[]) => {
      setShowDetectionPreview(false);
      if (!videoRef.current || cuts.length === 0) return;

      setStatus(ProcessingStatus.ANALYZING);
      
      // Always include start if not present (implicit 0:00 scene)
      const timestamps = [0, ...cuts.map(c => c.timestamp)].sort((a,b) => a - b);
      const uniqueTimestamps = Array.from(new Set(timestamps));

      const newScenes = [];
      videoRef.current.pause();

      for (let i = 0; i < uniqueTimestamps.length; i++) {
          const time = uniqueTimestamps[i];
          videoRef.current.currentTime = time;
          await new Promise(r => {
               const h = () => { videoRef.current?.removeEventListener('seeked', h); r(null); };
               videoRef.current?.addEventListener('seeked', h);
          });
          
          const frameData = captureFrame(videoRef.current);
          if (frameData) {
              try {
                  const analysis = await analyzeFrameForColor(frameData);
                  newScenes.push({
                      id: `scene-${Date.now()}-${i}`,
                      timestamp: time,
                      thumbnail: frameData, 
                      correction: analysis.correction,
                      castType: analysis.castType,
                      description: `Scene ${i + 1}: ${analysis.castType.replace('_', ' ')}`
                  });
              } catch (e) { console.error(e); }
          }
      }

      if (newScenes.length > 0) {
          setEditorState(prev => ({
              ...prev,
              scenes: newScenes,
              selectedSceneId: newScenes[0].id,
              autoColorEnabled: true
          }));
      }
      setStatus(ProcessingStatus.IDLE);
  };

  const handleAutoColor = async () => {
    if (!videoRef.current) return;
    setStatus(ProcessingStatus.ANALYZING);
    const frameData = captureFrame(videoRef.current);
    if (!frameData) { setStatus(ProcessingStatus.ERROR); return; }
    const analysis = await analyzeFrameForColor(frameData);
    setEditorState(prev => {
        if (prev.selectedSceneId) {
            return {
                ...prev,
                scenes: prev.scenes.map(s => s.id === prev.selectedSceneId ? {
                    ...s, 
                    correction: analysis.correction,
                    castType: analysis.castType,
                    description: `Manually Corrected`
                } : s)
            };
        }
        return { ...prev, autoColorEnabled: true, globalCorrection: analysis.correction };
    });
    setStatus(ProcessingStatus.COMPLETED);
    setTimeout(() => setStatus(ProcessingStatus.IDLE), 1000);
  };

  const handleExport = async () => {
      if(!videoRef.current) return;
      setEditorState(prev => ({ ...prev, isExporting: true }));
      setStatus(ProcessingStatus.EXPORTING);
      setExportProgress(0);
      try {
        await processAndExportVideo(
            videoRef.current,
            editorState.scenes,
            editorState.globalCorrection,
            editorState.crop,
            editorState.stabilizationEnabled,
            editorState.stabilizationStrength,
            (progress) => setExportProgress(progress)
        );
        setStatus(ProcessingStatus.COMPLETED);
      } catch (e) {
        console.error("Export failed", e);
        setStatus(ProcessingStatus.ERROR);
      } finally {
        setEditorState(prev => ({ ...prev, isExporting: false }));
        setTimeout(() => setStatus(ProcessingStatus.IDLE), 3000);
      }
  };

  const getCurrentValues = () => {
      if (editorState.selectedSceneId) {
          const s = editorState.scenes.find(x => x.id === editorState.selectedSceneId);
          if (s) return s.correction;
      }
      return editorState.globalCorrection;
  };
  
  const currentValues = getCurrentValues();

  if (!metadata) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <header className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
               <Icons.Film className="text-white w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">AVS Cinematic</h1>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-gray-400 hover:text-white transition-colors">
              <Icons.Settings />
          </button>
        </header>
        
        <div className="max-w-xl w-full animate-fade-in-up">
            <div className="text-center mb-10">
                <h2 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-indigo-200 mb-4">
                    AI-Powered Video Mastery
                </h2>
                <p className="text-gray-400 text-lg">
                    Stabilize, color grade, and reframe your footage instantly using AVSTECH Neural Engine.
                </p>
            </div>
            <VideoDropzone onFileSelect={handleFileSelect} />
        </div>
        <SettingsModal 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)} 
            settings={settings}
            onSave={setSettings}
        />
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden text-gray-200">
      
      {/* Header */}
      <header className="h-16 border-b border-gray-800 bg-surface/50 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
            <div 
                className="cursor-pointer flex items-center gap-2"
                onClick={() => setMetadata(null)}
            >
                <div className="w-6 h-6 bg-gradient-to-br from-primary to-accent rounded flex items-center justify-center">
                    <Icons.Film className="text-white w-3 h-3" />
                </div>
                <h1 className="text-lg font-bold text-white tracking-wide">AVS Cinematic</h1>
            </div>
            <span className="text-gray-600 mx-2">/</span>
            <span className="text-sm text-gray-400 truncate max-w-[200px]">{metadata.name}</span>
        </div>

        <div className="flex items-center gap-3">
             {status === ProcessingStatus.EXPORTING && (
                 <div className="flex items-center gap-2 px-3 py-1 bg-purple-900/30 rounded-full border border-purple-500/30 text-xs text-purple-300">
                     <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                     <span>Rendering {exportProgress.toFixed(0)}%</span>
                 </div>
             )}
            
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                <Icons.Settings size={20} />
            </button>
            <button 
                onClick={handleExport}
                disabled={editorState.isExporting || status === ProcessingStatus.ANALYZING}
                className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
                <Icons.Download size={16} />
                Export
            </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left: Video Preview */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden relative">
            <VideoPreview 
                metadata={metadata} 
                editorState={editorState}
                onTimeUpdate={(t) => setEditorState(prev => ({...prev, currentTime: t}))}
                onDurationChange={(d) => { /* handled in metadata load usually */ }}
                videoRef={videoRef}
                playbackRange={playbackRange}
            />
            
            {/* Overlay Scene Timeline */}
            <div className="mt-4">
                 <SceneTimeline 
                    scenes={editorState.scenes}
                    selectedSceneId={editorState.selectedSceneId}
                    onSceneSelect={handleSceneSelect}
                    onSceneDoubleClick={handleSceneDoubleClick}
                    onExportScene={handleExportScene}
                    onAddScene={handleSmartScan}
                    videoDuration={metadata.duration}
                 />
            </div>
        </div>

        {/* Right: Controls Sidebar & Chat */}
        <aside className="w-96 bg-surface border-l border-gray-800 flex flex-col overflow-hidden">
            
            {/* Split View: Chat (Top) and Controls (Bottom) */}
            
            <div className="flex-1 flex flex-col min-h-0">
                <ChatPanel 
                    messages={chatMessages}
                    onSendMessage={handleChatMessage}
                    isProcessing={isAgentProcessing}
                    onClear={() => setChatMessages([])}
                />
            </div>

            <div className="h-1/2 overflow-y-auto border-t border-gray-700 bg-surface">
                {/* AI Tools Section */}
                <div className="p-6 border-b border-gray-700">
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Manual Tools</h2>
                    
                    <div className="grid gap-3">
                        <button 
                            onClick={handleSmartScan}
                            disabled={status !== ProcessingStatus.IDLE}
                            className="flex items-center justify-between p-3 rounded-xl border bg-gray-800 border-gray-700 hover:border-blue-500 text-gray-300 hover:text-white transition-all"
                        >
                            <div className="flex items-center gap-3">
                                <Icons.Scissors size={18} className="text-blue-400" />
                                <span className="text-sm font-medium">Smart Scene Detection</span>
                            </div>
                        </button>

                        <div className="p-3 rounded-xl border bg-gray-800 border-gray-700">
                            <div 
                                className="flex items-center justify-between cursor-pointer"
                                onClick={() => setEditorState(prev => ({...prev, stabilizationEnabled: !prev.stabilizationEnabled}))}
                            >
                                <div className="flex items-center gap-3">
                                    <Icons.Activity size={18} className={editorState.stabilizationEnabled ? "text-primary" : "text-gray-400"} />
                                    <span className="text-sm font-medium">Stabilization</span>
                                </div>
                                {editorState.stabilizationEnabled && <Icons.Check size={14} className="text-primary" />}
                            </div>
                            
                            {editorState.stabilizationEnabled && (
                                <div className="mt-3 pt-3 border-t border-gray-700">
                                    <Slider 
                                        label="Strength"
                                        min={0} max={1} step={0.1}
                                        value={editorState.stabilizationStrength}
                                        onChange={(v) => setEditorState(prev => ({...prev, stabilizationStrength: v}))}
                                        formatValue={(v) => `${(v * 100).toFixed(0)}%`}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Color Correction Controls */}
                <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex flex-col">
                            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                {editorState.selectedSceneId ? "Scene Color" : "Global Color"}
                            </h2>
                        </div>
                        <div className="flex gap-2">
                             <button 
                                onClick={handleAutoColor}
                                className="text-xs bg-gray-700 hover:bg-gray-600 p-1.5 rounded text-white"
                                title="Auto Correct"
                            >
                                <Icons.Wand2 size={12} />
                            </button>
                            <button 
                                className="text-xs text-gray-500 hover:text-white flex items-center gap-1"
                                onClick={() => {
                                    if (editorState.selectedSceneId) {
                                        setEditorState(prev => ({
                                            ...prev,
                                            scenes: prev.scenes.map(s => s.id === prev.selectedSceneId ? {...s, correction: DEFAULT_CORRECTION} : s)
                                        }))
                                    } else {
                                        setEditorState(prev => ({ ...prev, globalCorrection: DEFAULT_CORRECTION }))
                                    }
                                }}
                            >
                                <Icons.Undo size={10} /> Reset
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-gray-800/50 p-3 rounded-lg">
                            <h3 className="text-[10px] font-bold text-gray-400 mb-3 uppercase">Grading</h3>
                            <Slider 
                                label="Temperature" 
                                min={-50} max={50} step={1} 
                                value={currentValues.temperature} 
                                onChange={(v) => updateCorrection('temperature', v)}
                            />
                            <Slider 
                                label="Contrast" 
                                min={0.5} max={1.5} step={0.05} 
                                value={currentValues.contrast} 
                                onChange={(v) => updateCorrection('contrast', v)}
                            />
                            <Slider 
                                label="Saturation" 
                                min={0} max={2} step={0.1} 
                                value={currentValues.saturation} 
                                onChange={(v) => updateCorrection('saturation', v)}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </aside>
      </main>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        settings={settings}
        onSave={setSettings}
      />
      
      {showDetectionPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-surface border border-gray-700 rounded-xl w-[600px] overflow-hidden shadow-2xl">
                <DetectionPreview
                    videoRef={videoRef}
                    onConfirm={handleDetectionConfirm}
                    onCancel={() => setShowDetectionPreview(false)}
                />
            </div>
          </div>
      )}
    </div>
  );
}

export default App;
