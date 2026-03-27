export interface FileNode {
  name: string;
  type: 'file' | 'folder';
  content?: string;
  children?: FileNode[];
  path: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface CommitInfo {
  oid: string;
  message: string;
  author: string;
  timestamp: number;
}
