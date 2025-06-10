import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import { atom, type WritableAtom } from 'nanostores';
import type { ITerminal } from '~/types/terminal';
import { newBoltShellProcess, newShellProcess } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';

export class TerminalStore {
  #webcontainer: Promise<WebContainer>;
  #terminals: Array<{ terminal: ITerminal; process: WebContainerProcess }> = [];
  #boltTerminal = newBoltShellProcess();
  #disposed = false;

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(true);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
    }

    // Cleanup on page unload
    if (typeof window !== 'undefined') {
      const cleanup = () => this.dispose();
      window.addEventListener('beforeunload', cleanup);
      window.addEventListener('unload', cleanup);
    }
  }
  get boltTerminal() {
    return this.#boltTerminal;
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }
  async attachBoltTerminal(terminal: ITerminal) {
    try {
      const wc = await this.#webcontainer;
      await this.#boltTerminal.init(wc, terminal);
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn bolt shell\n\n') + error.message);
      return;
    }
  }

  async attachTerminal(terminal: ITerminal) {
    if (this.#disposed) {
      console.warn('Cannot attach terminal to disposed TerminalStore');
      return;
    }

    try {
      const shellProcess = await newShellProcess(await this.#webcontainer, terminal);
      this.#terminals.push({ terminal, process: shellProcess });
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn shell\n\n') + error.message);
      return;
    }
  }

  async detachTerminal(terminal: ITerminal) {
    const index = this.#terminals.findIndex(t => t.terminal === terminal);
    if (index >= 0) {
      const { process } = this.#terminals[index];
      
      try {
        // Kill the process if it's still running
        if (!process.killed) {
          await process.kill();
        }
      } catch (error) {
        console.warn('Error killing terminal process:', error);
      }
      
      // Remove from the array
      this.#terminals.splice(index, 1);
    }
  }

  async detachAllTerminals() {
    const terminalPromises = this.#terminals.map(async ({ process, terminal }) => {
      try {
        if (!process.killed) {
          await process.kill();
        }
      } catch (error) {
        console.warn('Error killing terminal process:', error);
      }
    });

    await Promise.allSettled(terminalPromises);
    this.#terminals = [];
  }

  onTerminalResize(cols: number, rows: number) {
    for (const { process } of this.#terminals) {
      if (!process.killed) {
        try {
          process.resize({ cols, rows });
        } catch (error) {
          console.warn('Error resizing terminal:', error);
        }
      }
    }
  }

  async dispose() {
    if (this.#disposed) return;
    
    this.#disposed = true;
    
    // Clean up all terminals
    await this.detachAllTerminals();
    
    // Clean up bolt terminal
    try {
      await this.#boltTerminal.dispose?.();
    } catch (error) {
      console.warn('Error disposing bolt terminal:', error);
    }
  }

  getActiveTerminalCount(): number {
    return this.#terminals.filter(({ process }) => !process.killed).length;
  }
}
