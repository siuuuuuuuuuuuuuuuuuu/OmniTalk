/**
 * Speech-to-Text Service with Deepgram Integration
 *
 * Handles real-time speech-to-text conversion with speaker diarization.
 * Uses Deepgram's WebSocket API for streaming audio transcription.
 */

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
  model?: "nova-2" | "nova" | "enhanced" | "base";
  enableDiarization?: boolean;
  maxSpeakers?: number;
  punctuate?: boolean;
  interimResults?: boolean;
  sampleRate?: number;
  encoding?:
    | "linear16"
    | "flac"
    | "mulaw"
    | "amr-nb"
    | "amr-wb"
    | "opus"
    | "speex";
  channels?: number;
}

export interface SpeechToTextCallbacks {
  onTranscript?: (result: TranscriptionResult) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

const DEFAULT_CONFIG: Partial<SpeechToTextConfig> = {
  language: "en-US",
  model: "nova-2",
  enableDiarization: true,
  maxSpeakers: 4,
  punctuate: true,
  interimResults: true,
  sampleRate: 16000,
  encoding: "linear16",
  channels: 1,
};

export class SpeechToTextService {
  private ws: WebSocket | null = null;
  private config: SpeechToTextConfig;
  private callbacks: SpeechToTextCallbacks;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  constructor(
    config: SpeechToTextConfig,
    callbacks: SpeechToTextCallbacks = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  /**
   * Build the Deepgram WebSocket URL with query parameters
   */
  private buildWebSocketUrl(): string {
    const baseUrl = "wss://api.deepgram.com/v1/listen";
    const params = new URLSearchParams();

    params.append("language", this.config.language || "en-US");
    params.append("model", this.config.model || "nova-2");
    params.append("punctuate", String(this.config.punctuate ?? true));
    params.append(
      "interim_results",
      String(this.config.interimResults ?? true),
    );
    params.append("sample_rate", String(this.config.sampleRate || 16000));
    params.append("encoding", this.config.encoding || "linear16");
    params.append("channels", String(this.config.channels || 1));

    // Enable diarization if configured
    if (this.config.enableDiarization) {
      params.append("diarize", "true");
      if (this.config.maxSpeakers) {
        params.append("diarize_version", "2");
      }
    }

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Connect to Deepgram WebSocket API
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      console.warn("SpeechToText: Already connected");
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const url = this.buildWebSocketUrl();

        this.ws = new WebSocket(url, ["token", this.config.apiKey]);

        this.ws.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.callbacks.onOpen?.();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          const err = new Error("WebSocket error occurred");
          this.callbacks.onError?.(err);
          reject(err);
        };

        this.ws.onclose = (event) => {
          this.isConnected = false;
          this.callbacks.onClose?.();

          // Attempt reconnection if not a clean close
          if (
            !event.wasClean &&
            this.reconnectAttempts < this.maxReconnectAttempts
          ) {
            this.reconnectAttempts++;
            setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Parse and handle incoming messages from Deepgram
   */
  private handleMessage(data: string): void {
    try {
      const response = JSON.parse(data);

      // Check for transcription results
      if (response.type === "Results" && response.channel?.alternatives?.[0]) {
        const alternative = response.channel.alternatives[0];
        const words = alternative.words || [];

        const result: TranscriptionResult = {
          transcript: alternative.transcript || "",
          confidence: alternative.confidence || 0,
          isFinal: response.is_final || false,
          start: response.start || 0,
          end: response.start + response.duration || 0,
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
          // Get the most common speaker in this segment
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

      // Handle errors from Deepgram
      if (response.type === "Error") {
        this.callbacks.onError?.(
          new Error(response.message || "Deepgram error"),
        );
      }
    } catch (error) {
      console.error("SpeechToText: Failed to parse message", error);
    }
  }

  /**
   * Send audio data to Deepgram for transcription
   */
  sendAudio(audioData: ArrayBuffer | Blob): void {
    if (!this.isConnected || !this.ws) {
      console.warn("SpeechToText: Not connected");
      return;
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      console.warn("SpeechToText: WebSocket not open");
      return;
    }

    this.ws.send(audioData);
  }

  /**
   * Send audio stream chunk by chunk
   */
  async streamAudioBlob(blob: Blob, chunkSize = 4096): Promise<void> {
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      this.sendAudio(chunk.buffer);

      // Small delay to prevent overwhelming the connection
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Signal end of audio stream
   */
  finishStream(): void {
    if (!this.isConnected || !this.ws) {
      return;
    }

    // Send empty byte to signal end of stream
    this.ws.send(new Uint8Array(0));
  }

  /**
   * Disconnect from Deepgram
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
    this.isConnected = false;
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
