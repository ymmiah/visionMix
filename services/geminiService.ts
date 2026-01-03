
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const improvePrompt = async (simplePrompt: string): Promise<string> => {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Transform this simple image generation prompt into a highly detailed, artistic, and descriptive prompt for a high-end AI image generator. Focus on lighting, style, composition, and specific details. 
    
    Simple prompt: "${simplePrompt}"`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          improvedPrompt: {
            type: Type.STRING,
            description: "The enhanced, descriptive prompt."
          }
        },
        required: ["improvedPrompt"]
      }
    }
  });

  try {
    const data = JSON.parse(response.text || '{}');
    return data.improvedPrompt || simplePrompt;
  } catch (e) {
    return response.text || simplePrompt;
  }
};

export interface ImageData {
  data: string;
  mimeType: string;
}

export const generateCreativeSuggestions = async (prompt: string, imageCount: number, taskType: 'generate' | 'edit' | 'clean' | '3d'): Promise<string[]> => {
  const ai = getAIClient();
  let context = "";
  
  if (taskType === 'generate') {
    context = `User wants to GENERATE an image. Prompt: "${prompt}".`;
  } else if (taskType === 'clean') {
    context = `User wants to DEEP CLEAN an image (remove UI/clutter). Context: "${prompt}".`;
  } else if (taskType === '3d') {
    context = `User wants to TRANSFORM image to 3D. Context: "${prompt}".`;
  } else {
    context = `User wants to EDIT/MERGE ${imageCount} images. Prompt: "${prompt}".`;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `You are a creative AI Art Director.
    ${context}
    
    TASK: Generate 5 distinct, creative, and high-quality variations/ideas for this request.
    - Keep suggestions concise (10-15 words max) but descriptive.
    - If Clean: Suggest different levels of cleaning (e.g., "Remove UI only", "Remove UI + Extend Background").
    - If 3D: Suggest different render styles (e.g., "Cyberpunk Octane", "Claymorphism", "Hyper-realism").
    - If Merge: Suggest different compositions.
    
    OUTPUT: Return strictly a JSON object with a "suggestions" array of strings.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["suggestions"]
      }
    }
  });

  try {
    const data = JSON.parse(response.text || '{}');
    return data.suggestions || [prompt, prompt, prompt, prompt, prompt];
  } catch (e) {
    console.error("Failed to parse suggestions", e);
    return [prompt]; 
  }
};

export const generateImage = async (prompt: string): Promise<string> => {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1"
      }
    }
  });

  let imageUrl = '';
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }
  }

  if (!imageUrl) throw new Error("No image was generated.");
  return imageUrl;
};

export const editImage = async (images: ImageData[], instruction: string, preserveFidelity: boolean = false): Promise<string> => {
  const ai = getAIClient();
  
  const imageParts = images.map(img => ({
    inlineData: {
      data: img.data.includes(',') ? img.data.split(',')[1] : img.data,
      mimeType: img.mimeType
    }
  }));

  // Enhanced strict instructions for fidelity and inclusion
  const finalPrompt = preserveFidelity 
    ? `CRITICAL INSTRUCTION: ${instruction}. 
       RULES:
       1. You MUST use ALL ${images.length} provided input images. Do not ignore any source image.
       2. Maintain the EXACT geometric shape, text, and details of the primary objects from the source images.
       3. If removing UI, replace it seamlessly with the underlying background pattern/color.
       4. Do not hallucinate new text. Keep original names and labels legible.`
    : instruction;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        ...imageParts,
        { text: finalPrompt }
      ]
    }
  });

  let imageUrl = '';
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }
  }

  if (!imageUrl) throw new Error("Failed to edit the image.");
  return imageUrl;
};

/**
 * Advanced Visual Analysis to isolate core objects and strip screenshot elements.
 */
export const analyzeForDeepClean = async (image: ImageData): Promise<string> => {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            data: image.data.includes(',') ? image.data.split(',')[1] : image.data,
            mimeType: image.mimeType
          }
        },
        { text: `ACT AS A PIXEL-PERFECT IMAGE RESTORER. 
        
        TASK: Analyze this image and identify SPECIFIC clutter elements to remove.
        1. Identify the Top Status Bar (Time, Signal bars, Battery icon, Notch/Dynamic Island).
        2. Identify the Bottom Navigation Bar (Home indicator line, Back/Home/Recents buttons).
        3. Identify any floating action buttons (FABs), scroll bars, or overlay icons.
        
        OUTPUT: A precise, imperative command for an image generator that says:
        "Regenerate this image exactly as is, but strictly REMOVE [List identified UI elements]. EXTEND the background [Describe background color/pattern] to fill the gaps left by the UI. KEEP [Describe Core Subject] exactly identical. Do not change the aspect ratio or crop."` }
      ]
    }
  });
  return response.text || "Strictly remove all screenshot UI, status bars, and background clutter, isolating only the core subject.";
};

/**
 * Creates a comprehensive plan to merge multiple images without losing content.
 */
export const createMergePlan = async (images: ImageData[], userGoal: string): Promise<string> => {
  const ai = getAIClient();
  
  const imageParts = images.map(img => ({
    inlineData: {
      data: img.data.includes(',') ? img.data.split(',')[1] : img.data,
      mimeType: img.mimeType
    }
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        ...imageParts,
        { text: `You are a Creative Director. I have provided ${images.length} distinct images. 
        
        YOUR TASK:
        1. Analyze EACH image one by one. Identify the main subject, text labels, and key colors in each.
        2. Create a "Master Composition Plan" based on the user's goal: "${userGoal}".
        3. Ensure NO image is left out. Every input image must be represented in the final output.
        4. If the user wants to merge them, decide on a logical layout (e.g., side-by-side, collage, integrated scene).
        
        OUTPUT: A single, highly detailed prompt for an image generator. 
        The prompt must start with: "Create a composition using elements from the provided reference images..."
        It must explicitly list every object to be included and where it should be placed.
        It must emphasize preserving text legibility and original colors.` }
      ]
    }
  });

  return response.text || userGoal;
};
