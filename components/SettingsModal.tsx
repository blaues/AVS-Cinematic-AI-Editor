import React, { useState, useEffect } from 'react';
import { Icons, PROVIDERS } from '../constants';
import { SettingsState, AIProviderId } from '../types';
import { AIServiceRegistry } from '../services/aiRegistry';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsState;
  onSave: (settings: SettingsState) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave
}) => {
  const [localSettings, setLocalSettings] = useState<SettingsState>(settings);
  const [validating, setValidating] = useState<string | null>(null);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  const handleKeyChange = (provider: AIProviderId, key: string) => {
    setLocalSettings(prev => ({
      ...prev,
      configs: {
        ...prev.configs,
        [provider]: { ...prev.configs[provider], apiKey: key, isValid: false }
      }
    }));
  };

  const handleModelChange = (provider: AIProviderId, model: string) => {
    setLocalSettings(prev => ({
      ...prev,
      configs: {
        ...prev.configs,
        [provider]: { ...prev.configs[provider], model: model }
      }
    }));
  };

  const validateKey = async (provider: AIProviderId) => {
    const config = localSettings.configs[provider];
    if (!config.apiKey) return;

    setValidating(provider);
    const registry = AIServiceRegistry.getInstance();
    const isValid = await registry.validateKey(provider, config.apiKey);

    setLocalSettings(prev => ({
      ...prev,
      configs: {
        ...prev.configs,
        [provider]: { ...prev.configs[provider], isValid }
      }
    }));
    setValidating(null);
  };

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-[600px] max-h-[80vh] bg-surface border border-gray-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
                <Icons.Settings className="text-primary w-5 h-5" />
            </div>
            <div>
                <h2 className="text-lg font-bold text-white">AI Engine Configuration</h2>
                <p className="text-xs text-gray-400">Manage API keys to power the AVS Neural Engine</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <Icons.X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Active Provider Selection */}
            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3">Active AI Model</label>
                <div className="grid grid-cols-2 gap-3">
                    {PROVIDERS.map(p => (
                        <button
                            key={p.id}
                            onClick={() => setLocalSettings(prev => ({ ...prev, activeProvider: p.id as AIProviderId }))}
                            className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                                localSettings.activeProvider === p.id 
                                ? 'bg-primary/20 border-primary text-white ring-1 ring-primary' 
                                : 'bg-gray-700/30 border-transparent text-gray-400 hover:bg-gray-700'
                            }`}
                        >
                            <div className={`w-3 h-3 rounded-full ${localSettings.configs[p.id as AIProviderId]?.isValid ? 'bg-green-500' : 'bg-gray-600'}`} />
                            <span className="text-sm font-medium">{p.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Key Management */}
            <div className="space-y-4">
                {PROVIDERS.map(provider => {
                    const config = localSettings.configs[provider.id as AIProviderId];
                    const isActive = localSettings.activeProvider === provider.id;

                    return (
                        <div key={provider.id} className={`p-4 rounded-xl border ${isActive ? 'border-gray-600 bg-gray-800/30' : 'border-gray-800 bg-gray-900/20'} transition-all`}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-semibold text-gray-200">{provider.name}</h3>
                                    {config?.isValid && <Icons.Check size={14} className="text-green-500" />}
                                </div>
                                <select 
                                    value={config?.model}
                                    onChange={(e) => handleModelChange(provider.id as AIProviderId, e.target.value)}
                                    className="bg-gray-950 border border-gray-700 text-xs text-gray-300 rounded px-2 py-1 outline-none focus:border-primary"
                                >
                                    {provider.models.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                            
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Icons.Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                                    <input 
                                        type="password"
                                        placeholder={`Enter ${provider.name} API Key`}
                                        value={config?.apiKey || ''}
                                        onChange={(e) => handleKeyChange(provider.id as AIProviderId, e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-gray-600 focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>
                                <button
                                    onClick={() => validateKey(provider.id as AIProviderId)}
                                    disabled={!config?.apiKey || validating === provider.id}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {validating === provider.id ? 'Checking...' : 'Validate'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 bg-gray-900/50 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
            <button 
                onClick={handleSave}
                className="px-6 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-lg shadow-lg shadow-primary/20 transition-all"
            >
                Save Configuration
            </button>
        </div>
      </div>
    </div>
  );
};
