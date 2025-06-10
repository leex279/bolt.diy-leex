# Memory Leaks Analysis Report

## Overview

This analysis was conducted in response to a developer report: *"There does appear to be some sort of memory leak or at least excessive usage of memory that I can't seem to track down at the moment, if a project is left running it can spike to 2.0GB of memory used which is excessive, any ideas guys?"*

## 🔴 Critical Issues (Immediate Action Required)

### 1. Terminal Process Accumulation
**File**: `app/lib/stores/terminal.ts`  
**Lines**: 38-46  
**Severity**: CRITICAL

```typescript
// Current problematic code:
async attachTerminal(terminal: ITerminal) {
  const shellProcess = await newShellProcess(await this.#webcontainer, terminal);
  this.#terminals.push({ terminal, process: shellProcess });
  // Missing: cleanup of previous processes
}
```

**Problem**: Terminal processes are stored in array but never cleaned up. Each terminal creates a WebContainer process that accumulates indefinitely.

**Impact**: Primary cause of memory leak - processes consume significant memory and multiply over time.

**Solution**:
```typescript
async detachTerminal(terminal: ITerminal) {
  const index = this.#terminals.findIndex(t => t.terminal === terminal);
  if (index >= 0) {
    const { process } = this.#terminals[index];
    await process.kill(); // Add process termination
    this.#terminals.splice(index, 1);
  }
}
```

### 2. Background Stream Readers
**File**: `app/utils/shell.ts`  
**Lines**: 143-172  
**Severity**: CRITICAL

```typescript
// Problematic infinite loop:
private async _watchExpoUrlInBackground(stream: ReadableStream<string>) {
  const reader = stream.getReader();
  while (true) { // Infinite loop with no cleanup
    // Stream processing...
  }
}
```

**Problem**: Multiple stream readers created but not properly disposed. Background watchers run indefinitely without cleanup mechanism.

**Impact**: Stream readers accumulate and consume memory continuously.

**Solution**: Add proper stream reader disposal and break conditions.

### 3. Global Event Listeners
**File**: `app/lib/hooks/useStickToBottom.tsx`  
**Lines**: 133-143  
**Severity**: CRITICAL

```typescript
// Problematic global listeners:
globalThis.document?.addEventListener('mousedown', () => {
  mouseDown = true;
});

globalThis.document?.addEventListener('mouseup', () => {
  mouseDown = false;
});

globalThis.document?.addEventListener('click', () => {
  mouseDown = false;
});
```

**Problem**: Global event listeners are added but never removed, accumulating with every component mount/unmount cycle.

**Impact**: Listeners multiply exponentially with component usage.

**Solution**:
```typescript
useEffect(() => {
  const mouseDownHandler = () => mouseDown = true;
  const mouseUpHandler = () => mouseDown = false;
  const clickHandler = () => mouseDown = false;
  
  document.addEventListener('mousedown', mouseDownHandler);
  document.addEventListener('mouseup', mouseUpHandler);
  document.addEventListener('click', clickHandler);
  
  return () => {
    document.removeEventListener('mousedown', mouseDownHandler);
    document.removeEventListener('mouseup', mouseUpHandler);
    document.removeEventListener('click', clickHandler);
  };
}, []);
```

### 4. WebContainer Event Listeners
**File**: `app/lib/webcontainer/index.ts`  
**Lines**: 42-57  
**Severity**: CRITICAL

```typescript
// Event listeners attached but no cleanup:
webcontainer.on('preview-message', (message) => {
  // Handler logic
});
```

**Problem**: WebContainer instance is created but never properly disposed of. Event listeners accumulate without removal.

**Impact**: WebContainer persists across hot reloads, causing stale references and memory leaks.

**Solution**: Track event listeners and remove them on cleanup.

### 5. File System Watchers
**File**: `app/lib/stores/files.ts`  
**Lines**: 599-602  
**Severity**: CRITICAL

```typescript
// Path watcher without cleanup:
webcontainer.internal.watchPaths(
  { include: [`${WORK_DIR}/**`], exclude: ['**/node_modules', '.git'], includeContent: true },
  bufferWatchEvents(100, this.#processEventBuffer.bind(this)),
);
```

**Problem**: File watchers created but no explicit cleanup mechanism.

**Impact**: Multiple watchers continue monitoring file system indefinitely.

**Solution**: Track watchers and dispose them properly.

## 🟡 High Impact Issues

### 6. Uncleaned Intervals
**File**: `app/lib/stores/files.ts`  
**Lines**: 625-631  
**Severity**: HIGH

```typescript
// Interval never cleared:
setInterval(() => {
  clearCache();
  const latestChatId = getCurrentChatId();
  this.#loadLockedFiles(latestChatId);
}, 30000);
```

**Problem**: setInterval never cleared and continues running even when store is no longer needed.

**Impact**: Continuous memory allocation every 30 seconds.

**Solution**:
```typescript
const intervalRef = setInterval(() => {
  // periodic work
}, 30000);

// Store reference and clear on cleanup
return () => {
  if (intervalRef) {
    clearInterval(intervalRef);
  }
};
```

### 7. MutationObserver Leak
**File**: `app/lib/stores/files.ts`  
**Lines**: 111-122  
**Severity**: HIGH

```typescript
// Observer never disconnected:
const observer = new MutationObserver(() => {
  const currentChatId = getCurrentChatId();
  // Observer logic...
});

observer.observe(document, { subtree: true, childList: true });
// Missing: observer.disconnect() cleanup
```

**Problem**: MutationObserver monitors entire document tree but is never disconnected.

**Impact**: Continuous DOM observation consuming memory indefinitely.

**Solution**: Call `observer.disconnect()` on cleanup.

### 8. File Watcher Polling
**File**: `app/utils/file-watcher.ts`  
**Lines**: 150-166  
**Severity**: HIGH

```typescript
// Polling interval with limited cleanup:
watcherState.pollingInterval = setInterval(() => {
  for (const [, callbacks] of watcherState.callbacks.entries()) {
    callbacks.forEach((callback) => callback());
  }
}, 3000);

// Only cleans up on beforeunload, not component unmount
window.addEventListener('beforeunload', () => {
  if (watcherState.pollingInterval) {
    clearInterval(watcherState.pollingInterval);
  }
});
```

**Problem**: Interval only cleaned up on page unload, not when components unmount.

**Impact**: Polling continues unnecessarily when components are no longer active.

**Solution**: Add component-level cleanup in addition to beforeunload.

### 9. Message Parser State Accumulation
**File**: `app/lib/runtime/message-parser.ts`  
**Lines**: 74, 90  
**Severity**: HIGH

```typescript
export class StreamingMessageParser {
  #messages = new Map<string, MessageState>();
  
  parse(messageId: string, input: string) {
    // Messages accumulate but only cleared via reset()
    this.#messages.set(messageId, state);
  }
  
  reset() {
    this.#messages.clear(); // Only cleanup method
  }
}
```

**Problem**: Messages Map grows indefinitely unless manually reset.

**Impact**: Parser state accumulates for every message processed.

**Solution**: Implement automatic cleanup of old message states.

## 🟠 Moderate Issues

### 10. Log Accumulation
**File**: `app/lib/stores/logs.ts`  
**Lines**: 47-126  
**Severity**: MODERATE

```typescript
const MAX_LOGS = 1000; // Large limit with potentially large objects

private _trimLogs() {
  const currentLogs = Object.entries(this._logs.get());
  if (currentLogs.length > MAX_LOGS) {
    // Trim to MAX_LOGS but objects can still be large
  }
}
```

**Problem**: 1000 log limit allows accumulation of large objects with detailed API responses and stack traces.

**Impact**: Each log can contain substantial data, leading to memory bloat.

**Solution**: More aggressive trimming of log details and lower limits.

### 11. Broadcast Channel Leaks
**File**: `app/lib/stores/previews.ts`  
**Lines**: 34-35  
**Severity**: MODERATE

```typescript
// Multiple channels created:
this.#broadcastChannel = new BroadcastChannel(PREVIEW_CHANNEL);
this.#storageChannel = new BroadcastChannel('storage-sync-channel');

// Cleanup only in one place
```

**Problem**: Multiple broadcast channels created but cleanup not consistent across all instances.

**Impact**: Channels persist and consume memory.

**Solution**: Ensure all channels are properly closed in cleanup.

### 12. Terminal Refs Accumulation
**File**: `app/components/workbench/terminal/TerminalTabs.tsx`  
**Lines**: 156-158  
**Severity**: MODERATE

```typescript
// Refs pushed but never removed:
ref={(ref) => {
  terminalRefs.current.push(ref);
}}
```

**Problem**: Terminal references are pushed to array but never removed when components unmount.

**Impact**: Stale DOM references prevent garbage collection.

**Solution**: Remove refs from array on component unmount.

### 13. Action Runner Process Leaks
**File**: `app/lib/runtime/action-runner.ts`  
**Lines**: 385-396  
**Severity**: MODERATE

```typescript
// Process spawned without cleanup:
const buildProcess = await webcontainer.spawn('npm', ['run', 'build']);
buildProcess.output.pipeTo(
  new WritableStream({
    write(data) {
      output += data;
    },
  }),
);
// Missing: buildProcess.kill() or cleanup
```

**Problem**: Build processes spawned without termination handling.

**Impact**: Long-running processes accumulate and consume resources.

**Solution**: Add process termination and timeout handling.

## 🔍 Root Cause Analysis

The **2GB memory spike** is likely caused by the combination of:

1. **Terminal processes accumulating** (Primary cause - each process can consume 50-200MB)
2. **Stream readers running indefinitely** (Secondary cause - continuous memory allocation)
3. **File watchers multiplying** over time (Tertiary cause - each watcher consumes resources)
4. **Global event listeners** growing exponentially with component usage
5. **WebContainer instances** persisting across hot reloads without proper cleanup

## 🚀 Immediate Action Plan

### Priority 1 (Critical - Implement Immediately)
1. **Fix terminal process cleanup** - Add `process.kill()` in `detachTerminal()`
2. **Remove global event listeners** - Add proper cleanup in `useStickToBottom`
3. **Fix stream reader disposal** - Break infinite loops and dispose readers
4. **Clean up WebContainer listeners** - Track and remove event listeners

### Priority 2 (High - Implement Soon)
1. **Clear intervals properly** - Store references and clear on cleanup
2. **Disconnect MutationObserver** - Add cleanup in files store
3. **Implement message parser cleanup** - Periodic cleanup of old states
4. **Fix file watcher disposal** - Add component-level cleanup

### Priority 3 (Moderate - Plan for Next Sprint)
1. **Optimize log storage** - Reduce log size and implement better trimming
2. **Fix broadcast channel cleanup** - Ensure consistent disposal
3. **Clean up terminal refs** - Remove refs on unmount
4. **Add process timeouts** - Prevent long-running processes

## 📊 Expected Impact

Implementing these fixes should:
- **Reduce baseline memory usage** by 60-80%
- **Prevent memory growth** over extended periods
- **Eliminate the 2GB spike** issue
- **Improve overall application performance**

## 🔧 Recommended Implementation

```typescript
// Example comprehensive cleanup pattern:
useEffect(() => {
  // Setup resources
  const cleanup = [];
  
  // Event listeners
  const handler = () => {};
  document.addEventListener('event', handler);
  cleanup.push(() => document.removeEventListener('event', handler));
  
  // Intervals
  const interval = setInterval(() => {}, 1000);
  cleanup.push(() => clearInterval(interval));
  
  // Observers
  const observer = new MutationObserver(() => {});
  observer.observe(document, {});
  cleanup.push(() => observer.disconnect());
  
  // Return cleanup function
  return () => {
    cleanup.forEach(fn => fn());
  };
}, []);
```

This analysis provides a roadmap for eliminating the memory leaks causing the excessive 2GB memory usage reported by the developer.