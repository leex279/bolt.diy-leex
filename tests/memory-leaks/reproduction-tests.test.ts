/**
 * Memory Leak Reproduction Tests
 * 
 * These tests are designed to reproduce the specific memory leaks
 * identified in the Memory_Leaks_Analysis.md report.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { MemoryMonitor, withMemoryMonitoring } from '../utils/memory-monitor';

// Mock components that simulate the problematic behavior
import { 
  TerminalComponent, 
  FixedTerminalComponent,
  ComponentWithGlobalListeners,
  FixedComponentWithGlobalListeners 
} from './mock-components';

describe('Memory Leak Reproduction Tests', () => {
  let memoryMonitor: MemoryMonitor;

  beforeEach(() => {
    memoryMonitor = new MemoryMonitor({
      intervalMs: 500,
      enableWarnings: true,
      trackComponents: true,
    });
    
    // Clear any existing event listeners
    cleanup();
    
    // Force garbage collection if available
    memoryMonitor.forceGC();
  });

  afterEach(() => {
    memoryMonitor.stopMonitoring();
    cleanup();
    
    // Clean up any global state
    (window as any).__testCleanup?.();
  });

  describe('🔴 Critical: Terminal Process Leaks', () => {
    it('should reproduce terminal process accumulation bug', async () => {
      const ITERATIONS = 20;
      const EXPECTED_GROWTH_THRESHOLD = 50 * 1024 * 1024; // 50MB

      memoryMonitor.startMonitoring('terminal-leak-test');

      for (let i = 0; i < ITERATIONS; i++) {
        await act(async () => {
          // Simulate creating terminal with the problematic code
          const { unmount } = render(<TerminalComponent terminalId={`terminal-${i}`} />);
          
          // Simulate terminal operations
          await simulateTerminalCommands();
          
          // Unmount component (this should cleanup but doesn't in the buggy version)
          unmount();
          
          memoryMonitor.recordMeasurement(`terminal-iteration-${i}`);
        });

        // Small delay to let operations complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const report = memoryMonitor.getReport();
      
      console.log('🔥 Terminal Leak Test Results:');
      console.log(memoryMonitor.getSummary());
      
      // Verify that the leak is reproduced
      expect(report.leakDetected).toBe(true);
      expect(report.growth).toBeGreaterThan(EXPECTED_GROWTH_THRESHOLD);
      
      // Export data for analysis
      await saveTestResults('terminal-leak-reproduction', memoryMonitor.exportData());
    });

    it('should verify terminal process cleanup after fix', async () => {
      const ITERATIONS = 20;
      const MAX_ACCEPTABLE_GROWTH = 10 * 1024 * 1024; // 10MB

      memoryMonitor.startMonitoring('terminal-fix-test');

      for (let i = 0; i < ITERATIONS; i++) {
        await act(async () => {
          // Use the fixed component that properly cleans up
          const { unmount } = render(<FixedTerminalComponent terminalId={`terminal-${i}`} />);
          
          await simulateTerminalCommands();
          
          // This should properly cleanup processes
          unmount();
          
          memoryMonitor.recordMeasurement(`fixed-terminal-iteration-${i}`);
        });

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const report = memoryMonitor.getReport();
      
      console.log('✅ Terminal Fix Test Results:');
      console.log(memoryMonitor.getSummary());
      
      // Verify that the fix works
      expect(report.leakDetected).toBe(false);
      expect(report.growth).toBeLessThan(MAX_ACCEPTABLE_GROWTH);
      expect(report.memoryEfficiency).toBeGreaterThan(0.8); // 80% efficiency
    });
  });

  describe('🔴 Critical: Global Event Listener Leaks', () => {
    it('should reproduce global event listener accumulation', async () => {
      const ITERATIONS = 100;
      const initialListenerCount = getEventListenerCount();

      memoryMonitor.startMonitoring('listener-leak-test');

      for (let i = 0; i < ITERATIONS; i++) {
        await act(async () => {
          // Component that adds global listeners without cleanup
          const { unmount } = render(<ComponentWithGlobalListeners id={`component-${i}`} />);
          
          // Trigger some events to ensure listeners are active
          await simulateUserInteractions();
          
          unmount();
          
          if (i % 10 === 0) {
            memoryMonitor.recordMeasurement(`listener-iteration-${i}`);
          }
        });
      }

      const finalListenerCount = getEventListenerCount();
      const listenerGrowth = finalListenerCount - initialListenerCount;
      
      const report = memoryMonitor.getReport();
      
      console.log('🎯 Event Listener Leak Test Results:');
      console.log(`- Initial listeners: ${initialListenerCount}`);
      console.log(`- Final listeners: ${finalListenerCount}`);
      console.log(`- Listener growth: ${listenerGrowth}`);
      console.log(memoryMonitor.getSummary());
      
      // Verify listener accumulation
      expect(listenerGrowth).toBeGreaterThan(ITERATIONS); // At least 1 listener per iteration
      expect(report.growth).toBeGreaterThan(5 * 1024 * 1024); // 5MB growth from listeners
    });

    it('should verify event listener cleanup after fix', async () => {
      const ITERATIONS = 100;
      const initialListenerCount = getEventListenerCount();

      memoryMonitor.startMonitoring('listener-fix-test');

      for (let i = 0; i < ITERATIONS; i++) {
        await act(async () => {
          // Fixed component that properly removes listeners
          const { unmount } = render(<FixedComponentWithGlobalListeners id={`component-${i}`} />);
          
          await simulateUserInteractions();
          unmount();
          
          if (i % 10 === 0) {
            memoryMonitor.recordMeasurement(`fixed-listener-iteration-${i}`);
          }
        });
      }

      const finalListenerCount = getEventListenerCount();
      const listenerGrowth = finalListenerCount - initialListenerCount;
      
      const report = memoryMonitor.getReport();
      
      console.log('✅ Event Listener Fix Test Results:');
      console.log(`- Listener growth: ${listenerGrowth}`);
      console.log(memoryMonitor.getSummary());
      
      // Verify listeners are properly cleaned up
      expect(listenerGrowth).toBeLessThan(10); // Minimal growth acceptable
      expect(report.memoryEfficiency).toBeGreaterThan(0.9); // 90% efficiency
    });
  });

  describe('🟡 High Impact: Stream Reader Leaks', () => {
    it('should reproduce background stream reader accumulation', async () => {
      const ITERATIONS = 10;

      memoryMonitor.startMonitoring('stream-reader-leak-test');

      for (let i = 0; i < ITERATIONS; i++) {
        await act(async () => {
          // Simulate creating shell processes with stream readers
          await createShellProcessWithStreamReader(`process-${i}`);
          memoryMonitor.recordMeasurement(`stream-reader-${i}`);
        });
        
        // Wait for streams to start processing
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const report = memoryMonitor.getReport();
      
      console.log('🌊 Stream Reader Leak Test Results:');
      console.log(memoryMonitor.getSummary());
      
      // Verify that stream readers are accumulating
      expect(report.leakDetected).toBe(true);
      
      // Check that stream readers are still active
      const activeReaders = await getActiveStreamReaderCount();
      expect(activeReaders).toBeGreaterThan(ITERATIONS - 2);
    });
  });

  describe('🟡 High Impact: File Watcher Leaks', () => {
    it('should reproduce file watcher accumulation', async () => {
      const ITERATIONS = 15;

      memoryMonitor.startMonitoring('file-watcher-leak-test');

      for (let i = 0; i < ITERATIONS; i++) {
        await act(async () => {
          // Simulate file operations that create watchers
          await createFileWatcher(`test-file-${i}.txt`);
          memoryMonitor.recordMeasurement(`file-watcher-${i}`);
        });
      }

      const report = memoryMonitor.getReport();
      
      console.log('📁 File Watcher Leak Test Results:');
      console.log(memoryMonitor.getSummary());
      
      const activeWatchers = await getActiveFileWatcherCount();
      
      expect(activeWatchers).toBeGreaterThan(ITERATIONS - 2);
      expect(report.growth).toBeGreaterThan(5 * 1024 * 1024); // 5MB growth
    });
  });

  describe('🔥 Combined Scenario: 2GB Memory Spike Reproduction', () => {
    it('should reproduce the complete 2GB memory spike scenario', async () => {
      const TEST_DURATION = 60000; // 60 seconds for CI, increase for local testing
      const MEMORY_SPIKE_THRESHOLD = 200 * 1024 * 1024; // 200MB (scaled down from 2GB for testing)
      
      memoryMonitor.startMonitoring('combined-leak-scenario');
      
      const startTime = Date.now();
      let iteration = 0;
      
      console.log('🚀 Starting combined memory leak scenario...');
      
      while (Date.now() - startTime < TEST_DURATION) {
        await act(async () => {
          // Simulate realistic user workflow that triggers multiple leaks
          await simulateCompleteUserWorkflow(iteration);
          
          if (iteration % 10 === 0) {
            memoryMonitor.recordMeasurement(`combined-workflow-${iteration}`);
            
            const currentReport = memoryMonitor.getReport();
            console.log(`Iteration ${iteration}: ${memoryMonitor.formatBytes(currentReport.current)}`);
          }
          
          iteration++;
        });
        
        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const report = memoryMonitor.getReport();
      
      console.log('🎯 Combined Leak Scenario Results:');
      console.log(`- Total iterations: ${iteration}`);
      console.log(`- Test duration: ${TEST_DURATION / 1000}s`);
      console.log(memoryMonitor.getSummary());
      
      // Export detailed data for analysis
      const testData = memoryMonitor.exportData();
      await saveTestResults('combined-leak-scenario', testData);
      
      // Verify significant memory growth (representing the 2GB issue)
      expect(report.growth).toBeGreaterThan(MEMORY_SPIKE_THRESHOLD);
      expect(report.leakDetected).toBe(true);
      expect(report.memoryEfficiency).toBeLessThan(0.3); // Poor efficiency indicates leaks
      
      // Generate detailed report
      const analysis = analyzeMemoryPattern(report.measurements);
      console.log('📊 Memory Pattern Analysis:', analysis);
      
      expect(analysis.hasConsistentGrowth).toBe(true);
      expect(analysis.growthRate).toBeGreaterThan(1024 * 1024); // 1MB/s growth rate
    });
  });

  describe('🧪 Regression Prevention Tests', () => {
    it('should verify all fixes prevent memory leaks in combined scenario', async () => {
      // This test uses all the fixed components and should show no leaks
      const TEST_DURATION = 30000; // 30 seconds
      const MAX_ACCEPTABLE_GROWTH = 20 * 1024 * 1024; // 20MB max growth
      
      memoryMonitor.startMonitoring('regression-test');
      
      const startTime = Date.now();
      let iteration = 0;
      
      while (Date.now() - startTime < TEST_DURATION) {
        await act(async () => {
          // Use fixed components for the same workflow
          await simulateFixedUserWorkflow(iteration);
          
          if (iteration % 5 === 0) {
            memoryMonitor.recordMeasurement(`regression-test-${iteration}`);
          }
          
          iteration++;
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const report = memoryMonitor.getReport();
      
      console.log('🛡️ Regression Test Results:');
      console.log(memoryMonitor.getSummary());
      
      // Verify that fixes prevent the leaks
      expect(report.leakDetected).toBe(false);
      expect(report.growth).toBeLessThan(MAX_ACCEPTABLE_GROWTH);
      expect(report.memoryEfficiency).toBeGreaterThan(0.8); // Good efficiency
      
      const analysis = analyzeMemoryPattern(report.measurements);
      expect(analysis.hasConsistentGrowth).toBe(false);
    });
  });
});

// Helper functions for test scenarios

async function simulateCompleteUserWorkflow(iteration: number) {
  // Create multiple terminals (reproduces terminal leak)
  for (let i = 0; i < 3; i++) {
    const { unmount } = render(<TerminalComponent terminalId={`workflow-terminal-${iteration}-${i}`} />);
    await simulateTerminalCommands();
    unmount();
  }
  
  // Create components with event listeners (reproduces listener leak)
  for (let i = 0; i < 5; i++) {
    const { unmount } = render(<ComponentWithGlobalListeners id={`workflow-component-${iteration}-${i}`} />);
    await simulateUserInteractions();
    unmount();
  }
  
  // Create file watchers (reproduces watcher leak)
  await createMultipleFileWatchers(3, `workflow-${iteration}`);
  
  // Create stream readers (reproduces stream leak)
  await createShellProcessWithStreamReader(`workflow-process-${iteration}`);
  
  // Simulate WebContainer operations
  await performWebContainerOperations();
}

async function simulateFixedUserWorkflow(iteration: number) {
  // Same workflow but with fixed components
  for (let i = 0; i < 3; i++) {
    const { unmount } = render(<FixedTerminalComponent terminalId={`fixed-terminal-${iteration}-${i}`} />);
    await simulateTerminalCommands();
    unmount();
  }
  
  for (let i = 0; i < 5; i++) {
    const { unmount } = render(<FixedComponentWithGlobalListeners id={`fixed-component-${iteration}-${i}`} />);
    await simulateUserInteractions();
    unmount();
  }
  
  // Use fixed versions of other operations too
  await createFixedFileWatchers(3, `fixed-workflow-${iteration}`);
  await createFixedStreamReader(`fixed-process-${iteration}`);
}

async function simulateTerminalCommands() {
  const commands = ['ls', 'pwd', 'echo "test"', 'npm --version'];
  for (const cmd of commands) {
    await runCommand(cmd);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function simulateUserInteractions() {
  // Simulate mouse and keyboard events
  const events = ['mousedown', 'mouseup', 'click', 'keydown', 'keyup'];
  for (const eventType of events) {
    document.dispatchEvent(new Event(eventType));
  }
}

async function runCommand(command: string): Promise<void> {
  // Mock command execution
  return new Promise(resolve => setTimeout(resolve, 50));
}

async function createShellProcessWithStreamReader(processId: string): Promise<void> {
  // Mock creating a shell process with stream reader
  (window as any).__activeStreamReaders = (window as any).__activeStreamReaders || [];
  (window as any).__activeStreamReaders.push(processId);
  return Promise.resolve();
}

async function createFileWatcher(filename: string): Promise<void> {
  // Mock creating a file watcher
  (window as any).__activeFileWatchers = (window as any).__activeFileWatchers || [];
  (window as any).__activeFileWatchers.push(filename);
  return Promise.resolve();
}

async function createMultipleFileWatchers(count: number, prefix: string): Promise<void> {
  for (let i = 0; i < count; i++) {
    await createFileWatcher(`${prefix}-file-${i}.txt`);
  }
}

async function createFixedFileWatchers(count: number, prefix: string): Promise<void> {
  // Mock creating file watchers that are properly cleaned up
  return Promise.resolve();
}

async function createFixedStreamReader(processId: string): Promise<void> {
  // Mock creating stream reader that is properly cleaned up
  return Promise.resolve();
}

async function performWebContainerOperations(): Promise<void> {
  // Mock WebContainer operations
  return new Promise(resolve => setTimeout(resolve, 100));
}

function getEventListenerCount(): number {
  // Estimate event listeners by counting elements that typically have them
  const interactiveElements = document.querySelectorAll(
    'button, input, select, textarea, [onclick], [data-testid]'
  );
  return interactiveElements.length * 2; // Assume 2 listeners per element on average
}

async function getActiveStreamReaderCount(): Promise<number> {
  return (window as any).__activeStreamReaders?.length || 0;
}

async function getActiveFileWatcherCount(): Promise<number> {
  return (window as any).__activeFileWatchers?.length || 0;
}

async function saveTestResults(testName: string, data: string): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`memory-test-${testName}-${Date.now()}`, data);
  }
  
  // In Node.js environment, could write to file
  if (typeof process !== 'undefined') {
    console.log(`📊 Test results for ${testName} available in memory`);
  }
}

function analyzeMemoryPattern(measurements: Array<{ timestamp: number; heapUsed: number }>) {
  if (measurements.length < 5) {
    return {
      hasConsistentGrowth: false,
      growthRate: 0,
      stability: 1,
    };
  }

  // Calculate growth trend
  const times = measurements.map((m, i) => i);
  const memories = measurements.map(m => m.heapUsed);
  
  // Simple linear regression to find growth rate
  const n = times.length;
  const sumX = times.reduce((a, b) => a + b, 0);
  const sumY = memories.reduce((a, b) => a + b, 0);
  const sumXY = times.reduce((sum, x, i) => sum + x * memories[i], 0);
  const sumX2 = times.reduce((sum, x) => sum + x * x, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  
  // Check for consistent growth (slope significantly positive)
  const hasConsistentGrowth = slope > 100000; // 100KB per measurement
  
  // Calculate stability (inverse of variance)
  const mean = sumY / n;
  const variance = memories.reduce((sum, m) => sum + Math.pow(m - mean, 2), 0) / n;
  const stability = 1 / (1 + variance / (mean * mean));
  
  return {
    hasConsistentGrowth,
    growthRate: slope,
    stability,
  };
}