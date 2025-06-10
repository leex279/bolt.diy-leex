/**
 * Memory Monitoring Utility for Memory Leak Testing
 * 
 * This utility provides comprehensive memory monitoring capabilities
 * to track, measure, and detect memory leaks during testing.
 */

export interface MemoryMeasurement {
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
  fileWatcherCount?: number;
  streamReaderCount?: number;
}

export interface MemoryReport {
  baseline: number;
  current: number;
  peak: number;
  growth: number;
  measurements: MemoryMeasurement[];
  leakDetected: boolean;
  averageGrowthRate: number;
  memoryEfficiency: number;
}

export interface TestResult {
  testName: string;
  passed: boolean;
  memoryGrowth: number;
  peakMemory: number;
  leakDetected: boolean;
  measurements: MemoryMeasurement[];
  duration: number;
}

export interface RegressionReport {
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalMemoryGrowth: number;
  maxPeakMemory: number;
  results: TestResult[];
  summary: string;
}

export class MemoryMonitor {
  private measurements: MemoryMeasurement[] = [];
  private isMonitoring = false;
  private intervalId?: NodeJS.Timeout;
  private startTime: number = 0;
  private thresholds = {
    warningGrowth: 50 * 1024 * 1024,    // 50MB
    criticalGrowth: 100 * 1024 * 1024,  // 100MB
    maxBaseline: 100 * 1024 * 1024,     // 100MB
  };

  constructor(private options: {
    intervalMs?: number;
    enableWarnings?: boolean;
    trackComponents?: boolean;
  } = {}) {
    this.options = {
      intervalMs: 1000,
      enableWarnings: true,
      trackComponents: true,
      ...options,
    };
  }

  /**
   * Start monitoring memory usage
   */
  startMonitoring(testPhase = 'baseline'): void {
    if (this.isMonitoring) {
      console.warn('⚠️ Memory monitoring already started');
      return;
    }
    
    this.isMonitoring = true;
    this.startTime = Date.now();
    this.measurements = [];
    
    // Take initial measurement
    this.recordMeasurement(testPhase);
    
    // Start periodic monitoring
    this.intervalId = setInterval(() => {
      this.recordMeasurement('monitoring');
    }, this.options.intervalMs);
    
    if (this.options.enableWarnings) {
      console.log('🔍 Memory monitoring started');
    }
  }

  /**
   * Stop monitoring memory usage
   */
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isMonitoring = false;
    
    if (this.options.enableWarnings) {
      console.log('⏹️ Memory monitoring stopped');
    }
  }

  /**
   * Record a memory measurement with optional test phase
   */
  recordMeasurement(testPhase = 'unknown'): void {
    const measurement: MemoryMeasurement = {
      timestamp: Date.now(),
      testPhase,
      ...this.getMemoryUsage(),
      ...(this.options.trackComponents ? this.getComponentCounts() : {}),
    };
    
    this.measurements.push(measurement);
    
    if (this.options.enableWarnings) {
      this.checkThresholds(measurement);
    }
  }

  /**
   * Get current memory usage for both Node.js and browser environments
   */
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
    
    // Fallback for environments without memory APIs
    return {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      arrayBuffers: 0,
    };
  }

  /**
   * Count various components that might be related to memory leaks
   */
  private getComponentCounts() {
    if (typeof document === 'undefined') {
      return {
        componentCount: 0,
        terminalCount: 0,
        listenerCount: 0,
        fileWatcherCount: 0,
        streamReaderCount: 0,
      };
    }

    return {
      componentCount: this.countReactComponents(),
      terminalCount: this.countTerminals(),
      listenerCount: this.estimateEventListeners(),
      fileWatcherCount: this.countFileWatchers(),
      streamReaderCount: this.countStreamReaders(),
    };
  }

  /**
   * Count React components in the DOM
   */
  private countReactComponents(): number {
    const reactElements = document.querySelectorAll(
      '[data-reactroot], [data-react-class], [data-testid], .react-component'
    );
    return reactElements.length;
  }

  /**
   * Count terminal instances
   */
  private countTerminals(): number {
    const terminals = document.querySelectorAll(
      '.terminal, [data-terminal], .xterm, .terminal-container'
    );
    return terminals.length;
  }

  /**
   * Estimate event listeners (this is approximate)
   */
  private estimateEventListeners(): number {
    // This is a rough estimate - in production, you'd want to track listeners more precisely
    const elementsWithListeners = document.querySelectorAll(
      '[onclick], [onmousedown], [onmouseup], [onkeydown], [onchange]'
    );
    
    // Assume each interactive element has ~2-3 listeners on average
    return elementsWithListeners.length * 2.5;
  }

  /**
   * Count file watchers (would need access to file watcher state)
   */
  private countFileWatchers(): number {
    // This would need to be implemented based on actual file watcher tracking
    // For now, return an estimate based on file elements
    const fileElements = document.querySelectorAll(
      '[data-file], .file-item, .tree-item'
    );
    return Math.floor(fileElements.length / 10); // Rough estimate
  }

  /**
   * Count stream readers (would need access to stream state)
   */
  private countStreamReaders(): number {
    // This would need to be implemented based on actual stream tracking
    // For now, return 0 as placeholder
    return 0;
  }

  /**
   * Check if current measurement exceeds thresholds
   */
  private checkThresholds(measurement: MemoryMeasurement): void {
    if (this.measurements.length < 2) return;

    const baseline = this.measurements[0];
    const growth = measurement.heapUsed - baseline.heapUsed;

    if (growth > this.thresholds.criticalGrowth) {
      console.error(`🚨 CRITICAL: Memory growth detected: ${this.formatBytes(growth)}`);
    } else if (growth > this.thresholds.warningGrowth) {
      console.warn(`⚠️ WARNING: High memory usage: ${this.formatBytes(measurement.heapUsed)}`);
    }

    if (measurement.heapUsed > this.thresholds.maxBaseline) {
      console.warn(`⚠️ High absolute memory usage: ${this.formatBytes(measurement.heapUsed)}`);
    }
  }

  /**
   * Generate comprehensive memory report
   */
  getReport(): MemoryReport {
    if (this.measurements.length === 0) {
      return {
        baseline: 0,
        current: 0,
        peak: 0,
        growth: 0,
        measurements: [],
        leakDetected: false,
        averageGrowthRate: 0,
        memoryEfficiency: 1,
      };
    }

    const baseline = this.measurements[0];
    const current = this.measurements[this.measurements.length - 1];
    const peak = Math.max(...this.measurements.map(m => m.heapUsed));
    const growth = current.heapUsed - baseline.heapUsed;
    
    return {
      baseline: baseline.heapUsed,
      current: current.heapUsed,
      peak,
      growth,
      measurements: this.measurements,
      leakDetected: this.detectLeak(),
      averageGrowthRate: this.calculateAverageGrowthRate(),
      memoryEfficiency: this.calculateMemoryEfficiency(),
    };
  }

  /**
   * Detect if there's a memory leak based on growth patterns
   */
  private detectLeak(): boolean {
    if (this.measurements.length < 10) return false;
    
    // Check for consistent upward trend
    const recent = this.measurements.slice(-10);
    const trend = this.calculateTrend(recent.map(m => m.heapUsed));
    
    // Leak detected if memory consistently grows more than 1MB per measurement
    const leakThreshold = 1024 * 1024; // 1MB
    
    return trend > leakThreshold;
  }

  /**
   * Calculate average growth rate per second
   */
  private calculateAverageGrowthRate(): number {
    if (this.measurements.length < 2) return 0;
    
    const baseline = this.measurements[0];
    const current = this.measurements[this.measurements.length - 1];
    const timeDiff = (current.timestamp - baseline.timestamp) / 1000; // seconds
    const memoryDiff = current.heapUsed - baseline.heapUsed;
    
    return timeDiff > 0 ? memoryDiff / timeDiff : 0;
  }

  /**
   * Calculate memory efficiency (how well memory is being managed)
   */
  private calculateMemoryEfficiency(): number {
    if (this.measurements.length < 2) return 1;
    
    const baseline = this.measurements[0];
    const peak = Math.max(...this.measurements.map(m => m.heapUsed));
    const current = this.measurements[this.measurements.length - 1];
    
    // Efficiency = how close final memory is to baseline vs peak
    // 1.0 = perfect (back to baseline), 0.0 = worst (stayed at peak)
    if (peak === baseline.heapUsed) return 1;
    
    const efficiency = 1 - ((current.heapUsed - baseline.heapUsed) / (peak - baseline.heapUsed));
    return Math.max(0, Math.min(1, efficiency));
  }

  /**
   * Calculate trend using linear regression
   */
  private calculateTrend(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;
    
    const sumX = n * (n - 1) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumX2 = n * (n - 1) * (2 * n - 1) / 6;
    
    const denominator = n * sumX2 - sumX * sumX;
    return denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  }

  /**
   * Format bytes into human-readable format
   */
  formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Export measurement data for analysis
   */
  exportData(): string {
    const report = this.getReport();
    return JSON.stringify({
      report,
      measurements: this.measurements,
      options: this.options,
      timestamp: new Date().toISOString(),
      duration: this.startTime ? Date.now() - this.startTime : 0,
    }, null, 2);
  }

  /**
   * Generate a summary of memory usage
   */
  getSummary(): string {
    const report = this.getReport();
    const duration = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;
    
    return `Memory Summary:
- Duration: ${duration.toFixed(1)}s
- Baseline: ${this.formatBytes(report.baseline)}
- Peak: ${this.formatBytes(report.peak)}
- Current: ${this.formatBytes(report.current)}
- Growth: ${this.formatBytes(report.growth)}
- Leak Detected: ${report.leakDetected ? '🚨 YES' : '✅ NO'}
- Efficiency: ${(report.memoryEfficiency * 100).toFixed(1)}%
- Avg Growth Rate: ${this.formatBytes(report.averageGrowthRate)}/s`;
  }

  /**
   * Clear all measurements and reset
   */
  clear(): void {
    this.measurements = [];
    this.startTime = 0;
  }

  /**
   * Set custom thresholds for warnings
   */
  setThresholds(thresholds: Partial<typeof this.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Force garbage collection if available (Node.js)
   */
  forceGC(): boolean {
    if (typeof global !== 'undefined' && global.gc) {
      global.gc();
      return true;
    }
    return false;
  }

  /**
   * Take a snapshot for comparison
   */
  takeSnapshot(label: string): MemoryMeasurement {
    const measurement: MemoryMeasurement = {
      timestamp: Date.now(),
      testPhase: `snapshot-${label}`,
      ...this.getMemoryUsage(),
      ...(this.options.trackComponents ? this.getComponentCounts() : {}),
    };
    
    this.measurements.push(measurement);
    return measurement;
  }
}

/**
 * Global memory monitor instance for easy access
 */
export const globalMemoryMonitor = new MemoryMonitor({
  enableWarnings: true,
  trackComponents: true,
});

/**
 * Utility function to run a test with memory monitoring
 */
export async function withMemoryMonitoring<T>(
  testFn: () => Promise<T>,
  testName: string
): Promise<{ result: T; report: MemoryReport }> {
  const monitor = new MemoryMonitor();
  
  monitor.startMonitoring(`start-${testName}`);
  
  try {
    const result = await testFn();
    monitor.recordMeasurement(`end-${testName}`);
    
    const report = monitor.getReport();
    return { result, report };
  } finally {
    monitor.stopMonitoring();
  }
}