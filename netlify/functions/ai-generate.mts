import { GoogleGenAI, Type } from "@google/genai";

const editFileFunction = {
  name: "edit_file",
  parameters: {
    type: Type.OBJECT,
    description:
      "Create or modify a file in the project. Use this to implement code changes requested by the user.",
    properties: {
      path: {
        type: Type.STRING,
        description: "The absolute path of the file (e.g., '/src/App.js').",
      },
      content: {
        type: Type.STRING,
        description: "The full content of the file.",
      },
    },
    required: ["path", "content"],
  },
};

export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = Netlify.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  try {
    const { input, projectContext } = await req.json();

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Project Context:\n${projectContext}\n\nUser Question: ${input}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction:
          "You are an expert AI software engineer. You can help users with their code and modify files directly using the edit_file tool. Always provide clear explanations.",
        tools: [{ functionDeclarations: [editFileFunction] }],
      },
    });

    // Extract text and functionCalls explicitly since they are getters
    // that won't survive JSON.stringify on the SDK response object
    const result: Record<string, unknown> = {};
    if (response.text) {
      result.text = response.text;
    }
    if (response.functionCalls && response.functionCalls.length > 0) {
      result.functionCalls = response.functionCalls;
    }

    return Response.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return Response.json({ error: message }, { status: 500 });
  }
};

export const config = {
  path: "/api/ai-generate",
  method: "POST",
};
