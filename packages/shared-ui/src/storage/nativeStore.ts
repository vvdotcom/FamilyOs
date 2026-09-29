/**
 * Small key/value store for native (non-web) targets.
 *
 * This default implementation keeps values in memory, which preserves the previous
 * session-only behavior for the Expo native preview. The Vega build resolves
 * `nativeStore.vega.ts` instead (Metro prefers the `.vega.ts` extension) and persists values
 * on the device.
 */
export interface NativeStore {
  readonly persistent: boolean;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const memory = new Map<string, string>();

export const nativeStore: NativeStore = {
  persistent: false,
  async getItem(key) {
    return memory.has(key) ? memory.get(key)! : null;
  },
  async setItem(key, value) {
    memory.set(key, value);
  },
  async removeItem(key) {
    memory.delete(key);
  },
};
