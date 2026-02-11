/**
 * Speech-to-Text Service with Deepgram
 *
 * Handles real-time speech-to-text conversion with speaker diarization.
 * Uses the Deepgram SDK on web and a direct WebSocket connection on native
 * (React Native) to avoid Node.js-only dependencies like `stream`.
 */

import { Platform } from "react-native";

// ── SDK imports via platform-specific files ─────────────────────────────────
// Metro resolves deepgramSdk.web.ts on web (real SDK) and
// deepgramSdk.native.ts on iOS/Android (null stubs), so the SDK's
// Node.js-only deps (ws → stream, http, crypto) are never bundled on native.
import { createClient, LiveTranscriptionEvents } from "./deepgramSdk";

// ============================================
// Types
// ============================================

export interface TranscriptionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  speaker?: number;
  start: number;
  end: number;
  words?: Word[];
}

export interface Word {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
}

export interface SpeechToTextConfig {
  apiKey: string;
  language?: string;
  model?: "nova-3" | "nova-2" | "nova" | "enhanced" | "base";
  enableDiarization?: boolean;
  maxSpeakers?: number;
  punctuate?: boolean;
  interimResults?: boolean;
  sampleRate?: number;
  smartFormat?: boolean;
}

export interface SpeechToTextCallbacks {
  onTranscript?: (result: TranscriptionResult) => void;
  onSpeechStarted?: () => void;
  onUtteranceEnd?: () => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

const DEFAULT_CONFIG: Partial<SpeechToTextConfig> = {
  language: "en",
  model: "nova-3",
  enableDiarization: true,
  maxSpeakers: 4,
  punctuate: true,
  interimResults: true,
  sampleRate: 16000,
  smartFormat: true,
};

// ============================================
// Speech to Text Service
// ============================================

export class SpeechToTextService {
  // SDK-based connection (web)
  private client: any = null;
  private sdkConnection: any = null;

  // Raw WebSocket connection (native)
  private nativeWs: WebSocket | null = null;

  private config: SpeechToTextConfig;
  private callbacks: SpeechToTextCallbacks;
  private isConnected = false;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    config: SpeechToTextConfig,
    callbacks: SpeechToTextCallbacks = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;

    if (Platform.OS === "web" && createClient) {
      this.client = createClient(this.config.apiKey);
    }
  }

  /**
   * Connect to Deepgram live transcription
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      console.warn("SpeechToText: Already connected");
      return;
    }

    // Clean up any previous connection
    this.cleanupConnection();

    if (Platform.OS === "web") {
      return this.connectWeb();
    } else {
      return this.connectNative();
    }
  }

  // ── Web: use Deepgram SDK ─────────────────────────────────────────────────
  private connectWeb(): Promise<void> {
    if (!this.client) {
      throw new Error("Deepgram client not initialized");
    }

    return new Promise((resolve, reject) => {
      try {
        this.sdkConnection = this.client.listen.live({
          model: this.config.model || "nova-3",
          language: this.config.language || "en",
          smart_format: this.config.smartFormat ?? true,
          punctuate: this.config.punctuate ?? true,
          interim_results: this.config.interimResults ?? true,
          diarize: this.config.enableDiarization ?? true,
          sample_rate: this.config.sampleRate || 16000,
          channels: 1,
          encoding: "linear16",
        });

        this.sdkConnection.on(LiveTranscriptionEvents.Open, () => {
          this.isConnected = true;
          this.startKeepAlive();
          this.callbacks.onOpen?.();
          resolve();
        });

        this.sdkConnection.on(
          LiveTranscriptionEvents.Transcript,
          (data: any) => {
            this.handleTranscript(data);
          },
        );

        this.sdkConnection.on(LiveTranscriptionEvents.SpeechStarted, () => {
          this.callbacks.onSpeechStarted?.();
        });

        this.sdkConnection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
          this.callbacks.onUtteranceEnd?.();
        });

        this.sdkConnection.on(LiveTranscriptionEvents.Close, () => {
          this.isConnected = false;
          this.clearKeepAlive();
          this.callbacks.onClose?.();
        });

        this.sdkConnection.on(LiveTranscriptionEvents.Error, (error: any) => {
          this.callbacks.onError?.(new Error(String(error)));
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // ── Native (iOS / Android): direct WebSocket to Deepgram REST-streaming ──
  private connectNative(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const params = new URLSearchParams({
          model: this.config.model || "nova-3",
          language: this.config.language || "en",
          smart_format: String(this.config.smartFormat ?? true),
          punctuate: String(this.config.punctuate ?? true),
          interim_results: String(this.config.interimResults ?? true),
          diarize: String(this.config.enableDiarization ?? true),
          sample_rate: String(this.config.sampleRate || 16000),
          channels: "1",
          encoding: "linear16",
        });

        const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

        // React Native's WebSocket supports a 3rd arg for headers at runtime,
        // but the TS types only declare 2 params – cast to bypass.
        this.nativeWs = new (WebSocket as any)(url, [], {
          headers: { Authorization: `Token ${this.config.apiKey}` },
        });

        const ws = this.nativeWs!;
        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
          console.log("SpeechToText (native): WebSocket opened");
          this.isConnected = true;
          this.startKeepAlive();
          this.callbacks.onOpen?.();
          resolve();
        };

        ws.onmessage = (event: WebSocketMessageEvent) => {
          try {
            const data = JSON.parse(
              typeof event.data === "string"
                ? event.data
                : new TextDecoder().decode(event.data),
            );

            // Map Deepgram JSON message types
            if (data.type === "Results") {
              this.handleTranscript(data);
            } else if (data.type === "SpeechStarted") {
              this.callbacks.onSpeechStarted?.();
            } else if (data.type === "UtteranceEnd") {
              this.callbacks.onUtteranceEnd?.();
            }
          } catch (e) {
            console.warn("SpeechToText (native): failed to parse message", e);
          }
        };

        ws.onclose = () => {
          console.log("SpeechToText (native): WebSocket closed");
          this.isConnected = false;
          this.clearKeepAlive();
          this.callbacks.onClose?.();
        };

        ws.onerror = (event: Event) => {
          console.error("SpeechToText (native): WebSocket error", event);
          this.callbacks.onError?.(
            new Error("Native WebSocket error: " + String(event)),
          );
          reject(event);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle transcript data from Deepgram
   */
  private handleTranscript(data: any): void {
    if (!data.channel?.alternatives?.[0]) return;

    const alternative = data.channel.alternatives[0];
    const transcript = alternative.transcript;

    if (!transcript) return;

    const words = alternative.words || [];

    const result: TranscriptionResult = {
      transcript,
      confidence: alternative.confidence || 0,
      isFinal: data.is_final || false,
      start: data.start || 0,
      end: data.start + data.duration || 0,
      words: words.map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: w.confidence,
        speaker: w.speaker,
      })),
    };

    // Extract speaker from words if diarization is enabled
    if (this.config.enableDiarization && words.length > 0) {
      const speakerCounts = words.reduce(
        (acc: Record<number, number>, w: any) => {
          if (w.speaker !== undefined) {
            acc[w.speaker] = (acc[w.speaker] || 0) + 1;
          }
          return acc;
        },
        {},
      );

      const dominantSpeaker = Object.entries(speakerCounts).sort(
        ([, a], [, b]) => (b as number) - (a as number),
      )[0];

      if (dominantSpeaker) {
        result.speaker = parseInt(dominantSpeaker[0]);
      }
    }

    this.callbacks.onTranscript?.(result);
  }

  // ── Helpers shared by both paths ────────────────────────────────────────────

  /**
   * Start keepAlive pings to prevent Deepgram's ~10 s silence timeout
   */
  private startKeepAlive(): void {
    this.clearKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      if (!this.isConnected) return;
      try {
        if (Platform.OS === "web" && this.sdkConnection) {
          this.sdkConnection.keepAlive();
        } else if (
          this.nativeWs &&
          this.nativeWs.readyState === WebSocket.OPEN
        ) {
          this.nativeWs.send(JSON.stringify({ type: "KeepAlive" }));
        }
      } catch (e) {
        console.warn("SpeechToText: keepAlive failed", e);
      }
    }, 8000);
  }

  /**
   * Clear the keepAlive interval
   */
  private clearKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * Tear down whichever connection is active
   */
  private cleanupConnection(): void {
    this.clearKeepAlive();
    try {
      if (Platform.OS === "web" && this.sdkConnection) {
        this.sdkConnection.finish();
      } else if (this.nativeWs) {
        this.nativeWs.close();
      }
    } catch (_) {
      /* ignore */
    }
    this.sdkConnection = null;
    this.nativeWs = null;
    this.isConnected = false;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Send audio data to Deepgram for transcription
   */
  sendAudio(audioData: ArrayBuffer | Uint8Array | Blob): void {
    if (!this.isConnected) {
      console.warn("SpeechToText: Not connected");
      return;
    }

    const send = (payload: ArrayBuffer | Blob) => {
      if (Platform.OS === "web" && this.sdkConnection) {
        this.sdkConnection.send(payload);
      } else if (this.nativeWs && this.nativeWs.readyState === WebSocket.OPEN) {
        this.nativeWs.send(payload);
      }
    };

    if (audioData instanceof Blob) {
      send(audioData);
    } else if (audioData instanceof ArrayBuffer) {
      send(audioData);
    } else {
      // Uint8Array – get underlying ArrayBuffer
      send(audioData.buffer as ArrayBuffer);
    }
  }

  /**
   * Stream audio blob in chunks
   */
  async streamAudioBlob(blob: Blob, chunkSize = 4096): Promise<void> {
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      this.sendAudio(chunk);
      // Small delay to prevent overwhelming the connection
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Signal end of audio stream
   */
  finishStream(): void {
    this.sendAudio(new ArrayBuffer(0));
  }

  /**
   * Disconnect from Deepgram
   */
  disconnect(): void {
    this.cleanupConnection();
  }

  /**
   * Check if currently connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Update callbacks
   */
  setCallbacks(callbacks: Partial<SpeechToTextCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a pre-configured speech-to-text service instance
 */
export function createSpeechToTextService(
  apiKey: string,
  options?: Partial<Omit<SpeechToTextConfig, "apiKey">>,
  callbacks?: SpeechToTextCallbacks,
): SpeechToTextService {
  return new SpeechToTextService({ apiKey, ...options }, callbacks);
}

/**
 * Hook-friendly factory for React components
 */
export function useSpeechToTextConfig(apiKey: string): SpeechToTextConfig {
  return {
    apiKey,
    ...DEFAULT_CONFIG,
  } as SpeechToTextConfig;
}
