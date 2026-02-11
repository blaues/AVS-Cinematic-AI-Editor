export interface VideoMetadata {
  name: string;
  duration: number;
  width: number;
  height: number;
  url: string;
  file: File;
}

export interface ColorCorrection {
  brightness: number; // 0.5 to 1.5, default 1
  contrast: number;   // 0.5 to 1.5, default 1
  saturation: number; // 0 to 2, default 1
  temperature: number; // -50 to 50, default 0 (simulated via sepia/hue)
  tint: number; // -50 to 50, default 0
}

export interface CropSettings {
  active: boolean;
  aspectRatio: string; // "16:9", "9:16", "1:1"
  zoom: number; // 1 to 2
  x: number; // 0 to 100 (percentage)
  y: number; // 0 to 100 (percentage)
}

export interface SceneData {
  id: string;
  timestamp: number; // seconds
  thumbnail: string;
  correction: ColorCorrection;
  description: string;
  castType?: string; // New: Stores the detected cast (e.g., 'orange_cast')
}

export interface EditorState {
  isProcessing: boolean;
  isExporting: boolean; // New: track export state
  isPlaying: boolean;
  currentTime: number;
  stabilizationEnabled: boolean;
  stabilizationStrength: number; // New: 0 to 1
  autoColorEnabled: boolean;
  smartCropEnabled: boolean;
  globalCorrection: ColorCorrection;
  crop: CropSettings;
  scenes: SceneData[];
  selectedSceneId: string | null;
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  GENERATING = 'GENERATING',
  EXPORTING = 'EXPORTING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

// --- AI & Settings Types ---

export type AIProviderId = 'google' | 'openai' | 'anthropic' | 'groq' | 'deepseek' | 'moonshot';

export interface ApiConfig {
  provider: AIProviderId;
  apiKey: string;
  model: string;
  isValid: boolean;
}

export interface SettingsState {
  configs: Record<AIProviderId, ApiConfig>;
  activeProvider: AIProviderId;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  actionApplied?: string; // Description of action taken by agent
}

export interface AgentAction {
  type: 'UPDATE_CORRECTION' | 'SET_CROP' | 'ENABLE_STABILIZATION' | 'ANALYZE_SCENE' | 'NO_ACTION';
  payload?: any;
  explanation: string;
}

// --- Scene Detection Types ---

export interface SceneCut {
  frameNumber: number;
  timestamp: number;
  confidence: number;
  histogramDistance: number;
  edgeDifference: number;
  type: 'candidate' | 'splice' | 'content';
}

export interface DetectionConfig {
  histogramThreshold: number;
  edgeThreshold: number;
  minSceneDuration: number;
  flashFrameBrightness: number;
  flashFrameVariance: number;
  fadeDetectionWindow: number;
  temporalDebounce: number;
}

export interface DetectionDiagnostics {
  totalFrames: number;
  rawDetections: number;
  flashFramesFiltered: number;
  shortSegmentsMerged: number;
  fadeDetections: number;
  finalSceneCount: number;
  averageSceneDuration: number;
  confidenceHistogram: number[]; // distribution of confidence scores
}
