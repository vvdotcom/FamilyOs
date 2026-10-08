// Hold-to-talk voice input for the phone web app: the browser's own speech recognition (Chrome, Edge,
// Safari on iPhone) turns speech into text, and the browser's speech synthesis reads Hometide's reply aloud.
// Platforms without it (the native Expo app, Firefox) fall back to typing, where the keyboard's mic works.

type SpeechAlternative = { transcript: string };
type SpeechResult = { isFinal: boolean; length: number; [index: number]: SpeechAlternative };
type SpeechEvent = { resultIndex: number; results: { length: number; [index: number]: SpeechResult } };
type SpeechErrorEvent = { error?: string };
type BrowserRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => BrowserRecognition;

type SpeechWindow = {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
  speechSynthesis?: { speak(utterance: unknown): void; cancel(): void };
  SpeechSynthesisUtterance?: new (text: string) => { lang: string; rate: number };
  navigator?: { language?: string };
};

const browser = (): SpeechWindow | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as SpeechWindow);

function recognitionClass(w: SpeechWindow | undefined): RecognitionConstructor | undefined {
  return w?.SpeechRecognition || w?.webkitSpeechRecognition;
}

/** True when holding the mic can listen; otherwise the mic opens a text box. */
export function speechSupported(w: SpeechWindow | undefined = browser()): boolean {
  return !!recognitionClass(w);
}

/** Everything heard so far: finished phrases, then the phrase still being spoken. */
export function transcriptOf(results: SpeechEvent['results']): { text: string; final: boolean } {
  const parts: string[] = [];
  let final = results.length > 0;
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result && result.length > 0) parts.push(result[0].transcript.trim());
    if (!result?.isFinal) final = false;
  }
  return { text: parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(), final };
}

/** What to tell someone when listening failed. */
export function speechErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Hometide can’t use the microphone. Allow it in your browser settings, or type instead.';
    case 'audio-capture':
      return 'No microphone was found. You can type instead.';
    case 'network':
      return 'Voice needs a connection. Check your internet and try again.';
    case 'no-speech':
      return 'I didn’t hear anything. Hold the mic while you talk.';
    default:
      return 'Voice stopped unexpectedly. Hold the mic and try again, or type instead.';
  }
}

export type Listener = {
  /** Stop listening and deliver what was heard to `onDone`. */
  finish(): void;
  /** Stop listening and drop what was heard. */
  cancel(): void;
};

/**
 * Starts listening. `onText` gets the live transcript; `onDone` is called once, after `finish()` (the mic
 * was released) and the browser has delivered its last words, with the full transcript ('' if nothing).
 */
export function listen(
  handlers: { onText: (text: string) => void; onDone: (text: string) => void; onError: (message: string) => void },
  w: SpeechWindow | undefined = browser(),
): Listener | null {
  const Recognition = recognitionClass(w);
  if (!Recognition) return null;
  const recognition = new Recognition();
  recognition.lang = w?.navigator?.language || 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  let heard = '';
  let released = false;
  let ended = false;
  let settled = false;
  let failed = false;
  const settle = () => {
    // Safari can stop on its own after a pause while the mic is still held: wait for the release.
    if (settled || failed || !released || !ended) return;
    settled = true;
    handlers.onDone(heard);
  };
  recognition.onresult = (event) => {
    heard = transcriptOf(event.results).text;
    handlers.onText(heard);
  };
  recognition.onerror = (event) => {
    // 'no-speech' ends the session; releasing with nothing heard is explained by onDone('').
    if (event.error === 'aborted' || event.error === 'no-speech') return;
    failed = true;
    handlers.onError(speechErrorMessage(event.error));
  };
  recognition.onend = () => {
    ended = true;
    settle();
  };
  try {
    recognition.start();
  } catch {
    return null;
  }
  return {
    finish() {
      if (released) return;
      released = true;
      if (ended) settle();
      else {
        try {
          recognition.stop();
        } catch {
          ended = true;
          settle();
        }
      }
    },
    cancel() {
      settled = true;
      try {
        recognition.abort();
      } catch {
        // Already stopped.
      }
    },
  };
}

/** iPhone Safari only speaks from a tap: call this from the press so the later reply can be read aloud. */
export function primeSpeech(w: SpeechWindow | undefined = browser()): void {
  if (!w?.speechSynthesis || !w.SpeechSynthesisUtterance) return;
  try {
    w.speechSynthesis.speak(new w.SpeechSynthesisUtterance(''));
  } catch {
    // Speech output is optional.
  }
}

/** Reads Hometide's reply aloud where the browser can. */
export function speak(text: string, w: SpeechWindow | undefined = browser()): void {
  if (!text.trim() || !w?.speechSynthesis || !w.SpeechSynthesisUtterance) return;
  try {
    w.speechSynthesis.cancel();
    const utterance = new w.SpeechSynthesisUtterance(text);
    utterance.lang = w.navigator?.language || 'en-US';
    utterance.rate = 1;
    w.speechSynthesis.speak(utterance);
  } catch {
    // Speech output is optional.
  }
}

export function stopSpeaking(w: SpeechWindow | undefined = browser()): void {
  try {
    w?.speechSynthesis?.cancel();
  } catch {
    // Speech output is optional.
  }
}
