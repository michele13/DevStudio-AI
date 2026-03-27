import React, { useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileCode, Globe, Info, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { fileSystemService } from '../../services/fileSystem';
import { fs } from 'memfs';

interface PreviewPanelProps {
  path: string | null;
  content: string;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({ path, content }) => {
  const isMarkdown = path?.toLowerCase().endsWith('.md');
  const isHtml = path?.toLowerCase().endsWith('.html');
  const isCss = path?.toLowerCase().endsWith('.css');
  const isJs = path?.toLowerCase().endsWith('.js');

  const [refreshKey, setRefreshKey] = useState(0);

  const resolveRelativePath = (basePath: string, relativePath: string) => {
    const baseParts = basePath.split('/').filter(Boolean);
    baseParts.pop(); // remove filename
    const relativeParts = relativePath.split('/').filter(Boolean);
    
    for (const part of relativeParts) {
      if (part === '..') {
        baseParts.pop();
      } else if (part !== '.') {
        baseParts.push(part);
      }
    }
    return '/' + baseParts.join('/');
  };

  const previewUrl = useMemo(() => {
    if (!path) return null;
    
    if (isHtml) {
      let processedContent = content;
      
      // Attempt to inline CSS
      processedContent = processedContent.replace(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
        try {
          const fullPath = resolveRelativePath(path, href);
          if (fs.existsSync(fullPath)) {
            const cssContent = fileSystemService.readFile(fullPath);
            return `<style>${cssContent}</style>`;
          }
        } catch (e) {
          console.error('Error inlining CSS:', e);
        }
        return match;
      });

      // Attempt to inline JS
      processedContent = processedContent.replace(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi, (match, src) => {
        try {
          const fullPath = resolveRelativePath(path, src);
          if (fs.existsSync(fullPath)) {
            const jsContent = fileSystemService.readFile(fullPath);
            return `<script>${jsContent}</script>`;
          }
        } catch (e) {
          console.error('Error inlining JS:', e);
        }
        return match;
      });

      const blob = new Blob([processedContent], { type: 'text/html' });
      return URL.createObjectURL(blob);
    }
    
    return null;
  }, [content, isHtml, path, refreshKey]);

  if (!path) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#858585] p-8 text-center bg-[#1e1e1e]">
        <Info className="w-12 h-12 opacity-20 mb-4" />
        <p className="text-sm font-medium text-[#cccccc]">Select a file to preview</p>
        <p className="text-xs mt-2 opacity-60">Supported: .md, .html</p>
      </div>
    );
  }

  if (isMarkdown) {
    return (
      <div className="flex-1 overflow-y-auto bg-white text-black p-8">
        <div className="markdown-body max-w-none prose prose-sm prose-slate prose-headings:border-b prose-headings:pb-2 prose-hr:my-8">
          <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
        </div>
      </div>
    );
  }

  if (isHtml) {
    return (
      <div className="flex-1 flex flex-col h-full bg-white">
        <div className="h-9 bg-[#f3f3f3] border-b border-[#ddd] flex items-center justify-between px-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <Globe className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            <span className="text-[10px] font-mono text-[#666] truncate">{path}</span>
          </div>
          <button 
            onClick={() => setRefreshKey(k => k + 1)}
            className="p-1.5 hover:bg-[#e5e5e5] rounded text-[#666] transition-colors"
            title="Refresh Preview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <iframe 
          key={refreshKey}
          src={previewUrl || ''} 
          className="flex-1 w-full border-none"
          title="HTML Preview"
          sandbox="allow-scripts allow-forms"
        />
      </div>
    );
  }

  if (isCss || isJs) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#858585] p-8 text-center bg-[#1e1e1e]">
        <FileCode className="w-12 h-12 opacity-20 mb-4 text-blue-400" />
        <p className="text-sm font-medium text-white mb-2">
          {isCss ? 'CSS Stylesheet' : 'JavaScript Source'}
        </p>
        <p className="text-xs max-w-[200px] leading-relaxed">
          To preview this file, open the HTML file that references it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-[#858585] p-8 text-center bg-[#1e1e1e]">
      <FileCode className="w-12 h-12 opacity-20 mb-4" />
      <p className="text-sm font-medium text-white">Preview not available</p>
      <p className="text-xs mt-2 opacity-60">Supported: .md, .html</p>
    </div>
  );
};
