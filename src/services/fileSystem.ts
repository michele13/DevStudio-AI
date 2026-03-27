import { fs, vol } from 'memfs';
import { FileNode } from '../types';

/**
 * Service for interacting with the virtual file system (memfs).
 * This "backend" logic is separated from the UI.
 */
export const fileSystemService = {
  /**
   * Reads the entire file system and returns a tree structure.
   */
  getTree: (dir: string = '/'): FileNode[] => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }) as any[];
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      const path = (dir === '/' ? '' : dir) + '/' + entry.name;
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          type: 'folder',
          path,
          children: fileSystemService.getTree(path)
        });
      } else {
        nodes.push({
          name: entry.name,
          type: 'file',
          path
        });
      }
    }

    // Sort: folders first, then files, both alphabetically
    return nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });
  },

  /**
   * Normalizes a path, resolving .. and . segments.
   */
  normalizePath: (path: string): string => {
    const parts = path.split('/');
    const result: string[] = [];
    for (const part of parts) {
      if (part === '..') {
        result.pop();
      } else if (part !== '.' && part !== '') {
        result.push(part);
      }
    }
    return '/' + result.join('/');
  },

  /**
   * Renames or moves a file/folder.
   */
  move: (oldPath: string, newPath: string) => {
    const normalizedNewPath = fileSystemService.normalizePath(newPath);
    if (fs.existsSync(normalizedNewPath)) {
      throw new Error(`Target already exists: ${normalizedNewPath}`);
    }
    fs.renameSync(oldPath, normalizedNewPath);
    return normalizedNewPath; // Return normalized path for UI state updates
  },

  /**
   * Creates a new file.
   */
  createFile: (path: string, content: string = '') => {
    if (fs.existsSync(path)) {
      throw new Error(`File already exists: ${path}`);
    }
    fs.writeFileSync(path, content);
  },

  /**
   * Creates a new folder.
   */
  createFolder: (path: string) => {
    if (fs.existsSync(path)) {
      throw new Error(`Folder already exists: ${path}`);
    }
    fs.mkdirSync(path, { recursive: true });
  },

  /**
   * Deletes a file or folder.
   */
  delete: (path: string) => {
    const stats = fs.statSync(path);
    if (stats.isDirectory()) {
      fs.rmdirSync(path, { recursive: true });
    } else {
      fs.unlinkSync(path);
    }
  },

  /**
   * Reads a file's content as a string.
   */
  readFile: (path: string): string => {
    return fs.readFileSync(path, 'utf8') as string;
  },

  /**
   * Reads a file's content as a Uint8Array (binary).
   */
  readBinaryFile: (path: string): Uint8Array => {
    return fs.readFileSync(path) as Uint8Array;
  },

  /**
   * Writes content to a file.
   */
  writeFile: (path: string, content: string | Buffer | Uint8Array) => {
    fs.writeFileSync(path, content as any);
  },

  /**
   * Resets the file system to initial state.
   */
  reset: (initialFiles: Record<string, string>) => {
    vol.reset();
    vol.fromJSON(initialFiles);
  }
};
