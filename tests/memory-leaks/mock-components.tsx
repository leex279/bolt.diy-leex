/**
 * Mock Components for Memory Leak Testing
 * 
 * These components simulate the problematic behavior identified in the
 * memory leak analysis, as well as their fixed versions for comparison.
 */

import React, { useEffect, useRef, useState } from 'react';

// =======================================
// Terminal Components
// =======================================

interface TerminalProps {
  terminalId: string;
}

/**
 * Buggy Terminal Component - Reproduces process accumulation leak
 * Simulates the issue in app/lib/stores/terminal.ts where processes
 * are stored but never cleaned up properly.
 */
export const TerminalComponent: React.FC<TerminalProps> = ({ terminalId }) => {
  const processesRef = useRef<Array<{ id: string; process: MockProcess }>>([]);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const initializeTerminal = async () => {
      // Simulate creating WebContainer processes without cleanup
      for (let i = 0; i < 3; i++) {
        const mockProcess = new MockProcess(`${terminalId}-process-${i}`);
        processesRef.current.push({
          id: `${terminalId}-process-${i}`,
          process: mockProcess,
        });
        
        // Start the process (simulates shell commands)
        await mockProcess.start();
      }
      
      setIsActive(true);
    };

    initializeTerminal();

    // BUG: No cleanup function - processes remain in memory
    // Missing: return () => { /* cleanup processes */ };
  }, [terminalId]);

  return (
    <div data-testid={`terminal-${terminalId}`} className="terminal-component">
      <div>Terminal {terminalId} {isActive ? '(Active)' : '(Inactive)'}</div>
      <div>Processes: {processesRef.current.length}</div>
    </div>
  );
};

/**
 * Fixed Terminal Component - Properly cleans up processes
 * Shows how the terminal component should handle cleanup.
 */
export const FixedTerminalComponent: React.FC<TerminalProps> = ({ terminalId }) => {
  const processesRef = useRef<Array<{ id: string; process: MockProcess }>>([]);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const initializeTerminal = async () => {
      for (let i = 0; i < 3; i++) {
        const mockProcess = new MockProcess(`${terminalId}-process-${i}`);
        processesRef.current.push({
          id: `${terminalId}-process-${i}`,
          process: mockProcess,
        });
        
        await mockProcess.start();
      }
      
      setIsActive(true);
    };

    initializeTerminal();

    // FIX: Proper cleanup function
    return () => {
      processesRef.current.forEach(({ process }) => {
        process.kill(); // Properly terminate processes
      });
      processesRef.current = [];
      setIsActive(false);
    };
  }, [terminalId]);

  return (
    <div data-testid={`fixed-terminal-${terminalId}`} className="terminal-component">
      <div>Fixed Terminal {terminalId} {isActive ? '(Active)' : '(Inactive)'}</div>
      <div>Processes: {processesRef.current.length}</div>
    </div>
  );
};

// =======================================
// Event Listener Components
// =======================================

interface ComponentProps {
  id: string;
}

/**
 * Buggy Component - Reproduces global event listener leak
 * Simulates the issue in app/lib/hooks/useStickToBottom.tsx where
 * global event listeners are added but never removed.
 */
export const ComponentWithGlobalListeners: React.FC<ComponentProps> = ({ id }) => {
  const [mouseDown, setMouseDown] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  useEffect(() => {
    // BUG: Global event listeners added without cleanup
    // Simulates the problematic code in useStickToBottom.tsx
    const handleMouseDown = () => {
      setMouseDown(true);
    };

    const handleMouseUp = () => {
      setMouseDown(false);
    };

    const handleClick = () => {
      setClickCount(prev => prev + 1);
    };

    // Add global listeners (this is the bug - they accumulate)
    globalThis.document?.addEventListener('mousedown', handleMouseDown);
    globalThis.document?.addEventListener('mouseup', handleMouseUp);
    globalThis.document?.addEventListener('click', handleClick);

    // BUG: No cleanup - listeners accumulate with each component mount
    // Missing cleanup function
  }, [id]);

  return (
    <div data-testid={`component-${id}`} className="component-with-listeners">
      <div>Component {id}</div>
      <div>Mouse Down: {mouseDown ? 'Yes' : 'No'}</div>
      <div>Clicks: {clickCount}</div>
    </div>
  );
};

/**
 * Fixed Component - Properly removes global event listeners
 * Shows how event listeners should be managed with cleanup.
 */
export const FixedComponentWithGlobalListeners: React.FC<ComponentProps> = ({ id }) => {
  const [mouseDown, setMouseDown] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  useEffect(() => {
    const handleMouseDown = () => {
      setMouseDown(true);
    };

    const handleMouseUp = () => {
      setMouseDown(false);
    };

    const handleClick = () => {
      setClickCount(prev => prev + 1);
    };

    // Add event listeners
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleClick);

    // FIX: Proper cleanup function that removes listeners
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('click', handleClick);
    };
  }, [id]);

  return (
    <div data-testid={`fixed-component-${id}`} className="component-with-listeners">
      <div>Fixed Component {id}</div>
      <div>Mouse Down: {mouseDown ? 'Yes' : 'No'}</div>
      <div>Clicks: {clickCount}</div>
    </div>
  );
};

// =======================================
// File Watcher Components
// =======================================

/**
 * Buggy File Watcher Component - Reproduces watcher accumulation
 * Simulates the issue where file watchers are created but not disposed.
 */
export const FileWatcherComponent: React.FC<{ filePath: string }> = ({ filePath }) => {
  const watcherRef = useRef<MockFileWatcher | null>(null);
  const [changes, setChanges] = useState(0);

  useEffect(() => {
    // BUG: Create watcher without cleanup
    watcherRef.current = new MockFileWatcher(filePath, () => {
      setChanges(prev => prev + 1);
    });
    
    watcherRef.current.start();

    // BUG: No cleanup - watchers accumulate
    // Missing: return () => { watcherRef.current?.dispose(); };
  }, [filePath]);

  return (
    <div data-testid={`file-watcher-${filePath}`}>
      <div>Watching: {filePath}</div>
      <div>Changes: {changes}</div>
    </div>
  );
};

/**
 * Fixed File Watcher Component - Properly disposes watchers
 */
export const FixedFileWatcherComponent: React.FC<{ filePath: string }> = ({ filePath }) => {
  const watcherRef = useRef<MockFileWatcher | null>(null);
  const [changes, setChanges] = useState(0);

  useEffect(() => {
    watcherRef.current = new MockFileWatcher(filePath, () => {
      setChanges(prev => prev + 1);
    });
    
    watcherRef.current.start();

    // FIX: Proper cleanup
    return () => {
      watcherRef.current?.dispose();
      watcherRef.current = null;
    };
  }, [filePath]);

  return (
    <div data-testid={`fixed-file-watcher-${filePath}`}>
      <div>Fixed Watching: {filePath}</div>
      <div>Changes: {changes}</div>
    </div>
  );
};

// =======================================
// Stream Reader Components
// =======================================

/**
 * Buggy Stream Reader Component - Reproduces stream reader leak
 * Simulates background stream readers that run indefinitely.
 */
export const StreamReaderComponent: React.FC<{ streamId: string }> = ({ streamId }) => {
  const readerRef = useRef<MockStreamReader | null>(null);
  const [data, setData] = useState<string>('');

  useEffect(() => {
    // BUG: Create stream reader that runs indefinitely
    readerRef.current = new MockStreamReader(streamId, (chunk) => {
      setData(prev => prev + chunk);
    });
    
    readerRef.current.startReading();

    // BUG: No cleanup - readers continue running
    // Missing: return () => { readerRef.current?.stop(); };
  }, [streamId]);

  return (
    <div data-testid={`stream-reader-${streamId}`}>
      <div>Stream: {streamId}</div>
      <div>Data Length: {data.length}</div>
    </div>
  );
};

/**
 * Fixed Stream Reader Component - Properly stops readers
 */
export const FixedStreamReaderComponent: React.FC<{ streamId: string }> = ({ streamId }) => {
  const readerRef = useRef<MockStreamReader | null>(null);
  const [data, setData] = useState<string>('');

  useEffect(() => {
    readerRef.current = new MockStreamReader(streamId, (chunk) => {
      setData(prev => prev + chunk);
    });
    
    readerRef.current.startReading();

    // FIX: Proper cleanup
    return () => {
      readerRef.current?.stop();
      readerRef.current = null;
    };
  }, [streamId]);

  return (
    <div data-testid={`fixed-stream-reader-${streamId}`}>
      <div>Fixed Stream: {streamId}</div>
      <div>Data Length: {data.length}</div>
    </div>
  );
};

// =======================================
// Interval/Timeout Components
// =======================================

/**
 * Buggy Interval Component - Reproduces uncleaned intervals
 * Simulates intervals that are created but never cleared.
 */
export const IntervalComponent: React.FC<{ intervalId: string }> = ({ intervalId }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // BUG: Create interval without cleanup
    const interval = setInterval(() => {
      setCount(prev => prev + 1);
    }, 100);

    // BUG: Interval reference lost, can't be cleaned up
    // Missing: return () => clearInterval(interval);
  }, [intervalId]);

  return (
    <div data-testid={`interval-${intervalId}`}>
      <div>Interval {intervalId}</div>
      <div>Count: {count}</div>
    </div>
  );
};

/**
 * Fixed Interval Component - Properly clears intervals
 */
export const FixedIntervalComponent: React.FC<{ intervalId: string }> = ({ intervalId }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCount(prev => prev + 1);
    }, 100);

    // FIX: Proper cleanup
    return () => {
      clearInterval(interval);
    };
  }, [intervalId]);

  return (
    <div data-testid={`fixed-interval-${intervalId}`}>
      <div>Fixed Interval {intervalId}</div>
      <div>Count: {count}</div>
    </div>
  );
};

// =======================================
// Mock Classes for Testing
// =======================================

/**
 * Mock WebContainer Process
 * Simulates the behavior of a WebContainer process for testing.
 */
class MockProcess {
  private isRunning = false;
  private memoryUsage = Math.random() * 50 * 1024 * 1024; // Random 0-50MB
  private intervalId?: NodeJS.Timeout;

  constructor(public id: string) {}

  async start(): Promise<void> {
    this.isRunning = true;
    
    // Simulate ongoing process activity that consumes memory
    this.intervalId = setInterval(() => {
      this.memoryUsage += Math.random() * 1024 * 1024; // Grow by 0-1MB per tick
    }, 1000);
    
    // Track globally for testing
    if (typeof window !== 'undefined') {
      (window as any).__activeProcesses = (window as any).__activeProcesses || [];
      (window as any).__activeProcesses.push(this);
    }
  }

  kill(): void {
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    
    // Remove from global tracking
    if (typeof window !== 'undefined' && (window as any).__activeProcesses) {
      const index = (window as any).__activeProcesses.indexOf(this);
      if (index >= 0) {
        (window as any).__activeProcesses.splice(index, 1);
      }
    }
  }

  getMemoryUsage(): number {
    return this.memoryUsage;
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

/**
 * Mock File Watcher
 * Simulates file watching behavior for testing.
 */
class MockFileWatcher {
  private isWatching = false;
  private intervalId?: NodeJS.Timeout;

  constructor(
    private filePath: string,
    private callback: () => void
  ) {}

  start(): void {
    this.isWatching = true;
    
    // Simulate file change detection
    this.intervalId = setInterval(() => {
      if (Math.random() > 0.8) { // 20% chance of "change"
        this.callback();
      }
    }, 500);
    
    // Track globally for testing
    if (typeof window !== 'undefined') {
      (window as any).__activeFileWatchers = (window as any).__activeFileWatchers || [];
      (window as any).__activeFileWatchers.push(this);
    }
  }

  dispose(): void {
    this.isWatching = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    
    // Remove from global tracking
    if (typeof window !== 'undefined' && (window as any).__activeFileWatchers) {
      const index = (window as any).__activeFileWatchers.indexOf(this);
      if (index >= 0) {
        (window as any).__activeFileWatchers.splice(index, 1);
      }
    }
  }

  isActive(): boolean {
    return this.isWatching;
  }
}

/**
 * Mock Stream Reader
 * Simulates background stream reading behavior.
 */
class MockStreamReader {
  private isReading = false;
  private intervalId?: NodeJS.Timeout;

  constructor(
    private streamId: string,
    private onData: (chunk: string) => void
  ) {}

  startReading(): void {
    this.isReading = true;
    
    // Simulate continuous stream reading
    this.intervalId = setInterval(() => {
      const chunk = `data-${Date.now()}-${Math.random()}\n`;
      this.onData(chunk);
    }, 200);
    
    // Track globally for testing
    if (typeof window !== 'undefined') {
      (window as any).__activeStreamReaders = (window as any).__activeStreamReaders || [];
      (window as any).__activeStreamReaders.push(this);
    }
  }

  stop(): void {
    this.isReading = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    
    // Remove from global tracking
    if (typeof window !== 'undefined' && (window as any).__activeStreamReaders) {
      const index = (window as any).__activeStreamReaders.indexOf(this);
      if (index >= 0) {
        (window as any).__activeStreamReaders.splice(index, 1);
      }
    }
  }

  isActive(): boolean {
    return this.isReading;
  }
}

// =======================================
// Test Cleanup Utilities
// =======================================

/**
 * Global cleanup function for tests
 */
if (typeof window !== 'undefined') {
  (window as any).__testCleanup = () => {
    // Clean up all mock objects
    const activeProcesses = (window as any).__activeProcesses || [];
    activeProcesses.forEach((process: MockProcess) => process.kill());
    (window as any).__activeProcesses = [];

    const activeWatchers = (window as any).__activeFileWatchers || [];
    activeWatchers.forEach((watcher: MockFileWatcher) => watcher.dispose());
    (window as any).__activeFileWatchers = [];

    const activeReaders = (window as any).__activeStreamReaders || [];
    activeReaders.forEach((reader: MockStreamReader) => reader.stop());
    (window as any).__activeStreamReaders = [];
  };
}

// Export mock classes for direct use in tests
export { MockProcess, MockFileWatcher, MockStreamReader };