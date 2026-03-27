import { GoogleGenAI, Type } from "@google/genai";
import { fileSystemService } from "./fileSystem";

/**
 * Service for interacting with the Gemini AI model.
 * This "backend" logic is separated from the UI.
 */
export const aiService = {
  /**
   * Generates a response from the AI model.
   */
  generateResponse: async (input: string, messages: any[]) => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Helper to provide project context to the AI
    const getProjectContext = () => {
      const filesMap: Record<string, string> = {};
      const traverse = (dir: string) => {
        const entries = fileSystemService.getTree(dir);
        for (const entry of entries) {
          if (entry.type === 'file') {
            filesMap[entry.path] = fileSystemService.readFile(entry.path);
          } else if (entry.children) {
            traverse(entry.path);
          }
        }
      };
      traverse('/');
      return JSON.stringify(filesMap, null, 2);
    };

    const editFileFunction = {
      name: "edit_file",
      parameters: {
        type: Type.OBJECT,
        description: "Create or modify a file in the project. Use this to implement code changes requested by the user.",
        properties: {
          path: { type: Type.STRING, description: "The absolute path of the file (e.g., '/src/App.js')." },
          content: { type: Type.STRING, description: "The full content of the file." }
        },
        required: ["path", "content"]
      }
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { role: 'user', parts: [{ text: `Project Context:\n${getProjectContext()}\n\nUser Question: ${input}` }] }
      ],
      config: {
        systemInstruction: "You are an expert AI software engineer. You can help users with their code and modify files directly using the edit_file tool. Always provide clear explanations.",
        tools: [{ functionDeclarations: [editFileFunction] }]
      }
    });

    return response;
  }
};
