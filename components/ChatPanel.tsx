import React, { useState, useRef, useEffect } from 'react';
import { Icons } from '../constants';
import { ChatMessage } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isProcessing: boolean;
  onClear: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  onSendMessage,
  isProcessing,
  onClear
}) => {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing) return;
    onSendMessage(input);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-gray-900/50">
        {/* Chat Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900">
            <div className="flex items-center gap-2">
                <div className="bg-accent/20 p-1.5 rounded-lg">
                    <Icons.Bot className="text-accent w-4 h-4" />
                </div>
                <div>
                    <span className="text-xs font-bold text-gray-200 uppercase tracking-widest block">AVSTECH AI</span>
                    <span className="text-[10px] text-accent">Intelligent Assistant</span>
                </div>
            </div>
            <button onClick={onClear} className="text-gray-500 hover:text-red-400 transition-colors" title="Clear History">
                <Icons.Trash2 size={14} />
            </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
            {messages.length === 0 && (
                <div className="text-center text-gray-500 mt-10">
                    <Icons.Sparkles className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">AVSTECH AI Ready.</p>
                    <p className="text-[10px] mt-2">I can detect scenes, correct color, and stabilize your footage.</p>
                </div>
            )}
            
            {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`
                        max-w-[85%] rounded-2xl px-4 py-3 text-sm
                        ${msg.role === 'user' 
                            ? 'bg-primary text-white rounded-br-none' 
                            : 'bg-gray-800 border border-gray-700 text-gray-200 rounded-bl-none'}
                    `}>
                        <p>{msg.content}</p>
                        {msg.actionApplied && (
                            <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2 text-[10px] text-accent/80">
                                <Icons.Check size={10} />
                                <span>{msg.actionApplied}</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
            
            {isProcessing && (
                <div className="flex justify-start">
                     <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100" />
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200" />
                     </div>
                </div>
            )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700 bg-gray-900">
            <div className="relative">
                <input 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Describe changes..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-4 pr-10 py-3 text-sm text-white focus:ring-1 focus:ring-accent outline-none placeholder:text-gray-500"
                    disabled={isProcessing}
                />
                <button 
                    type="submit"
                    disabled={!input.trim() || isProcessing}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-accent/10 text-accent rounded-lg hover:bg-accent hover:text-black transition-all disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-accent"
                >
                    <Icons.Send size={16} />
                </button>
            </div>
        </form>
    </div>
  );
};
