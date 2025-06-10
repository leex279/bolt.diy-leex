import { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '~/utils/constants';
import { cleanStackTrace } from '~/utils/stacktrace';

interface WebContainerContext {
  loaded: boolean;
  eventListeners: Map<string, (message: any) => void>;
  cleanup?: () => void;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
  eventListeners: new Map(),
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr
});

if (!import.meta.env.SSR) {
  webcontainer =
    import.meta.hot?.data.webcontainer ??
    Promise.resolve()
      .then(() => {
        return WebContainer.boot({
          coep: 'credentialless',
          workdirName: WORK_DIR_NAME,
          forwardPreviewErrors: true, // Enable error forwarding from iframes
        });
      })
      .then(async (webcontainer) => {
        webcontainerContext.loaded = true;

        const { workbenchStore } = await import('~/lib/stores/workbench');

        const response = await fetch('/inspector-script.js');
        const inspectorScript = await response.text();
        await webcontainer.setPreviewScript(inspectorScript);

        // Create a tracked preview message handler
        const previewMessageHandler = (message: any) => {
          console.log('WebContainer preview message:', message);

          // Handle both uncaught exceptions and unhandled promise rejections
          if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
            const isPromise = message.type === 'PREVIEW_UNHANDLED_REJECTION';
            const title = isPromise ? 'Unhandled Promise Rejection' : 'Uncaught Exception';
            workbenchStore.actionAlert.set({
              type: 'preview',
              title,
              description: 'message' in message ? message.message : 'Unknown error',
              content: `Error occurred at ${message.pathname}${message.search}${message.hash}\nPort: ${message.port}\n\nStack trace:\n${cleanStackTrace(message.stack || '')}`,
              source: 'preview',
            });
          }
        };

        // Track and listen for preview errors
        webcontainerContext.eventListeners.set('preview-message', previewMessageHandler);
        webcontainer.on('preview-message', previewMessageHandler);

        // Set up cleanup function
        webcontainerContext.cleanup = () => {
          webcontainerContext.eventListeners.forEach((handler, eventName) => {
            try {
              webcontainer.off(eventName as any, handler);
            } catch (error) {
              console.warn(`Error removing WebContainer listener for ${eventName}:`, error);
            }
          });
          webcontainerContext.eventListeners.clear();
        };

        // Clean up on page unload
        if (typeof window !== 'undefined') {
          const handleUnload = () => {
            webcontainerContext.cleanup?.();
          };
          
          window.addEventListener('beforeunload', handleUnload);
          window.addEventListener('unload', handleUnload);
          
          // Also handle hot module replacement cleanup
          if (import.meta.hot) {
            import.meta.hot.dispose(() => {
              webcontainerContext.cleanup?.();
            });
          }
        }

        return webcontainer;
      });

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = webcontainer;
  }
}
