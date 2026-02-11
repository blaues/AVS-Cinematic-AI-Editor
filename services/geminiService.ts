import { GoogleGenAI, Type } from "@google/genai";
import { ColorCorrection, SceneData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const applyTextPromptToSettings = async (
  prompt: string,
  currentSettings: ColorCorrection
): Promise<ColorCorrection> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert cinematic colorist and video editor. 
      The user wants to modify their video using this prompt: "${prompt}".
      
      Current settings are:
      - Brightness: ${currentSettings.brightness}
      - Contrast: ${currentSettings.contrast}
      - Saturation: ${currentSettings.saturation}
      - Temperature: ${currentSettings.temperature}
      - Tint: ${currentSettings.tint}
      
      Based on the prompt, adjust these parameters to achieve the desired look.
      - Brightness: 0.5 to 1.5 (1.0 is neutral)
      - Contrast: 0.5 to 1.5 (1.0 is neutral)
      - Saturation: 0.0 to 2.0 (1.0 is neutral)
      - Temperature: -50 to 50 (negative is cooler/blue, positive is warmer/orange)
      - Tint: -50 to 50 (negative is greener, positive is magenta)
      
      Respond only with the updated JSON object.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            brightness: { type: Type.NUMBER },
            contrast: { type: Type.NUMBER },
            saturation: { type: Type.NUMBER },
            temperature: { type: Type.NUMBER },
            tint: { type: Type.NUMBER },
          },
          required: ["brightness", "contrast", "saturation", "temperature", "tint"],
        },
      },
    });

    const result = response.text ? JSON.parse(response.text) : null;
    if (!result) throw new Error("No data returned from Gemini for prompt");

    return {
      brightness: result.brightness ?? currentSettings.brightness,
      contrast: result.contrast ?? currentSettings.contrast,
      saturation: result.saturation ?? currentSettings.saturation,
      temperature: result.temperature ?? currentSettings.temperature,
      tint: result.tint ?? currentSettings.tint,
    };
  } catch (error) {
    console.error("Gemini Prompt Error:", error);
    return currentSettings;
  }
};

export const analyzeFrameForColor = async (
  base64Image: string
): Promise<{ correction: ColorCorrection; castType: string }> => {
  try {
    // Strip header if present
    const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Data,
            },
          },
          {
            text: `Act as an expert film restoration colorist. 
            Analyze this 8mm film frame. It likely has color shifts due to aging or incorrect lighting (Daylight vs Tungsten).
            
            1. Identify the specific Color Cast from these types:
               - "orange_cast": Daylight film shot under Tungsten (Needs Blue boost/Red reduce)
               - "blue_cast": Tungsten film shot under Daylight (Needs Red boost/Blue reduce)
               - "magenta_shift": Aged film dye shift (Needs Green boost)
               - "green_shift": Fogged/Aged film (Needs Magenta boost)
               - "neutral": No significant cast
            
            2. Determine correction parameters to neutralize this cast and grade it professionally.
            
            Return JSON with:
            - castType: string (one of the above)
            - temperature: number (-50 to 50) negative=cool, positive=warm
            - tint: number (-50 to 50) negative=green, positive=magenta
            - brightness: number (0.5 to 1.5)
            - contrast: number (0.5 to 1.5)
            - saturation: number (0.0 to 2.0)
            `
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            castType: { type: Type.STRING },
            brightness: { type: Type.NUMBER },
            contrast: { type: Type.NUMBER },
            saturation: { type: Type.NUMBER },
            temperature: { type: Type.NUMBER },
            tint: { type: Type.NUMBER },
          },
          required: ["castType", "brightness", "contrast", "saturation", "temperature", "tint"],
        },
      },
    });

    const result = response.text ? JSON.parse(response.text) : null;
    
    if (!result) throw new Error("No data returned from Gemini");

    return {
      correction: {
        brightness: result.brightness ?? 1,
        contrast: result.contrast ?? 1,
        saturation: result.saturation ?? 1,
        temperature: result.temperature ?? 0,
        tint: result.tint ?? 0,
      },
      castType: result.castType || "neutral"
    };
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
        correction: {
            brightness: 1,
            contrast: 1,
            saturation: 1,
            temperature: 0,
            tint: 0
        },
        castType: "error"
    };
  }
};

export const analyzeForSmartCrop = async (
    base64Image: string
  ): Promise<{ x: number, y: number, zoom: number }> => {
    try {
      const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
  
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Data,
              },
            },
            {
              text: `Analyze this image for the main subject. 
              Determine the best center point (x, y percentages) to crop to keep the subject in focus.
              Also suggest a slight zoom level (1.0 to 1.5) to tighter frame the subject.
              Return JSON.`
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              x: { type: Type.NUMBER, description: "Center X percentage 0-100" },
              y: { type: Type.NUMBER, description: "Center Y percentage 0-100" },
              zoom: { type: Type.NUMBER, description: "Zoom level 1.0-1.5" },
            },
            required: ["x", "y", "zoom"],
          },
        },
      });
  
      const result = response.text ? JSON.parse(response.text) : null;
      if (!result) throw new Error("No crop data");

      return {
        x: result.x ?? 50,
        y: result.y ?? 50,
        zoom: result.zoom ?? 1
      };
    } catch (error) {
        console.error("Gemini Crop Error", error);
        return { x: 50, y: 50, zoom: 1 };
    }
  };

export const detectScenes = async (
    frames: { timestamp: number; data: string }[]
): Promise<any[]> => {
    return []; 
}
