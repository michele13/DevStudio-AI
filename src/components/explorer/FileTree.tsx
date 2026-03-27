import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FileCode, 
  FilePlus, 
  FolderPlus, 
  Trash2, 
  Download,
  Pencil,
  Check,
  X 
} from 'lucide-react';
import { FileNode } from '../../types';
import { cn } from '../../lib/utils';

interface FileTreeProps {
  nodes: FileNode[];
  selectedFile: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  onCreateFile: (parentPath: string, name: string) => void;
  onCreateFolder: (parentPath: string, name: string) => void;
  onRename: (oldPath: string, newName: string) => void;
  onMove: (oldPath: string, newParentPath: string) => void;
  onDownloadFile: (path: string, name: string) => void;
  onUpload: (files: FileList, targetPath: string) => void;
  creatingIn: { path: string, type: 'file' | 'folder' } | null;
  setCreatingIn: (val: { path: string, type: 'file' | 'folder' } | null) => void;
  level?: number;
}

/**
 * FileTree component that handles:
 * - Recursive rendering of file structure.
 * - Drag and Drop (native HTML5).
 * - Inline renaming.
 * - Inline creation of files/folders.
 */
export const FileTree: React.FC<FileTreeProps> = ({ 
  nodes, 
  selectedFile, 
  onSelect, 
  onDelete,
  onCreateFile,
  onCreateFolder,
  onRename,
  onMove,
  onDownloadFile,
  onUpload,
  creatingIn,
  setCreatingIn,
  level = 0 
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [creatingValue, setCreatingValue] = useState('');
  
  // Drag and Drop state
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  const toggle = (path: string) => {
    setExpanded(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleStartRename = (node: FileNode) => {
    setEditingPath(node.path);
    setEditingValue(node.name);
  };

  const handleConfirmRename = () => {
    if (editingPath && editingValue.trim() && editingValue !== editingPath.split('/').pop()) {
      onRename(editingPath, editingValue.trim());
    }
    setEditingPath(null);
  };

  const handleStartCreate = (parentPath: string, type: 'file' | 'folder') => {
    setCreatingIn({ path: parentPath, type });
    setCreatingValue('');
    setExpanded(prev => ({ ...prev, [parentPath]: true }));
  };

  const handleConfirmCreate = () => {
    if (creatingIn && creatingValue.trim()) {
      if (creatingIn.type === 'file') {
        onCreateFile(creatingIn.path, creatingValue.trim());
      } else {
        onCreateFolder(creatingIn.path, creatingValue.trim());
      }
    }
    setCreatingIn(null);
    setCreatingValue(''); // Clear name after creation
  };

  // DnD Handlers
  const onDragStart = (e: React.DragEvent, path: string) => {
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, path: string, type: 'file' | 'folder') => {
    e.preventDefault();
    if (type === 'folder') {
      setDragOverPath(path);
    } else {
      // If dragging over a file, the target is the parent folder
      const parent = path.substring(0, path.lastIndexOf('/')) || '/';
      setDragOverPath(parent);
    }
  };

  const onDrop = (e: React.DragEvent, targetPath: string, targetType: 'file' | 'folder') => {
    e.preventDefault();
    setDragOverPath(null);

    // Handle external files
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      let finalTargetPath = targetType === 'folder' ? targetPath : targetPath.substring(0, targetPath.lastIndexOf('/')) || '/';
      onUpload(e.dataTransfer.files, finalTargetPath);
      return;
    }

    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath) return;
    
    // Determine the actual target folder
    let finalTargetPath = targetType === 'folder' ? targetPath : targetPath.substring(0, targetPath.lastIndexOf('/')) || '/';
    
    if (sourcePath === finalTargetPath) return;
    if (finalTargetPath.startsWith(sourcePath + '/')) return; // Prevent moving folder into itself

    onMove(sourcePath, finalTargetPath);
  };

  return (
    <div className="space-y-0.5 select-none">
      {/* Inline Creation Input (at the top level if applicable) */}
      {creatingIn?.path === '/' && level === 0 && (
        <div 
          className="flex items-center py-1 px-2 gap-2 bg-[#2a2d2e] rounded"
          style={{ paddingLeft: `${8}px` }}
        >
          {creatingIn.type === 'folder' ? <Folder className="w-4 h-4 text-blue-400/80" /> : <FileCode className="w-4 h-4 text-blue-400/80" />}
          <input 
            autoFocus
            className="flex-1 bg-[#3c3c3c] border border-blue-500 rounded px-1 text-xs text-white outline-none"
            value={creatingValue}
            onChange={(e) => setCreatingValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmCreate();
              if (e.key === 'Escape') setCreatingIn(null);
            }}
            onBlur={handleConfirmCreate}
          />
        </div>
      )}

      {nodes.map(node => {
        const isEditing = editingPath === node.path;
        const isDragOver = dragOverPath === node.path;

        return (
          <div key={node.path}>
            <div 
              draggable={!isEditing}
              onDragStart={(e) => onDragStart(e, node.path)}
              onDragOver={(e) => onDragOver(e, node.path, node.type)}
              onDragLeave={() => setDragOverPath(null)}
              onDrop={(e) => onDrop(e, node.path, node.type)}
              className={cn(
                "group flex items-center py-1 px-2 rounded cursor-pointer text-xs transition-all relative",
                selectedFile === node.path ? "bg-[#37373d] text-white" : "hover:bg-[#2a2d2e] text-[#cccccc]",
                isDragOver && node.type === 'folder' && "bg-blue-600/20 ring-1 ring-blue-500/50"
              )}
              style={{ paddingLeft: `${level * 12 + 8}px` }}
              onClick={() => node.type === 'folder' ? toggle(node.path) : onSelect(node.path)}
            >
              <div className="flex items-center flex-1 min-w-0 gap-1.5">
                {node.type === 'folder' ? (
                  expanded[node.path] ? <ChevronDown className="w-3.5 h-3.5 text-[#858585]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#858585]" />
                ) : (
                  <div className="w-3.5" />
                )}
                {node.type === 'folder' ? <Folder className="w-4 h-4 text-blue-400/80" /> : <FileCode className="w-4 h-4 text-blue-400/80" />}
                
                {isEditing ? (
                  <input 
                    autoFocus
                    className="flex-1 bg-[#3c3c3c] border border-blue-500 rounded px-1 text-xs text-white outline-none"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmRename();
                      if (e.key === 'Escape') setEditingPath(null);
                    }}
                    onBlur={handleConfirmRename}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="truncate">{node.name}</span>
                )}
              </div>

              {!isEditing && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {node.type === 'folder' ? (
                    <>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleStartCreate(node.path, 'file'); }} 
                        className="p-1 hover:bg-[#444444] rounded"
                        title="New File"
                      >
                        <FilePlus className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleStartCreate(node.path, 'folder'); }} 
                        className="p-1 hover:bg-[#444444] rounded"
                        title="New Folder"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDownloadFile(node.path, node.name); }} 
                      className="p-1 hover:bg-[#444444] rounded"
                      title="Download File"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleStartRename(node); }} 
                    className="p-1 hover:bg-[#444444] rounded text-blue-400"
                    title="Rename"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(node.path); }} 
                    className="p-1 hover:bg-[#444444] rounded text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Inline Creation Input (inside folder) */}
            {creatingIn?.path === node.path && node.type === 'folder' && expanded[node.path] && (
              <div 
                className="flex items-center py-1 px-2 gap-2 bg-[#2a2d2e] rounded"
                style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
              >
                {creatingIn.type === 'folder' ? <Folder className="w-4 h-4 text-blue-400/80" /> : <FileCode className="w-4 h-4 text-blue-400/80" />}
                <input 
                  autoFocus
                  className="flex-1 bg-[#3c3c3c] border border-blue-500 rounded px-1 text-xs text-white outline-none"
                  value={creatingValue}
                  onChange={(e) => setCreatingValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmCreate();
                    if (e.key === 'Escape') setCreatingIn(null);
                  }}
                  onBlur={handleConfirmCreate}
                />
              </div>
            )}

            {node.type === 'folder' && expanded[node.path] && node.children && (
              <FileTree 
                nodes={node.children} 
                selectedFile={selectedFile} 
                onSelect={onSelect} 
                onDelete={onDelete}
                onCreateFile={onCreateFile}
                onCreateFolder={onCreateFolder}
                onRename={onRename}
                onMove={onMove}
                onDownloadFile={onDownloadFile}
                onUpload={onUpload}
                creatingIn={creatingIn}
                setCreatingIn={setCreatingIn}
                level={level + 1} 
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
