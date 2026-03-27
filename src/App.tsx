import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderTree, 
  History, 
  Code2, 
  Download, 
  Upload, 
  Plus, 
  FilePlus, 
  FolderPlus, 
  Bot, 
  X, 
  Menu,
  Save, 
  GitCommit, 
  CheckCircle2, 
  FileCode,
  Eye
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import JSZip from 'jszip';
import { format } from 'date-fns';
import { fs } from 'memfs';

// --- Services (The "Backend" Logic) ---
import { fileSystemService } from './services/fileSystem';
import { gitService } from './services/gitService';
import { aiService } from './services/aiService';

// --- Components (The Frontend UI) ---
import { FileTree } from './components/explorer/FileTree';
import { PreviewPanel } from './components/preview/PreviewPanel';
import { cn } from './lib/utils';
import { FileNode, ChatMessage, CommitInfo } from './types';

// --- Initial Project Template ---
const INITIAL_PROJECT = {
  '/README.md': '# Welcome to DevStudio AI\n\nStart coding and chatting!',
  '/src/index.js': 'console.log("Hello, World!");',
  '/package.json': '{\n  "name": "my-project",\n  "version": "1.0.0"\n}'
};

// Initialize the virtual file system with the template
fileSystemService.reset(INITIAL_PROJECT);

/**
 * Main Application Component (DevStudio AI)
 * 
 * This component coordinates the state between the File System, Git, and AI services.
 * It has been refactored to separate logic (services) from presentation (components).
 */
export default function App() {
  // --- UI State ---
  const [activeTab, setActiveTab] = useState<'files' | 'git'>('files');
  const [rightPanelTab, setRightPanelTab] = useState<'chat' | 'preview'>('chat');
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isCommiting, setIsCommiting] = useState(false);
  
  // --- Data State ---
  const [files, setFiles] = useState<FileNode[]>([]);
  const [openFiles, setOpenFiles] = useState<string[]>(['/README.md']);
  const [selectedFile, setSelectedFile] = useState<string | null>('/README.md');
  const [modifiedFiles, setModifiedFiles] = useState<Record<string, string>>({});
  const [fileContent, setFileContent] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: 'Hello! I am your AI coding assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  // --- Resizing State ---
  const [sidebarWidth, setSidebarWidth] = useState(288); // 72 * 4
  const [chatWidth, setChatWidth] = useState(384); // 96 * 4
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingChat, setIsResizingChat] = useState(false);

  // --- Explorer State ---
  const [creatingIn, setCreatingIn] = useState<{ path: string, type: 'file' | 'folder' } | null>(null);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // --- Window Size Listener ---
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Modals ---
  const [modal, setModal] = useState<{
    type: 'confirm' | 'prompt';
    title: string;
    message: string;
    onConfirm: (value?: string) => void;
    defaultValue?: string;
  } | null>(null);

  // --- Chat Scrolling ---
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = Math.max(150, Math.min(500, e.clientX));
        setSidebarWidth(newWidth);
      }
      if (isResizingChat) {
        const newWidth = Math.max(200, Math.min(600, windowWidth - e.clientX));
        setChatWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      setIsResizingChat(false);
    };

    if (isResizingSidebar || isResizingChat) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    } else {
      document.body.style.cursor = 'default';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar, isResizingChat]);

  // --- Initial Load ---
  useEffect(() => {
    refreshFileTree();
    initGit();
  }, []);

  // --- File Loading ---
  useEffect(() => {
    if (selectedFile) {
      try {
        if (fs.existsSync(selectedFile)) {
          // If we have unsaved changes, use those. Otherwise, read from FS.
          const content = modifiedFiles[selectedFile] ?? fileSystemService.readFile(selectedFile);
          setFileContent(content);
        } else {
          handleCloseTab(selectedFile);
        }
      } catch (e) {
        console.error('Error reading file:', e);
      }
    }
  }, [selectedFile]);

  const handleSelectFile = (path: string) => {
    if (!openFiles.includes(path)) {
      setOpenFiles(prev => [...prev, path]);
    }
    setSelectedFile(path);
  };

  const handleCloseTab = (path: string) => {
    const isModified = modifiedFiles[path] !== undefined;
    const close = () => {
      const newOpenFiles = openFiles.filter(f => f !== path);
      setOpenFiles(newOpenFiles);
      if (selectedFile === path) {
        setSelectedFile(newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : null);
      }
      setModifiedFiles(prev => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
    };

    if (isModified) {
      setModal({
        type: 'confirm',
        title: 'Unsaved Changes',
        message: `Do you want to discard changes to ${path}?`,
        onConfirm: close
      });
    } else {
      close();
    }
  };

  // --- Git Logic ---
  const initGit = async () => {
    try {
      console.log('Starting Git initialization...');
      await gitService.init();
      
      // Small delay to ensure FS is settled (sometimes needed with memfs + isomorphic-git)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      await gitService.addAll();
      await gitService.commit('Initial commit', { name: 'User', email: 'user@example.com' });
      await refreshGitHistory();
      console.log('Git initialization complete.');
    } catch (e) {
      console.error('Git init error:', e);
    }
  };

  const refreshGitHistory = async () => {
    try {
      console.log('Refreshing Git history...');
      const history = await gitService.getHistory();
      console.log(`Retrieved ${history.length} commits.`);
      setCommits(history);
    } catch (e) {
      console.error('Refresh history error:', e);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage) return;
    setIsLoading(true);
    try {
      console.log('Committing changes...');
      await gitService.addAll();
      await gitService.commit(commitMessage, { name: 'User', email: 'user@example.com' });
      setCommitMessage('');
      setIsCommiting(false);
      await refreshGitHistory();
      console.log('Commit successful.');
    } catch (e) {
      console.error('Commit error:', e);
      alert('Error committing: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckout = (oid: string) => {
    setModal({
      type: 'confirm',
      title: 'Checkout',
      message: 'Are you sure? Uncommitted changes will be lost.',
      onConfirm: async () => {
        setIsLoading(true);
        try {
          console.log('Checking out commit:', oid);
          await gitService.checkout(oid);
          refreshFileTree();
          if (selectedFile) {
            try {
              if (fs.existsSync(selectedFile)) {
                const content = fileSystemService.readFile(selectedFile);
                setFileContent(content);
              } else {
                setSelectedFile(null);
              }
            } catch {
              setSelectedFile(null);
            }
          }
          console.log('Checkout successful.');
        } catch (e) {
          console.error('Checkout error:', e);
          alert('Checkout error: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
          setIsLoading(false);
        }
      }
    });
  };

  // --- File System Handlers ---
  const refreshFileTree = () => {
    const tree = fileSystemService.getTree();
    setFiles(tree);
  };

  const handleSaveFile = () => {
    if (selectedFile && modifiedFiles[selectedFile] !== undefined) {
      fileSystemService.writeFile(selectedFile, modifiedFiles[selectedFile]);
      setModifiedFiles(prev => {
        const next = { ...prev };
        delete next[selectedFile];
        return next;
      });
    }
  };

  const handleFileChange = (value: string) => {
    if (!selectedFile) return;
    setFileContent(value);
    
    const originalContent = fileSystemService.readFile(selectedFile);
    if (value !== originalContent) {
      setModifiedFiles(prev => ({ ...prev, [selectedFile]: value }));
    } else {
      setModifiedFiles(prev => {
        const next = { ...prev };
        delete next[selectedFile];
        return next;
      });
    }
  };

  const handleDelete = (path: string) => {
    setModal({
      type: 'confirm',
      title: 'Delete',
      message: `Are you sure you want to delete ${path}?`,
      onConfirm: () => {
        try {
          fileSystemService.delete(path);
          if (selectedFile === path) setSelectedFile(null);
          refreshFileTree();
        } catch (e) {
          alert('Delete error: ' + e);
        }
      }
    });
  };

  const updatePathsInState = (oldPath: string, newPath: string) => {
    setOpenFiles(prev => prev.map(p => {
      if (p === oldPath) return newPath;
      if (p.startsWith(oldPath + '/')) {
        return newPath + p.substring(oldPath.length);
      }
      return p;
    }));
    
    if (selectedFile === oldPath) {
      setSelectedFile(newPath);
    } else if (selectedFile?.startsWith(oldPath + '/')) {
      setSelectedFile(newPath + selectedFile.substring(oldPath.length));
    }
    
    setModifiedFiles(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(prev).forEach(p => {
        if (p === oldPath || p.startsWith(oldPath + '/')) {
          const newP = p === oldPath ? newPath : newPath + p.substring(oldPath.length);
          next[newP] = prev[p];
          delete next[p];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  };

  const handleRename = (oldPath: string, newName: string) => {
    const parent = oldPath.substring(0, oldPath.lastIndexOf('/')) || '/';
    const newPath = (parent === '/' ? '' : parent) + '/' + newName;
    try {
      const normalizedNewPath = fileSystemService.move(oldPath, newPath);
      updatePathsInState(oldPath, normalizedNewPath);
      refreshFileTree();
    } catch (e) {
      alert('Rename error: ' + e);
    }
  };

  const handleMove = (sourcePath: string, targetParentPath: string) => {
    const fileName = sourcePath.split('/').pop();
    const newPath = (targetParentPath === '/' ? '' : targetParentPath) + '/' + fileName;
    try {
      const normalizedNewPath = fileSystemService.move(sourcePath, newPath);
      updatePathsInState(sourcePath, normalizedNewPath);
      refreshFileTree();
    } catch (e) {
      alert('Move error: ' + e);
    }
  };

  const handleCreateFile = (parentPath: string, name: string) => {
    const path = (parentPath === '/' ? '' : parentPath) + '/' + name;
    try {
      fileSystemService.createFile(path);
      refreshFileTree();
      handleSelectFile(path); // Use handleSelectFile to open the tab
    } catch (e) {
      alert('Create file error: ' + e);
    }
  };

  const handleCreateFolder = (parentPath: string, name: string) => {
    const path = (parentPath === '/' ? '' : parentPath) + '/' + name;
    try {
      fileSystemService.createFolder(path);
      refreshFileTree();
    } catch (e) {
      alert('Create folder error: ' + e);
    }
  };

  // --- AI Chat Logic ---
  const handleChat = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);
    setIsThinking(true);

    try {
      const response = await aiService.generateResponse(userMsg, messages);
      const text = response.text || "I've processed your request.";
      setMessages(prev => [...prev, { role: 'model', text }]);

      if (response.functionCalls) {
        for (const call of response.functionCalls) {
          if (call.name === 'edit_file') {
            const { path, content } = call.args as { path: string, content: string };
            fileSystemService.writeFile(path, content);
            if (selectedFile === path) setFileContent(content);
            refreshFileTree();
            setMessages(prev => [...prev, { role: 'model', text: `✅ Updated file: ${path}` }]);
          }
        }
      }
    } catch (e) {
      console.error('Chat error:', e);
      setMessages(prev => [...prev, { role: 'model', text: 'Sorry, I encountered an error.' }]);
    } finally {
      setIsLoading(false);
      setIsThinking(false);
    }
  };

  // --- ZIP Operations ---
  const handleDownloadZip = async () => {
    const zip = new JSZip();
    
    // Recursive function to add all files to the ZIP
    const traverse = (dir: string, zipFolder: JSZip) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true }) as any[];
      
      for (const entry of entries) {
        const path = (dir === '/' ? '' : dir) + '/' + entry.name;
        
        if (entry.isDirectory()) {
          // Recurse into subdirectories
          traverse(path, zipFolder.folder(entry.name)!);
        } else {
          // Read file as binary (Uint8Array) to prevent corruption
          const content = fs.readFileSync(path) as Uint8Array;
          zipFolder.file(entry.name, content);
        }
      }
    };

    console.log('Generating ZIP for download...');
    traverse('/', zip);
    
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project.zip';
    a.click();
    console.log('Download triggered.');
  };

  const handleUploadZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const zip = await JSZip.loadAsync(file);
      
      console.log('Resetting file system with uploaded content...');
      // Clear current FS
      fileSystemService.reset({});
      
      // Determine if there's a common root directory to strip
      const filePaths = Object.keys(zip.files).filter(path => !zip.files[path].dir);
      let commonRoot = '';
      
      if (filePaths.length > 0) {
        const firstPath = filePaths[0];
        const firstPathParts = firstPath.split('/');
        
        if (firstPathParts.length > 1) {
          const potentialRoot = firstPathParts[0] + '/';
          const allShareRoot = filePaths.every(path => path.startsWith(potentialRoot));
          if (allShareRoot) {
            commonRoot = potentialRoot;
            console.log('Detected common root directory in ZIP:', commonRoot);
          }
        }
      }

      console.log(`Extracting ${filePaths.length} files...`);
      // Extract all files from the ZIP
      for (const [path, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir) {
          // Strip common root if present
          let relativePath = path;
          if (commonRoot && path.startsWith(commonRoot)) {
            relativePath = path.substring(commonRoot.length);
          }
          
          if (!relativePath) continue;

          // Ensure path starts with /
          const fullPath = relativePath.startsWith('/') ? relativePath : '/' + relativePath;
          const content = await zipEntry.async('uint8array');
          
          // Ensure parent directory exists
          const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/')) || '/';
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }
          
          // Use Buffer for binary safety in memfs
          fs.writeFileSync(fullPath, Buffer.from(content));
        }
      }
      
      refreshFileTree();
      
      // Clear tabs and modified state on upload
      setOpenFiles([]);
      setModifiedFiles({});
      
      // Check if .git folder exists in the uploaded content
      const gitExists = fs.existsSync('/.git');
      const gitHeadExists = fs.existsSync('/.git/HEAD');
      
      console.log('Git folder check:', { gitExists, gitHeadExists });

      if (gitExists && gitHeadExists) {
        console.log('.git folder found in upload, refreshing history...');
        // Ensure the repository is recognized
        await gitService.ensureInit('/');
        await refreshGitHistory();
      } else {
        console.log('No valid .git folder found in upload, initializing new repository...');
        await initGit();
      }
      
      setSelectedFile('/README.md');
      console.log('Upload successful.');
    } catch (e) {
      console.error('Upload error:', e);
      alert('Upload error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadFile = (path: string, name: string) => {
    const content = fileSystemService.readFile(path);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | FileList, targetPath: string = '/') => {
    const files = (e as React.ChangeEvent<HTMLInputElement>).target?.files || (e as FileList);
    if (!files || files.length === 0) return;
    
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target?.result;
        if (typeof content === 'string' || content instanceof ArrayBuffer) {
          const path = (targetPath === '/' ? '' : targetPath) + '/' + file.name;
          try {
            if (content instanceof ArrayBuffer) {
              fileSystemService.writeFile(path, Buffer.from(content));
            } else {
              fileSystemService.writeFile(path, content);
            }
            refreshFileTree();
          } catch (err) {
            console.error('Error saving uploaded file:', err);
          }
        }
      };
      // Read as text for common code/text files, otherwise as ArrayBuffer
      const isText = file.type.startsWith('text/') || 
                    /\.(md|js|ts|tsx|jsx|css|json|html|txt|svg|yml|yaml)$/i.test(file.name);
      
      if (isText) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-[#cccccc] font-sans overflow-hidden">
      {/* Top Toolbar */}
      <header className="h-12 border-b border-[#333333] flex items-center justify-between px-4 bg-[#252526] z-30">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="md:hidden p-1.5 hover:bg-[#333333] rounded text-[#858585]"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Code2 className="w-6 h-6 text-blue-400" />
          <h1 className="font-semibold text-white tracking-tight hidden sm:block">DevStudio AI</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden md:flex items-center gap-2">
            <button 
              onClick={() => setModal({ 
                type: 'confirm', 
                title: 'New Project', 
                message: 'Are you sure you want to reset the project? All unsaved changes will be lost.', 
                onConfirm: () => { 
                  fileSystemService.reset(INITIAL_PROJECT); 
                  refreshFileTree(); 
                  setSelectedFile('/README.md');
                  setOpenFiles(['/README.md']);
                  setModifiedFiles({});
                  initGit();
                } 
              })}
              className="flex items-center gap-1.5 px-3 py-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30 rounded text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden lg:inline">New Project</span>
            </button>
            <button onClick={handleDownloadZip} className="flex items-center gap-1.5 px-3 py-1 bg-[#333333] hover:bg-[#444444] rounded text-sm">
              <Download className="w-4 h-4" />
              <span className="hidden lg:inline">Download</span>
            </button>
            <label className="flex items-center gap-1.5 px-3 py-1 bg-[#333333] hover:bg-[#444444] rounded text-sm cursor-pointer">
              <Upload className="w-4 h-4" />
              <span className="hidden lg:inline">Upload</span>
              <input type="file" accept=".zip" className="hidden" onChange={handleUploadZip} />
            </label>
          </div>
          
          {/* Mobile Actions */}
          <div className="md:hidden flex items-center gap-1">
            <button 
              onClick={() => setModal({ 
                type: 'confirm', 
                title: 'New Project', 
                message: 'Are you sure you want to reset the project? All unsaved changes will be lost.', 
                onConfirm: () => { 
                  fileSystemService.reset(INITIAL_PROJECT); 
                  refreshFileTree(); 
                  setSelectedFile('/README.md');
                  setOpenFiles(['/README.md']);
                  setModifiedFiles({});
                  initGit();
                } 
              })}
              className="p-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30 rounded transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
            <label className="p-1.5 hover:bg-[#333333] rounded text-[#858585] cursor-pointer">
              <Upload className="w-4 h-4" />
              <input type="file" accept=".zip" className="hidden" onChange={handleUploadZip} />
            </label>
            <button onClick={handleDownloadZip} className="p-1.5 hover:bg-[#333333] rounded text-[#858585]"><Download className="w-4 h-4" /></button>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                if (isChatOpen && rightPanelTab === 'preview') {
                  setIsChatOpen(false);
                } else {
                  setRightPanelTab('preview');
                  setIsChatOpen(true);
                }
              }} 
              className={cn(
                "p-1.5 rounded transition-colors", 
                isChatOpen && rightPanelTab === 'preview' ? "bg-blue-600 text-white" : "bg-[#333333] text-[#858585] hover:bg-[#444444]"
              )}
              title="Preview"
            >
              <Eye className="w-5 h-5" />
            </button>
            <button 
              onClick={() => {
                if (isChatOpen && rightPanelTab === 'chat') {
                  setIsChatOpen(false);
                } else {
                  setRightPanelTab('chat');
                  setIsChatOpen(true);
                }
              }} 
              className={cn(
                "p-1.5 rounded transition-colors", 
                isChatOpen && rightPanelTab === 'chat' ? "bg-blue-600 text-white" : "bg-[#333333] text-[#858585] hover:bg-[#444444]"
              )}
              title="AI Chat"
            >
              <Bot className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar - Explorer */}
        <aside 
          style={{ width: windowWidth < 768 ? '85%' : sidebarWidth }}
          className={cn(
            "border-r border-[#333333] flex flex-col bg-[#252526] z-40 shadow-2xl md:shadow-none flex-shrink-0",
            "md:relative md:translate-x-0 absolute inset-y-0 left-0",
            windowWidth < 768 && "transition-transform duration-300",
            windowWidth < 768 && (isSidebarOpen ? "translate-x-0" : "-translate-x-full")
          )}
        >
          <div className="flex border-b border-[#333333] items-center">
            <button onClick={() => setActiveTab('files')} className={cn("flex-1 py-2 text-xs font-medium uppercase", activeTab === 'files' ? "bg-[#1e1e1e] text-white border-b-2 border-blue-500" : "text-[#858585]")}>
              Files
            </button>
            <button onClick={() => setActiveTab('git')} className={cn("flex-1 py-2 text-xs font-medium uppercase", activeTab === 'git' ? "bg-[#1e1e1e] text-white border-b-2 border-blue-500" : "text-[#858585]")}>
              History
            </button>
            {/* Mobile Overlay Close */}
            <div className="md:hidden px-2">
              <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-[#333333] rounded text-[#858585]"><X className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {activeTab === 'files' ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between px-2 py-1 mb-2">
                  <span className="text-[11px] font-bold text-[#858585] uppercase">Explorer</span>
                  <div className="flex gap-1">
                    <label className="p-1 hover:bg-[#37373d] rounded cursor-pointer" title="Upload Files">
                      <Upload className="w-3.5 h-3.5 text-[#858585]" />
                      <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                    </label>
                    <button onClick={() => setCreatingIn({ path: '/', type: 'file' })} className="p-1 hover:bg-[#37373d] rounded" title="New File"><FilePlus className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setCreatingIn({ path: '/', type: 'folder' })} className="p-1 hover:bg-[#37373d] rounded" title="New Folder"><FolderPlus className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <FileTree 
                  nodes={files} 
                  selectedFile={selectedFile} 
                  onSelect={handleSelectFile} 
                  onDelete={handleDelete}
                  onCreateFile={handleCreateFile}
                  onCreateFolder={handleCreateFolder}
                  onRename={handleRename}
                  onMove={handleMove}
                  onDownloadFile={handleDownloadFile}
                  onUpload={handleFileUpload}
                  creatingIn={creatingIn}
                  setCreatingIn={setCreatingIn}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="px-2 py-1">
                  <button onClick={() => setIsCommiting(true)} className="w-full py-1.5 bg-blue-600 text-white rounded text-xs font-medium">New Commit</button>
                </div>
                {isCommiting && (
                  <div className="px-2 space-y-2">
                    <textarea value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} placeholder="Message..." className="w-full bg-[#3c3c3c] border border-[#333333] rounded p-2 text-xs" />
                    <div className="flex gap-2">
                      <button onClick={handleCommit} className="flex-1 py-1 bg-green-600 text-white rounded text-[11px]">Commit</button>
                      <button onClick={() => setIsCommiting(false)} className="flex-1 py-1 bg-[#333333] text-white rounded text-[11px]">Cancel</button>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {commits.map(c => (
                    <div key={c.oid} className="px-2 py-2 bg-[#2a2d2e] rounded border border-[#333333] group">
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-blue-400">{c.oid.substring(0, 7)}</span>
                        <span className="text-[#858585]">{format(c.timestamp, 'MMM d, HH:mm')}</span>
                      </div>
                      <p className="text-xs text-white font-medium line-clamp-2">{c.message}</p>
                      <button onClick={() => handleCheckout(c.oid)} className="w-full mt-2 py-1 bg-[#333333] rounded text-[10px] opacity-0 group-hover:opacity-100">Checkout</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Resize Handle Left */}
        <div 
          onMouseDown={() => setIsResizingSidebar(true)}
          className="hidden md:block w-1 hover:w-1.5 bg-transparent hover:bg-blue-500/50 cursor-col-resize transition-all z-30"
        />

        {/* Editor */}
        <section className="flex-1 flex flex-col bg-[#1e1e1e] min-w-0">
          {/* Tab Bar */}
          {openFiles.length > 0 && (
            <div className="flex bg-[#252526] border-b border-[#333333] overflow-x-auto scrollbar-hide">
              {openFiles.map(path => {
                const name = path.split('/').pop();
                const isSelected = selectedFile === path;
                const isModified = modifiedFiles[path] !== undefined;
                return (
                  <div 
                    key={path}
                    onClick={() => setSelectedFile(path)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 border-r border-[#333333] cursor-pointer min-w-[120px] max-w-[200px] transition-colors group relative",
                      isSelected ? "bg-[#1e1e1e] text-white" : "hover:bg-[#2a2d2e] text-[#858585]"
                    )}
                  >
                    <FileCode className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" />
                    <span className="text-xs truncate flex-1">{name}</span>
                    {isModified && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    )}
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleCloseTab(path); }}
                      className={cn(
                        "p-0.5 hover:bg-[#333333] rounded opacity-0 group-hover:opacity-100 transition-opacity",
                        isSelected && "opacity-100"
                      )}
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {isSelected && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {selectedFile ? (
            <>
              <div className="h-9 bg-[#252526] flex items-center px-4 border-b border-[#333333] justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[#858585]">{selectedFile}</span>
                </div>
                <button 
                  onClick={handleSaveFile} 
                  disabled={modifiedFiles[selectedFile] === undefined}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded text-[11px] transition-colors",
                    modifiedFiles[selectedFile] !== undefined ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30" : "text-[#858585] opacity-50 cursor-default"
                  )}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>
              <div className="flex-1">
                <Editor 
                  height="100%" 
                  theme="vs-dark" 
                  path={selectedFile} 
                  value={fileContent} 
                  onChange={(v) => handleFileChange(v || '')} 
                  options={{ automaticLayout: true }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[#858585]">
              <Code2 className="w-16 h-16 opacity-20" />
              <p className="text-sm">Select a file to start editing</p>
            </div>
          )}
        </section>

        {/* Right Sidebar - Chat or Preview */}
        {isChatOpen && (
          <>
            {/* Resize Handle Right */}
            <div 
              onMouseDown={() => setIsResizingChat(true)}
              className="hidden md:block w-1 hover:w-1.5 bg-transparent hover:bg-blue-500/50 cursor-col-resize transition-all z-30"
            />
            <aside 
              style={{ width: windowWidth < 768 ? '100%' : chatWidth, minWidth: windowWidth < 768 ? '100%' : '250px' }}
              className={cn(
                "border-l border-[#333333] flex flex-col bg-[#252526] z-40 shadow-2xl md:shadow-none flex-shrink-0",
                "md:relative md:translate-x-0 absolute inset-y-0 right-0",
                windowWidth < 768 && "transition-transform duration-300",
                windowWidth < 768 && (isChatOpen ? "translate-x-0" : "translate-x-full")
              )}
            >
              <div className="h-9 border-b border-[#333333] flex items-center justify-between px-4 bg-[#2d2d2d]">
                <span className="text-[11px] font-bold uppercase text-[#858585]">
                  {rightPanelTab === 'chat' ? 'AI Assistant' : 'Preview'}
                </span>
                <button onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-[#333333] rounded text-[#858585]">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {rightPanelTab === 'chat' ? (
                <>
                  <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((m, i) => (
                      <div key={i} className={cn("flex gap-3", m.role === 'user' ? "flex-row-reverse" : "")}>
                        <div className={cn("max-w-[85%] rounded-lg p-3 text-sm", m.role === 'model' ? "bg-[#2a2d2e] border border-[#333333]" : "bg-blue-600 text-white")}>
                          <p className="whitespace-pre-wrap">{m.text}</p>
                        </div>
                      </div>
                    ))}
                    {isThinking && (
                      <div className="flex gap-3">
                        <div className="bg-[#2a2d2e] border border-[#333333] rounded-lg p-3 text-sm flex gap-1">
                          <span className="w-1.5 h-1.5 bg-[#858585] rounded-full animate-bounce"></span>
                          <span className="w-1.5 h-1.5 bg-[#858585] rounded-full animate-bounce [animation-delay:0.2s]"></span>
                          <span className="w-1.5 h-1.5 bg-[#858585] rounded-full animate-bounce [animation-delay:0.4s]"></span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t border-[#333333] bg-[#1e1e1e]">
                    <textarea 
                      value={input} 
                      onChange={(e) => setInput(e.target.value)} 
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          handleChat();
                        }
                      }}
                      placeholder="Ask me anything... (Ctrl+Enter to send)" 
                      className="w-full bg-[#3c3c3c] border border-[#333333] rounded p-3 text-sm min-h-[80px] text-white outline-none focus:border-blue-500 transition-colors" 
                    />
                    <button onClick={handleChat} disabled={isLoading} className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors">
                      {isLoading ? 'Thinking...' : 'Send'}
                    </button>
                  </div>
                </>
              ) : (
                <PreviewPanel 
                  path={selectedFile} 
                  content={fileContent} 
                />
              )}
            </aside>
          </>
        )}
        {/* Mobile Backdrop */}
        {windowWidth < 768 && (isSidebarOpen || isChatOpen) && (
          <div 
            onClick={() => { setIsSidebarOpen(false); setIsChatOpen(false); }}
            className="absolute inset-0 bg-black/50 z-30 backdrop-blur-[2px]"
          />
        )}
      </main>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#252526] border border-[#333333] rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 border-b border-[#333333] flex items-center justify-between bg-[#2d2d2d]">
              <h3 className="text-sm font-bold text-white">{modal.title}</h3>
              <button onClick={() => setModal(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-[#cccccc]">{modal.message}</p>
              {modal.type === 'prompt' && <input type="text" autoFocus className="w-full bg-[#3c3c3c] border border-[#333333] rounded p-2 text-sm text-white" id="modal-input" />}
            </div>
            <div className="px-4 py-3 bg-[#2d2d2d] border-t border-[#333333] flex justify-end gap-3">
              <button onClick={() => setModal(null)} className="px-4 py-1.5 rounded text-xs bg-[#333333] text-white">Cancel</button>
              <button onClick={() => { const i = document.getElementById('modal-input') as HTMLInputElement; modal.onConfirm(i?.value); setModal(null); }} className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
