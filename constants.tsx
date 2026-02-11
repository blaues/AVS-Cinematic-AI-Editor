import React from 'react';

import { 
  Upload, 
  Play, 
  Pause, 
  Wand2, 
  Crop, 
  Activity, 
  Download, 
  Sliders, 
  Film, 
  X,
  Check,
  Undo,
  MonitorPlay,
  Scissors,
  Settings,
  MessageSquare,
  Bot,
  User,
  Key,
  Cpu,
  AlertCircle,
  Send,
  Sparkles,
  Trash2
} from 'lucide-react';

export const Icons = {
  Upload, 
  Play, 
  Pause, 
  Wand2, 
  Crop, 
  Activity, 
  Download, 
  Sliders, 
  Film, 
  X,
  Check,
  Undo,
  MonitorPlay,
  Scissors,
  Settings,
  MessageSquare,
  Bot,
  User,
  Key,
  Cpu,
  AlertCircle,
  Send,
  Sparkles,
  Trash2
};

export const DEFAULT_CORRECTION = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  temperature: 0,
  tint: 0,
};

export const DEFAULT_CROP = {
  active: false,
  aspectRatio: "16:9",
  zoom: 1,
  x: 50,
  y: 50
};

export const PROVIDERS = [
  { id: 'google', name: 'Google Gemini', models: ['gemini-3-flash-preview', 'gemini-3-pro-preview'] },
  { id: 'openai', name: 'OpenAI (ChatGPT)', models: ['gpt-4o', 'gpt-4o-mini'] },
  { id: 'anthropic', name: 'Anthropic Claude', models: ['claude-3-5-sonnet-20240620'] },
  { id: 'groq', name: 'Groq', models: ['llama3-70b-8192', 'mixtral-8x7b-32768'] },
  { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-chat'] },
  { id: 'moonshot', name: 'Kimi (Moonshot)', models: ['moonshot-v1-8k'] }
];