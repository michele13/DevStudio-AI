import { fileSystemService } from "./fileSystem";

/**
 * Service for interacting with the Gemini AI model via server-side proxy.
 * This "backend" logic is separated from the UI.
 */
export const aiService = {
  /**
   * Generates a response from the AI model.
   */
  generateResponse: async (input: string, messages: any[]) => {
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

    const res = await fetch('/api/ai-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input,
        projectContext: getProjectContext(),
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${res.status}`);
    }

    const response = await res.json();
    return response;
  }
};
