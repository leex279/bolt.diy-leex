# Memory Leak Testing Framework

## Overview

This document outlines a comprehensive testing framework to reproduce, measure, and verify fixes for the memory leaks identified in the bolt.diy application. The framework includes automated tests, monitoring utilities, and reproduction scenarios.

## 🎯 Testing Objectives

1. **Reproduce the 2GB memory spike** under controlled conditions
2. **Isolate individual leak sources** for targeted testing
3. **Measure memory usage** before and after fixes
4. **Automate regression testing** to prevent future leaks
5. **Provide benchmarking data** for performance optimization

## 🧪 Test Framework Architecture

### 1. Memory Monitoring Utilities

Create utilities to track memory usage in real-time:

```typescript
// tests/utils/memory-monitor.ts
export class MemoryMonitor {
  private measurements: MemoryMeasurement[] = [];
  private isMonitoring = false;
  private intervalId?: NodeJS.Timeout;

  interface MemoryMeasurement {
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
    jsHeapSizeLimit?: number;
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    testPhase: string;
    componentCount?: number;
    terminalCount?: number;
    listenerCount?: number;
  }

  startMonitoring(intervalMs = 1000) {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.intervalId = setInterval(() => {
      this.recordMeasurement();
    }, intervalMs);
    
    console.log('🔍 Memory monitoring started');
  }

  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isMonitoring = false;
    console.log('⏹️ Memory monitoring stopped');
  }

  private recordMeasurement(testPhase = 'unknown') {
    const measurement: MemoryMeasurement = {
      timestamp: Date.now(),
      testPhase,
      ...this.getMemoryUsage(),
      ...this.getComponentCounts(),
    };
    
    this.measurements.push(measurement);
    
    if (measurement.heapUsed > 100 * 1024 * 1024) { // 100MB threshold
      console.warn(`⚠️ High memory usage detected: ${this.formatBytes(measurement.heapUsed)}`);
    }
  }

  private getMemoryUsage() {
    // Node.js environment
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const nodeMemory = process.memoryUsage();
      return {
        heapUsed: nodeMemory.heapUsed,
        heapTotal: nodeMemory.heapTotal,
        external: nodeMemory.external,
        arrayBuffers: nodeMemory.arrayBuffers,
      };
    }
    
    // Browser environment
    if (typeof window !== 'undefined' && (window as any).performance?.memory) {
      const browserMemory = (window as any).performance.memory;
      return {
        heapUsed: browserMemory.usedJSHeapSize,
        heapTotal: browserMemory.totalJSHeapSize,
        external: 0,
        arrayBuffers: 0,
        jsHeapSizeLimit: browserMemory.jsHeapSizeLimit,
        usedJSHeapSize: browserMemory.usedJSHeapSize,
        totalJSHeapSize: browserMemory.totalJSHeapSize,
      };
    }
    
    return {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      arrayBuffers: 0,
    };
  }

  private getComponentCounts() {
    return {
      componentCount: this.countReactComponents(),
      terminalCount: this.countTerminals(),
      listenerCount: this.countEventListeners(),
    };
  }

  private countReactComponents(): number {
    // Count React components in DOM
    if (typeof document === 'undefined') return 0;
    return document.querySelectorAll('[data-reactroot], [data-react-class]').length;
  }

  private countTerminals(): number {
    if (typeof document === 'undefined') return 0;
    return document.querySelectorAll('.terminal, [data-terminal]').length;
  }

  private countEventListeners(): number {
    // This is a rough estimate - actual implementation would need more sophisticated tracking
    return (window as any)._eventListenerCount || 0;
  }

  getReport(): MemoryReport {
    const baseline = this.measurements[0];
    const current = this.measurements[this.measurements.length - 1];
    
    return {
      baseline: baseline?.heapUsed || 0,
      current: current?.heapUsed || 0,
      peak: Math.max(...this.measurements.map(m => m.heapUsed)),
      growth: current ? current.heapUsed - (baseline?.heapUsed || 0) : 0,
      measurements: this.measurements,
      leakDetected: this.detectLeak(),
    };
  }

  private detectLeak(): boolean {
    if (this.measurements.length < 10) return false;
    
    const recent = this.measurements.slice(-10);
    const trend = this.calculateTrend(recent.map(m => m.heapUsed));
    
    // Leak detected if memory consistently grows
    return trend > 1024 * 1024; // 1MB+ growth trend
  }

  private calculateTrend(values: number[]): number {
    const n = values.length;
    const sumX = n * (n - 1) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumX2 = n * (n - 1) * (2 * n - 1) / 6;
    
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  exportData(): string {
    return JSON.stringify({
      report: this.getReport(),
      measurements: this.measurements,
      timestamp: new Date().toISOString(),
    }, null, 2);
  }

  clear() {
    this.measurements = [];
  }
}

interface MemoryReport {
  baseline: number;
  current: number;
  peak: number;
  growth: number;
  measurements: MemoryMeasurement[];
  leakDetected: boolean;
}
```

### 2. Memory Leak Test Scenarios

```typescript
// tests/memory-leaks/leak-scenarios.test.ts
import { MemoryMonitor } from '../utils/memory-monitor';
import { render, cleanup } from '@testing-library/react';
import { act } from 'react-dom/test-utils';

describe('Memory Leak Scenarios', () => {
  let memoryMonitor: MemoryMonitor;

  beforeEach(() => {
    memoryMonitor = new MemoryMonitor();
    memoryMonitor.startMonitoring(500); // Monitor every 500ms
  });

  afterEach(() => {
    memoryMonitor.stopMonitoring();
    cleanup();
  });

  describe('Terminal Process Leaks', () => {
    it('should reproduce terminal process accumulation', async () => {
      const ITERATIONS = 20;
      const DELAY = 100;

      for (let i = 0; i < ITERATIONS; i++) {
        await act(async () => {
          // Simulate creating and destroying terminals
          const { unmount } = render(<TerminalComponent />);
          
          // Wait for terminal to initialize
          await new Promise(resolve => setTimeout(resolve, DELAY));
          
          // Create some processes
          await simulateTerminalCommands();
          
          // Unmount without proper cleanup (simulating the bug)
          unmount();
          
          memoryMonitor.recordMeasurement(`terminal-iteration-${i}`);
        });
      }

      const report = memoryMonitor.getReport();
      expect(report.leakDetected).toBe(true);
      expect(report.growth).toBeGreaterThan(50 * 1024 * 1024); // 50MB growth
      
      console.log('🔥 Terminal leak reproduced:', memoryMonitor.formatBytes(report.growth));
    });

    it('should verify terminal process cleanup after fix', async () => {
      // Same test but with fixed component
      const ITERATIONS = 20;
      
      for (let i = 0; i < ITERATIONS; i++) {
        await act(async () => {
          const { unmount } = render(<FixedTerminalComponent />);
          await simulateTerminalCommands();
          unmount(); // Should properly cleanup processes
        });
      }

      const report = memoryMonitor.getReport();
      expect(report.leakDetected).toBe(false);
      expect(report.growth).toBeLessThan(10 * 1024 * 1024); // Less than 10MB growth
    });
  });

  describe('Event Listener Leaks', () => {
    it('should reproduce global event listener accumulation', async () => {
      const ITERATIONS = 100;
      
      // Track initial listener count
      const initialListeners = getEventListenerCount();

      for (let i = 0; i < ITERATIONS; i++) {
        await act(async () => {
          const { unmount } = render(<ComponentWithGlobalListeners />);
          await new Promise(resolve => setTimeout(resolve, 10));
          unmount();
        });
      }

      const finalListeners = getEventListenerCount();
      const listenerGrowth = finalListeners - initialListeners;
      
      expect(listenerGrowth).toBeGreaterThan(ITERATIONS * 2); // At least 2 listeners per iteration
      
      const report = memoryMonitor.getReport();
      console.log('🎯 Event listener leak reproduced:', listenerGrowth, 'extra listeners');
    });
  });

  describe('Stream Reader Leaks', () => {
    it('should reproduce background stream reader accumulation', async () => {
      const ITERATIONS = 10;
      
      for (let i = 0; i < ITERATIONS; i++) {
        await act(async () => {
          // Simulate creating shell processes with stream readers
          await createShellProcessWithStreamReader();
          memoryMonitor.recordMeasurement(`stream-reader-${i}`);
        });
        
        // Wait for streams to accumulate
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const report = memoryMonitor.getReport();
      expect(report.leakDetected).toBe(true);
      
      // Verify that stream readers are still running
      const activeReaders = await getActiveStreamReaderCount();
      expect(activeReaders).toBeGreaterThan(ITERATIONS - 2);
    });
  });

  describe('File Watcher Leaks', () => {
    it('should reproduce file watcher accumulation', async () => {
      const ITERATIONS = 15;
      
      for (let i = 0; i < ITERATIONS; i++) {
        await act(async () => {
          // Simulate file operations that create watchers
          await createFileWatcher(`test-file-${i}.txt`);
          memoryMonitor.recordMeasurement(`file-watcher-${i}`);
        });
      }

      const activeWatchers = await getActiveFileWatcherCount();
      expect(activeWatchers).toBeGreaterThan(ITERATIONS - 2);
      
      const report = memoryMonitor.getReport();
      expect(report.growth).toBeGreaterThan(5 * 1024 * 1024); // 5MB growth
    });
  });

  describe('Combined Leak Scenario', () => {
    it('should reproduce the 2GB memory spike scenario', async () => {
      // This test simulates extended usage that leads to the 2GB spike
      const TEST_DURATION = 30000; // 30 seconds
      const startTime = Date.now();
      
      let iteration = 0;
      
      while (Date.now() - startTime < TEST_DURATION) {
        await act(async () => {
          // Simulate realistic user workflow
          await simulateUserWorkflow(iteration);
          memoryMonitor.recordMeasurement(`combined-workflow-${iteration}`);
          iteration++;
        });
        
        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const report = memoryMonitor.getReport();
      
      // Log detailed report
      console.log('📊 Combined leak test results:');
      console.log(`- Iterations: ${iteration}`);
      console.log(`- Memory growth: ${memoryMonitor.formatBytes(report.growth)}`);
      console.log(`- Peak usage: ${memoryMonitor.formatBytes(report.peak)}`);
      console.log(`- Leak detected: ${report.leakDetected}`);
      
      // Export data for analysis
      const testData = memoryMonitor.exportData();
      await saveTestResults('combined-leak-test', testData);
      
      // Verify significant memory growth (simulating the 2GB issue)
      expect(report.growth).toBeGreaterThan(100 * 1024 * 1024); // 100MB+ growth
      expect(report.leakDetected).toBe(true);
    });
  });
});

// Helper functions for test scenarios

async function simulateUserWorkflow(iteration: number) {
  // Create terminals
  for (let i = 0; i < 3; i++) {
    await createTerminal();
    await runTerminalCommand(`echo "Test ${iteration}-${i}"`);
  }
  
  // Create file watchers
  await createMultipleFileWatchers(5);
  
  // Add event listeners
  await createComponentsWithListeners(10);
  
  // Simulate WebContainer operations
  await performWebContainerOperations();
  
  // Cleanup some but not all (simulating partial cleanup)
  await partialCleanup();
}

async function simulateTerminalCommands() {
  const commands = ['ls', 'pwd', 'echo "test"', 'cat package.json'];
  for (const cmd of commands) {
    await runCommand(cmd);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

function getEventListenerCount(): number {
  // Implementation to count active event listeners
  // This would need to be implemented based on the actual DOM state
  return document.getElementsByTagName('*').length * 2; // Rough estimate
}

async function getActiveStreamReaderCount(): Promise<number> {
  // Implementation to count active stream readers
  // This would need access to the shell process tracking
  return 0; // Placeholder
}

async function getActiveFileWatcherCount(): Promise<number> {
  // Implementation to count active file watchers
  // This would need access to the file watcher state
  return 0; // Placeholder
}

async function saveTestResults(testName: string, data: string) {
  // Save test results to file for analysis
  if (typeof window !== 'undefined') {
    localStorage.setItem(`memory-test-${testName}`, data);
  }
}
```

### 3. Performance Benchmarking Suite

```typescript
// tests/memory-leaks/performance-benchmark.test.ts
describe('Performance Benchmarks', () => {
  let memoryMonitor: MemoryMonitor;

  beforeEach(() => {
    memoryMonitor = new MemoryMonitor();
  });

  afterEach(() => {
    memoryMonitor.stopMonitoring();
  });

  it('should benchmark baseline memory usage', async () => {
    memoryMonitor.startMonitoring();
    
    // Load the application in a clean state
    await loadApplication();
    await new Promise(resolve => setTimeout(resolve, 5000)); // Let it settle
    
    const report = memoryMonitor.getReport();
    
    // Record baseline metrics
    const baseline = {
      initialMemory: report.baseline,
      settledMemory: report.current,
      timestamp: new Date().toISOString(),
    };
    
    await saveTestResults('baseline-memory', JSON.stringify(baseline));
    
    expect(report.current).toBeLessThan(50 * 1024 * 1024); // 50MB baseline
  });

  it('should benchmark memory usage under normal load', async () => {
    memoryMonitor.startMonitoring();
    
    await loadApplication();
    
    // Simulate normal usage for 10 minutes
    const TEST_DURATION = 10 * 60 * 1000; // 10 minutes
    const startTime = Date.now();
    
    while (Date.now() - startTime < TEST_DURATION) {
      await simulateNormalUsage();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const report = memoryMonitor.getReport();
    
    // Normal usage should not cause significant memory growth
    expect(report.growth).toBeLessThan(20 * 1024 * 1024); // Less than 20MB growth
    expect(report.leakDetected).toBe(false);
  });

  it('should benchmark memory usage under stress conditions', async () => {
    memoryMonitor.startMonitoring();
    
    await loadApplication();
    
    // Simulate heavy usage
    for (let i = 0; i < 50; i++) {
      await simulateHeavyUsage();
      memoryMonitor.recordMeasurement(`stress-test-${i}`);
    }
    
    const report = memoryMonitor.getReport();
    
    // Even under stress, growth should be reasonable
    expect(report.growth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB growth
    
    await saveTestResults('stress-test', memoryMonitor.exportData());
  });
});
```

### 4. Test Automation and CI Integration

```typescript
// tests/memory-leaks/automated-regression.test.ts
describe('Memory Leak Regression Tests', () => {
  it('should run daily memory leak detection', async () => {
    const testSuite = new MemoryLeakTestSuite();
    
    const results = await testSuite.runAll([
      'terminal-process-leaks',
      'event-listener-leaks', 
      'stream-reader-leaks',
      'file-watcher-leaks',
      'combined-scenario'
    ]);
    
    // Generate report
    const report = testSuite.generateReport(results);
    
    // Fail if any significant leaks detected
    const hasLeaks = results.some(r => r.leakDetected && r.growth > 50 * 1024 * 1024);
    expect(hasLeaks).toBe(false);
    
    // Save results for trending
    await saveTestResults('daily-regression', JSON.stringify(report));
  });
});

class MemoryLeakTestSuite {
  async runAll(testNames: string[]): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    for (const testName of testNames) {
      const result = await this.runTest(testName);
      results.push(result);
    }
    
    return results;
  }
  
  async runTest(testName: string): Promise<TestResult> {
    const monitor = new MemoryMonitor();
    monitor.startMonitoring();
    
    try {
      await this.executeTest(testName);
      const report = monitor.getReport();
      
      return {
        testName,
        passed: !report.leakDetected,
        memoryGrowth: report.growth,
        peakMemory: report.peak,
        leakDetected: report.leakDetected,
        measurements: report.measurements,
      };
    } finally {
      monitor.stopMonitoring();
    }
  }
  
  generateReport(results: TestResult[]): RegressionReport {
    return {
      timestamp: new Date().toISOString(),
      totalTests: results.length,
      passedTests: results.filter(r => r.passed).length,
      failedTests: results.filter(r => !r.passed).length,
      totalMemoryGrowth: results.reduce((sum, r) => sum + r.memoryGrowth, 0),
      maxPeakMemory: Math.max(...results.map(r => r.peakMemory)),
      results,
    };
  }
}
```

### 5. Manual Testing Guide

```markdown
# Manual Memory Leak Testing Guide

## 🧪 Test Environment Setup

1. **Browser Setup**:
   - Use Chrome DevTools Memory tab
   - Enable "Record heap allocations on timeline"
   - Clear cache and hard reload before testing

2. **Monitoring Tools**:
   - Chrome DevTools Memory tab
   - Performance tab for timeline recording
   - Task Manager to monitor overall memory usage

## 📋 Manual Test Scenarios

### Scenario 1: Terminal Process Accumulation
**Duration**: 15 minutes
**Steps**:
1. Open bolt.diy application
2. Create a new project
3. Repeat 20 times:
   - Open a new terminal
   - Run commands: `npm install`, `npm run dev`
   - Close terminal tab
4. **Expected**: Memory should not grow significantly
5. **Bug symptoms**: Each iteration adds ~50-100MB

### Scenario 2: Extended Chat Session
**Duration**: 30 minutes  
**Steps**:
1. Start a new chat
2. Send 50+ messages requesting code changes
3. Let AI generate and modify files continuously
4. Monitor memory usage every 5 minutes
5. **Expected**: Memory growth should plateau
6. **Bug symptoms**: Continuous growth reaching 2GB+

### Scenario 3: File Operation Stress Test
**Duration**: 20 minutes
**Steps**:
1. Create a project with many files
2. Repeat 30 times:
   - Open multiple files in editor
   - Make changes and save
   - Create new files
   - Delete files
3. **Expected**: Memory should remain stable
4. **Bug symptoms**: File watchers accumulate, causing growth

### Scenario 4: Component Mount/Unmount Cycling
**Duration**: 10 minutes
**Steps**:
1. Navigate between different sections rapidly:
   - Chat → Settings → Workbench → Chat
2. Repeat navigation 100 times
3. Monitor component cleanup
4. **Expected**: Memory should return to baseline
5. **Bug symptoms**: Event listeners accumulate

## 📊 Memory Measurement Guidelines

### Taking Measurements
1. **Before test**: Record baseline memory
2. **During test**: Record every 2-3 iterations
3. **After test**: Force garbage collection and record final

### Red Flags
- **Growth > 50MB** in 10 minutes of normal usage
- **Continuous upward trend** without plateauing  
- **Peak usage > 500MB** for standard operations
- **Memory not released** after component cleanup

### Recording Results
```
Test: [Scenario Name]
Duration: [XX minutes]
Baseline: [XX MB]
Peak: [XX MB] 
Final: [XX MB]
Growth: [XX MB]
Leak Detected: [Yes/No]
Notes: [Observations]
```
```

## 🚀 Implementation Plan

### Phase 1: Setup (Week 1)
1. Create memory monitoring utilities
2. Set up basic test scenarios
3. Implement manual testing procedures

### Phase 2: Automated Testing (Week 2)  
1. Build comprehensive test suite
2. Create CI integration
3. Implement regression testing

### Phase 3: Validation (Week 3)
1. Run baseline tests on current code
2. Apply memory leak fixes
3. Verify improvements with test suite
4. Document results and create monitoring dashboard

This framework provides both automated and manual approaches to reproduce, measure, and verify memory leak fixes in the bolt.diy application.