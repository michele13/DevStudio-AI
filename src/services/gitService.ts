import * as git from 'isomorphic-git';
import { fs } from 'memfs';
import { CommitInfo } from '../types';

/**
 * Service for interacting with Git (isomorphic-git).
 * This "backend" logic is separated from the UI.
 */
export const gitService = {
  /**
   * Initializes a new Git repository if it doesn't exist or is corrupted.
   */
  init: async (dir: string = '/', force: boolean = false) => {
    const gitDir = (dir === '/' ? '' : dir) + '/.git';
    
    try {
      let needsInit = force;
      if (!needsInit && fs.existsSync(gitDir)) {
        try {
          // Try a simple operation to see if it's corrupted
          // We use a direct call here to avoid recursion with runGit
          console.log('Checking Git repository integrity at', dir);
          await git.log({ fs, dir, depth: 1 });
          console.log('Git repository integrity check passed.');
          needsInit = false;
        } catch (e: any) {
          const errorMsg = e?.message || String(e);
          // If it's just empty (NotFoundError), we don't need to re-init
          if (e?.name === 'NotFoundError' || errorMsg.includes('NotFoundError')) {
            console.log('Git repository is empty but valid.');
            needsInit = false;
          } else {
            console.warn('Existing Git repository corrupted, re-initializing...', e);
            needsInit = true;
          }
        }
      }

      if (needsInit) {
        console.log('Initializing Git repository at', dir, force ? '(forced)' : '');
        if (fs.existsSync(gitDir)) {
          console.log('Deleting existing .git directory...');
          try {
            // Use rmSync if available, otherwise manual fallback
            if (typeof (fs as any).rmSync === 'function') {
              (fs as any).rmSync(gitDir, { recursive: true, force: true });
            } else {
              // Fallback for older memfs
              const deleteRecursive = (path: string) => {
                if (!fs.existsSync(path)) return;
                const entries = fs.readdirSync(path, { withFileTypes: true }) as any[];
                for (const entry of entries) {
                  const fullPath = path + '/' + entry.name;
                  if (entry.isDirectory()) {
                    deleteRecursive(fullPath);
                  } else {
                    fs.unlinkSync(fullPath);
                  }
                }
                fs.rmdirSync(path);
              };
              deleteRecursive(gitDir);
            }
          } catch (deleteError) {
            console.error('Failed to delete .git directory, trying to overwrite...', deleteError);
          }
        }
        await git.init({ fs, dir, defaultBranch: 'main' });
        console.log('Git repository initialized successfully.');
      }
    } catch (e) {
      console.error('Git init error:', e);
      // Last resort: force init
      await git.init({ fs, dir, defaultBranch: 'main' }).catch(() => {});
    }
  },

  /**
   * Helper to run Git commands with automatic corruption recovery.
   */
  runGit: async <T>(dir: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e: any) {
      // Safely extract error message
      let errorMsg = '';
      try {
        errorMsg = e instanceof Error ? e.message : String(e);
      } catch (inner) {
        errorMsg = 'Unknown Git error';
      }

      // Detect corruption or common issues that require re-init
      const isHeadNull = errorMsg.includes('headContent is null');
      
      if (
        errorMsg.includes('incorrect header check') || 
        errorMsg.includes('zlib') || 
        errorMsg.includes('caller') ||
        errorMsg.includes('not an object') ||
        errorMsg.includes('startsWith') || // Catch the error reported by user
        errorMsg.includes('null')
      ) {
        // Only log warning if it's not the expected "headContent is null" during re-init
        if (!isHeadNull) {
          console.warn('Git repository corruption detected. Attempting recovery...', errorMsg);
        }
        await gitService.init(dir, true); // Force re-init
        try {
          return await fn(); // Retry once
        } catch (retryError: any) {
          const retryMsg = retryError?.message || String(retryError);
          // If it's just empty after recovery, that's fine
          if (retryMsg.includes('NotFoundError')) {
            return [] as any;
          }
          if (!isHeadNull) {
            console.error('Git recovery failed:', retryError);
          }
          throw retryError;
        }
      }
      throw e;
    }
  },

  /**
   * Ensures the Git repository is initialized and HEAD is valid.
   */
  ensureInit: async (dir: string = '/') => {
    const gitDir = (dir === '/' ? '' : dir) + '/.git';
    const headPath = `${gitDir}/HEAD`;
    
    try {
      if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
        await gitService.init(dir);
        return;
      }

      if (!fs.existsSync(headPath)) {
        await gitService.init(dir);
      } else {
        const content = fs.readFileSync(headPath, 'utf8');
        // Robust check for content
        if (content === null || content === undefined || (typeof content === 'string' && !content.trim())) {
          await gitService.init(dir);
        }
      }
    } catch (e) {
      console.warn('Error in ensureInit, re-initializing...', e);
      await gitService.init(dir, true);
    }
  },

  /**
   * Stages all changes.
   */
  addAll: async (dir: string = '/') => {
    await gitService.ensureInit(dir);
    await gitService.runGit(dir, () => git.add({ fs, dir, filepath: '.' }));
  },

  /**
   * Commits staged changes.
   */
  commit: async (message: string, author: { name: string, email: string }, dir: string = '/') => {
    await gitService.ensureInit(dir);
    return await gitService.runGit(dir, () => git.commit({
      fs,
      dir,
      author,
      message
    }));
  },

  /**
   * Retrieves the commit history.
   */
  getHistory: async (dir: string = '/'): Promise<CommitInfo[]> => {
    try {
      await gitService.ensureInit(dir);
      const commits = await gitService.runGit(dir, async () => {
        try {
          return await git.log({ fs, dir });
        } catch (e: any) {
          const msg = e?.message || String(e);
          if (msg.includes('NotFoundError')) {
            return [];
          }
          throw e;
        }
      });
      
      return (commits || []).map(c => ({
        oid: c.oid,
        message: c.commit.message,
        author: c.commit.author.name,
        timestamp: c.commit.author.timestamp * 1000
      }));
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (!msg.includes('NotFoundError')) {
        console.error('Git log error:', e);
      }
      return [];
    }
  },

  /**
   * Checks out a specific commit.
   */
  checkout: async (oid: string, dir: string = '/') => {
    await gitService.ensureInit(dir);
    await gitService.runGit(dir, () => git.checkout({ fs, dir, ref: oid, force: true }));
  }
};
