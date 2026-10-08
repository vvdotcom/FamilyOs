import React from 'react';
import { Text, View } from 'react-native';

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsShape = { getGlobalHandler: () => GlobalHandler; setGlobalHandler: (handler: GlobalHandler) => void };

const listeners = new Set<(error: Error) => void>();
let guardInstalled = false;

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** Writes to the device log (`loggingctl log` on Vega), tagged so it is easy to find. */
export function logAppError(where: string, error: Error) {
  console.error(`[Hometide] ${where}: ${error.message}\n${error.stack ?? ''}`);
}

/**
 * In a release build, an error thrown from a timer or a network callback is fatal and closes the app. On a TV that
 * looks like a crash with no explanation, so send it to the boundary instead, which redraws the app from Home.
 * Development builds keep React Native's red error screen.
 */
export function installGlobalErrorGuard() {
  if (guardInstalled) return;
  guardInstalled = true;
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  if (!utils || typeof utils.getGlobalHandler !== 'function') return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((value, isFatal) => {
    const error = asError(value);
    logAppError(isFatal ? 'fatal error' : 'error', error);
    const dev = typeof __DEV__ !== 'undefined' && __DEV__;
    if (!dev && listeners.size) {
      listeners.forEach((listener) => listener(error));
      return;
    }
    previous(value, isFatal);
  });
}

// Waits before redrawing: 3 seconds, then longer if the same problem keeps coming back.
const RETRY_MS = [3_000, 10_000, 30_000];

type State = { error: Error | null; attempt: number; generation: number };

/** Keeps one broken screen or bad piece of data from closing the whole app: shows a short notice, then restarts. */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, attempt: 0, generation: 0 };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private recovered: ReturnType<typeof setTimeout> | undefined;
  private onGlobalError = (error: Error) => this.fail(error);

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidMount() {
    installGlobalErrorGuard();
    listeners.add(this.onGlobalError);
  }

  componentWillUnmount() {
    listeners.delete(this.onGlobalError);
    if (this.timer) clearTimeout(this.timer);
    if (this.recovered) clearTimeout(this.recovered);
  }

  componentDidCatch(error: Error) {
    logAppError('screen error', error);
    this.scheduleRestart();
  }

  private fail(error: Error) {
    if (this.state.error) return;
    this.setState({ error });
    this.scheduleRestart();
  }

  private scheduleRestart() {
    if (this.timer) return;
    if (this.recovered) clearTimeout(this.recovered);
    const wait = RETRY_MS[Math.min(this.state.attempt, RETRY_MS.length - 1)];
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.setState((current) => ({ error: null, attempt: current.attempt + 1, generation: current.generation + 1 }));
      // A minute without trouble resets the waiting time.
      this.recovered = setTimeout(() => this.setState({ attempt: 0 }), 60_000);
    }, wait);
  }

  render() {
    if (this.state.error) {
      return (
        <View
          accessibilityRole="alert"
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#14161C', padding: 48 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 44, fontWeight: '700', marginBottom: 16 }}>Hometide hit a snag</Text>
          <Text style={{ color: '#C9CED8', fontSize: 28 }}>Restarting in a moment…</Text>
        </View>
      );
    }
    return <React.Fragment key={this.state.generation}>{this.props.children}</React.Fragment>;
  }
}
