/**
 * Service Worker Registration
 * Registers and manages the service worker lifecycle
 */

export class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private updateAvailable: boolean = false;

  /**
   * Register the service worker
   */
  async register(): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.log('[SW] Service workers not supported');
      return;
    }

    // Only register in production or if explicitly enabled
    const shouldRegister = 
      process.env.NODE_ENV === 'production' || 
      process.env.NEXT_PUBLIC_ENABLE_SW === 'true';

    if (!shouldRegister) {
      console.log('[SW] Service worker registration skipped (development mode)');
      return;
    }

    try {
      // Wait for window load to not impact initial page load
      await this.waitForWindowLoad();

      console.log('[SW] Registering service worker...');
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });

      console.log('[SW] Service worker registered successfully');

      // Set up event listeners
      this.setupEventListeners();

      // Check for updates
      this.checkForUpdates();

      // Handle initial controller
      if (navigator.serviceWorker.controller) {
        console.log('[SW] Page is already controlled');
      }
    } catch (error) {
      console.error('[SW] Service worker registration failed:', error);
    }
  }

  /**
   * Wait for window load event
   */
  private waitForWindowLoad(): Promise<void> {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', () => resolve());
      }
    });
  }

  /**
   * Set up service worker event listeners
   */
  private setupEventListeners(): void {
    if (!this.registration) return;

    // Listen for updates
    this.registration.addEventListener('updatefound', () => {
      console.log('[SW] Update found');
      const newWorker = this.registration!.installing;

      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[SW] New service worker available');
            this.updateAvailable = true;
            this.notifyUpdateAvailable();
          }
        });
      }
    });

    // Listen for controller change
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[SW] Controller changed, reloading page...');
      window.location.reload();
    });

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      this.handleServiceWorkerMessage(event);
    });
  }

  /**
   * Check for service worker updates
   */
  async checkForUpdates(): Promise<void> {
    if (!this.registration) return;

    try {
      await this.registration.update();
      console.log('[SW] Checked for updates');
    } catch (error) {
      console.error('[SW] Update check failed:', error);
    }
  }

  /**
   * Notify user that an update is available
   */
  private notifyUpdateAvailable(): void {
    // Check if we have a notification system
    if (typeof window !== 'undefined' && window.showNotification) {
      window.showNotification({
        title: 'Update Available',
        message: 'A new version of Rumbledore is available. Click to update.',
        action: () => this.applyUpdate(),
      });
    }

    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('sw-update-available'));
  }

  /**
   * Apply the service worker update
   */
  async applyUpdate(): Promise<void> {
    if (!this.registration?.waiting) {
      console.log('[SW] No update waiting');
      return;
    }

    console.log('[SW] Applying update...');

    // Tell the waiting service worker to activate
    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // The controllerchange event will reload the page
  }

  /**
   * Handle messages from service worker
   */
  private handleServiceWorkerMessage(event: MessageEvent): void {
    const { data } = event;

    switch (data.type) {
      case 'CACHE_UPDATED':
        console.log('[SW] Cache updated:', data.payload);
        break;
      case 'OFFLINE_READY':
        console.log('[SW] Offline mode ready');
        break;
      case 'SYNC_COMPLETE':
        console.log('[SW] Background sync complete');
        break;
      default:
        console.log('[SW] Unknown message:', data);
    }
  }

  /**
   * Unregister the service worker
   */
  async unregister(): Promise<void> {
    if (!this.registration) return;

    try {
      const success = await this.registration.unregister();
      if (success) {
        console.log('[SW] Service worker unregistered');
        this.registration = null;
      }
    } catch (error) {
      console.error('[SW] Unregistration failed:', error);
    }
  }

  /**
   * Clear all caches
   */
  async clearCache(): Promise<void> {
    if (!('caches' in window)) return;

    try {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
      console.log('[SW] All caches cleared');

      // Also tell service worker to clear its caches
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
      }
    } catch (error) {
      console.error('[SW] Cache clear failed:', error);
    }
  }

  /**
   * Get cache storage estimate
   */
  async getCacheSize(): Promise<{ usage: number; quota: number } | null> {
    if (!('storage' in navigator && 'estimate' in navigator.storage)) {
      return null;
    }

    try {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
      };
    } catch (error) {
      console.error('[SW] Storage estimate failed:', error);
      return null;
    }
  }

  /**
   * Request persistent storage
   */
  async requestPersistentStorage(): Promise<boolean> {
    if (!('storage' in navigator && 'persist' in navigator.storage)) {
      return false;
    }

    try {
      const granted = await navigator.storage.persist();
      console.log(`[SW] Persistent storage ${granted ? 'granted' : 'denied'}`);
      return granted;
    } catch (error) {
      console.error('[SW] Persistent storage request failed:', error);
      return false;
    }
  }

  /**
   * Check if update is available
   */
  hasUpdate(): boolean {
    return this.updateAvailable;
  }

  /**
   * Get registration status
   */
  getStatus(): 'registered' | 'not-registered' | 'not-supported' {
    if (!('serviceWorker' in navigator)) {
      return 'not-supported';
    }
    return this.registration ? 'registered' : 'not-registered';
  }
}

// Singleton instance
export const swManager = new ServiceWorkerManager();

// Auto-register on import (for production)
if (typeof window !== 'undefined') {
  swManager.register();
}

// Extend window interface for notifications
declare global {
  interface Window {
    showNotification?: (options: {
      title: string;
      message: string;
      action?: () => void;
    }) => void;
  }
}

export default swManager;