/**
 * Speech-to-Text Service with Deepgram SDK
 *
 * Handles real-time speech-to-text conversion with speaker diarization.
 * Uses Deepgram's official SDK for streaming audio transcription.
 */

import {
  createClient,
  LiveTranscriptionEvents,
  type LiveClient,
} from "@deepgram/sdk";

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
  private client: ReturnType<typeof createClient> | null = null;
  private connection: LiveClient | null = null;
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
    this.client = createClient(this.config.apiKey);
  }

  /**
   * Connect to Deepgram live transcription
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      console.warn("SpeechToText: Already connected");
      return;
    }

    if (!this.client) {
      throw new Error("Deepgram client not initialized");
    }

    // Clean up any previous connection before reconnecting
    if (this.connection) {
      try {
        this.connection.finish();
      } catch (_) {
        // ignore cleanup errors
      }
      this.connection = null;
    }

    return new Promise((resolve, reject) => {
      try {
        this.connection = this.client!.listen.live({
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

        this.connection.on(LiveTranscriptionEvents.Open, () => {
          this.isConnected = true;

          // Send keepAlive every 8s to prevent Deepgram's ~10s silence timeout
          this.clearKeepAlive();
          this.keepAliveInterval = setInterval(() => {
            if (this.connection && this.isConnected) {
              this.connection.keepAlive();
            }
          }, 8000);

          this.callbacks.onOpen?.();
          resolve();
        });

        this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
          this.handleTranscript(data);
        });

        this.connection.on(LiveTranscriptionEvents.SpeechStarted, () => {
          this.callbacks.onSpeechStarted?.();
        });

        this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
          this.callbacks.onUtteranceEnd?.();
        });

        this.connection.on(LiveTranscriptionEvents.Close, () => {
          this.isConnected = false;
          this.clearKeepAlive();
          this.callbacks.onClose?.();
        });

        this.connection.on(LiveTranscriptionEvents.Error, (error) => {
          this.callbacks.onError?.(new Error(String(error)));
          reject(error);
        });
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

  /**
   * Send audio data to Deepgram for transcription
   */
  sendAudio(audioData: ArrayBuffer | Uint8Array | Blob): void {
    if (!this.isConnected || !this.connection) {
      console.warn("SpeechToText: Not connected");
      return;
    }

    if (audioData instanceof Blob) {
      // Send Blob directly
      this.connection.send(audioData);
    } else if (audioData instanceof ArrayBuffer) {
      // Send ArrayBuffer directly
      this.connection.send(audioData);
    } else {
      // Uint8Array - get underlying ArrayBuffer
      this.connection.send(audioData.buffer as ArrayBuffer);
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
      // Send the chunk's underlying ArrayBuffer
      this.connection?.send(chunk.buffer as ArrayBuffer);

      // Small delay to prevent overwhelming the connection
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Signal end of audio stream
   */
  finishStream(): void {
    // Send empty ArrayBuffer to signal end
    this.connection?.send(new ArrayBuffer(0));
  }

  /**
   * Disconnect from Deepgram
   */
  disconnect(): void {
    this.clearKeepAlive();
    if (this.connection) {
      this.connection.finish();
      this.connection = null;
    }
    this.isConnected = false;
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
