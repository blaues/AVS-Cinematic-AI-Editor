import { GoogleGenAI } from "@google/genai";
import { AgentAction, AIProviderId, ColorCorrection, EditorState } from "../types";

// Helper to create standardized system prompt
const SYSTEM_PROMPT = `
You are AVSTECH AI ASSISTANT, an expert video restoration AI agent integrated into the AVS Cinematic Editor.
Your goal is to assist the user in editing, restoring, and grading their 8mm/16mm or digital footage.

You have DIRECT CONTROL over the editor state. When the user asks for a change, you must output a specific JSON structure to execute it.

AVAILABLE ACTIONS:
1. UPDATE_CORRECTION: Adjust brightness (0.5-1.5), contrast (0.5-1.5), saturation (0-2), temp (-50 to 50), tint (-50 to 50).
2. SET_CROP: Set active=true, zoom (1-2), x (0-100), y (0-100).
3. ENABLE_STABILIZATION: Set enabled=true, strength (0-1).
4. ANALYZE_SCENE: Trigger a smart scene scan (no payload needed).
5. NO_ACTION: Just chat.

RESPONSE FORMAT:
You must ALWAYS respond with a JSON object. Do not include markdown formatting (like \`\`\`json).
{
  "message": "Friendly response to the user explaining what you did.",
  "action": {
    "type": "ACTION_NAME",
    "payload": { ...parameters... },
    "explanation": "Technical reason for change"
  }
}

Example: User says "Make it look warmer"
Response:
{
  "message": "I've added some warmth to the image to give it that nostalgic feel.",
  "action": {
    "type": "UPDATE_CORRECTION",
    "payload": { "temperature": 25, "tint": 5 },
    "explanation": "Increased temperature to +25 and slight tint correction."
  }
}

Context:
`;

export class AIServiceRegistry {
  private static instance: AIServiceRegistry;
  
  private constructor() {}

  static getInstance(): AIServiceRegistry {
    if (!AIServiceRegistry.instance) {
      AIServiceRegistry.instance = new AIServiceRegistry();
    }
    return AIServiceRegistry.instance;
  }

  // --- Validation Logic ---

  async validateKey(provider: AIProviderId, apiKey: string): Promise<boolean> {
    if (!apiKey) return false;

    try {
      switch (provider) {
        case 'google':
          const ai = new GoogleGenAI({ apiKey });
          await ai.models.generateContent({
             model: 'gemini-3-flash-preview',
             contents: { role: 'user', parts: [{ text: 'ping' }] }
          });
          return true;

        case 'openai':
        case 'groq':
        case 'deepseek':
        case 'moonshot':
          // All these use OpenAI-compatible endpoints
          const baseUrl = this.getBaseUrl(provider);
          const model = this.getDefaultModel(provider);
          
          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: model,
              messages: [{ role: 'user', content: 'ping' }],
              max_tokens: 5
            })
          });
          return res.ok;

        case 'anthropic':
          if (apiKey.startsWith('sk-ant')) return true; 
          return false;
          
        default:
          return false;
      }
    } catch (e) {
      console.error(`Validation failed for ${provider}`, e);
      return false;
    }
  }

  // --- Agent Chat Logic ---

  async sendChat(
    provider: AIProviderId, 
    apiKey: string, 
    model: string, 
    history: any[], 
    currentState: EditorState
  ): Promise<{ message: string; action?: AgentAction }> {
    
    // Determine active context
    let contextDescription = "Editing Whole Video (Global Settings).";
    let activeCorrection = currentState.globalCorrection;
    
    if (currentState.selectedSceneId) {
        const scene = currentState.scenes.find(s => s.id === currentState.selectedSceneId);
        if (scene) {
            contextDescription = `EDITING SPECIFIC SCENE: "${scene.description}". 
            Timestamp: ${scene.timestamp}s. 
            Any changes requested should apply ONLY to this scene.`;
            activeCorrection = scene.correction;
        }
    }

    // Prepare Context
    const stateContext = JSON.stringify({
      focus: contextDescription,
      currentSettings: {
        correction: activeCorrection,
        stabilization: currentState.stabilizationEnabled,
        crop: currentState.crop,
      },
      totalScenes: currentState.scenes.length
    });

    const fullSystemPrompt = SYSTEM_PROMPT + "\nCurrent State: " + stateContext;
    const messages = [
        { role: 'system', content: fullSystemPrompt },
        ...history
    ];

    try {
      let rawResponse = "";

      if (provider === 'google') {
        const ai = new GoogleGenAI({ apiKey });
        
        const geminiContent = [
            { role: 'user', parts: [{ text: `SYSTEM_INSTRUCTION: ${fullSystemPrompt}` }] },
            ...history.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }))
        ];
        
        const result = await ai.models.generateContent({
            model: model || 'gemini-3-flash-preview',
            contents: geminiContent,
            config: { responseMimeType: 'application/json' }
        });
        rawResponse = result.text || "{}";

      } else if (provider === 'anthropic') {
         throw new Error("Anthropic requires a backend proxy due to CORS. Please use Gemini, Groq, or OpenAI.");
      } else {
        const baseUrl = this.getBaseUrl(provider);
        const res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: model,
              messages: messages,
              response_format: { type: "json_object" } 
            })
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error?.message || "API Error");
        }
        
        const data = await res.json();
        rawResponse = data.choices[0].message.content;
      }

      try {
        const parsed = JSON.parse(rawResponse);
        return {
            message: parsed.message || "Done.",
            action: parsed.action?.type !== 'NO_ACTION' ? parsed.action : undefined
        };
      } catch (e) {
        console.error("Failed to parse agent JSON", rawResponse);
        return { message: "I tried to process that, but I got confused. Could you rephrase?" };
      }

    } catch (error: any) {
      console.error("Agent Error:", error);
      return { message: `Error: ${error.message || "AI Service Unreachable"}` };
    }
  }

  // --- Helpers ---

  private getBaseUrl(provider: AIProviderId): string {
    switch (provider) {
      case 'openai': return 'https://api.openai.com/v1';
      case 'groq': return 'https://api.groq.com/openai/v1';
      case 'deepseek': return 'https://api.deepseek.com/v1'; 
      case 'moonshot': return 'https://api.moonshot.cn/v1';
      default: return '';
    }
  }

  private getDefaultModel(provider: AIProviderId): string {
    switch(provider) {
        case 'openai': return 'gpt-4o';
        case 'groq': return 'llama3-70b-8192';
        case 'deepseek': return 'deepseek-chat';
        case 'moonshot': return 'moonshot-v1-8k';
        default: return '';
    }
  }
}