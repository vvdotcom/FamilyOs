import { createContext, MutableRefObject, useContext, useEffect } from 'react';

export const PageBackContext = createContext<MutableRefObject<(() => void) | null> | null>(null);
export function usePageBack(handler: () => void, enabled: boolean) {
  const target = useContext(PageBackContext);
  useEffect(() => {
    if (!target || !enabled) return;
    target.current = handler;
    return () => {
      if (target.current === handler) target.current = null;
    };
  }, [target, handler, enabled]);
}
