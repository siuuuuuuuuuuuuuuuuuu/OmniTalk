/**
 * RealtimeSocket - WebSocket Communication Service
 * Person 5: Integration & WebSocket Communication
 *
 * Handles real-time bidirectional communication between clients and backend.
 * Manages transcript streaming, sign detection results, and user presence.
 */

import type {
    SignDetectionPayload,
    SignToTextResult,
    TranscriptPayload,
    TranscriptSegment,
    User,
    UserEventPayload,
    WebSocketMessage,
    WebSocketMessageType,
} from "@/types";

import { WEBSOCKET_URL } from "@/constants/api";

// ============================================
// Configuration
// ============================================

export interface RealtimeSocketConfig {
  url: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
  roomId?: string;
  userId?: string;
}

const DEFAULT_CONFIG: Partial<RealtimeSocketConfig> = {
  reconnectAttempts: 5,
  reconnectDelay: 1000,
  heartbeatInterval: 30000,
};

// ============================================
// Callbacks
// ============================================

export interface RealtimeSocketCallbacks {
  onConnect?: () => void;
  onDisconnect?: (reason?: string) => void;
  onReconnecting?: (attempt: number) => void;
  onTranscript?: (segment: TranscriptSegment) => void;
  onSignDetection?: (result: SignToTextResult & { userId: string }) => void;
  onUserJoined?: (user: User) => void;
  onUserLeft?: (user: User) => void;
  onSpeakerChange?: (speakerId: string) => void;
  onError?: (error: Error) => void;
}

// ============================================
// Realtime Socket Service
// ============================================

export class RealtimeSocketService {
  private config: RealtimeSocketConfig;
  private callbacks: RealtimeSocketCallbacks;
  private ws: WebSocket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageQueue: WebSocketMessage[] = [];

  constructor(
    url: string,
    callbacks: RealtimeSocketCallbacks = {},
    config?: Partial<RealtimeSocketConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, url, ...config };
    this.callbacks = callbacks;
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      console.warn("RealtimeSocket: Already connected");
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const url = this.buildUrl();
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.callbacks.onConnect?.();
          this.startHeartbeat();
          this.flushMessageQueue();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = () => {
          const error = new Error("WebSocket connection error");
          this.callbacks.onError?.(error);
          reject(error);
        };

        this.ws.onclose = (event) => {
          this.handleClose(event);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Build WebSocket URL with query parameters
   */
  private buildUrl(): string {
    // Start with the base URL (e.g., ws://192.168.1.X:8000/ws)
    let urlString = this.config.url;

    // Append roomId as a path parameter
    if (this.config.roomId) {
      urlString += `/${this.config.roomId}`;
    } else {
      // Handle case where roomId is not provided, maybe default or throw error
      console.warn("RealtimeSocket: roomId is not provided. Using 'default'.");
      urlString += "/default"; // Default to 'default' room
    }

    const url = new URL(urlString);

    // Add userId as a query parameter
    if (this.config.userId) {
      url.searchParams.set("userId", this.config.userId);
    } else {
      console.warn("RealtimeSocket: userId is not provided. Using 'anonymous'.");
      url.searchParams.set("userId", "anonymous"); // Default to 'anonymous' user
    }

    return url.toString();
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data);

      switch (message.type) {
        case "transcript":
          this.handleTranscript(message.payload as TranscriptPayload);
          break;

        case "sign_detection":
          this.handleSignDetection(message.payload as SignDetectionPayload);
          break;

        case "user_joined":
          this.handleUserJoined(message.payload as UserEventPayload);
          break;

        case "user_left":
          this.handleUserLeft(message.payload as UserEventPayload);
          break;

        case "speaker_change":
          this.callbacks.onSpeakerChange?.(message.payload as string);
          break;

        case "pong":
          // Heartbeat acknowledged
          break;

        case "error":
          this.callbacks.onError?.(new Error(message.payload as string));
          break;

        default:
          console.warn("RealtimeSocket: Unknown message type", message.type);
      }
    } catch (error) {
      console.error("RealtimeSocket: Failed to parse message", error);
    }
  }

  /**
   * Handle transcript message
   */
  private handleTranscript(payload: TranscriptPayload): void {
    this.callbacks.onTranscript?.(payload.segment);
  }

  /**
   * Handle sign detection message
   */
  private handleSignDetection(payload: SignDetectionPayload): void {
    this.callbacks.onSignDetection?.({
      ...payload.result,
      userId: payload.userId,
    });
  }

  /**
   * Handle user joined message
   */
  private handleUserJoined(payload: UserEventPayload): void {
    this.callbacks.onUserJoined?.(payload.user);
  }

  /**
   * Handle user left message
   */
  private handleUserLeft(payload: UserEventPayload): void {
    this.callbacks.onUserLeft?.(payload.user);
  }

  /**
   * Handle connection close
   */
  private handleClose(event: CloseEvent): void {
    this.isConnected = false;
    this.stopHeartbeat();

    const reason = event.reason || "Connection closed";
    this.callbacks.onDisconnect?.(reason);

    // Attempt reconnection if not a clean close
    if (
      !event.wasClean &&
      this.reconnectAttempts < (this.config.reconnectAttempts ?? 5)
    ) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = (this.config.reconnectDelay ?? 1000) * this.reconnectAttempts;

    this.callbacks.onReconnecting?.(this.reconnectAttempts);

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(() => {
        // Reconnection failed, will try again if attempts remain
      });
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.send("ping", {});
    }, this.config.heartbeatInterval ?? 30000);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Send message to server
   */
  private send<T>(type: WebSocketMessageType, payload: T): void {
    const message: WebSocketMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
      userId: this.config.userId,
    };

    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue message for later
      this.messageQueue.push(message as WebSocketMessage);
    }
  }

  /**
   * Flush queued messages after reconnection
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
      }
    }
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Send transcript to other participants
   */
  sendTranscript(segment: TranscriptSegment): void {
    const payload: TranscriptPayload = {
      segment,
      roomId: this.config.roomId ?? "default",
    };
    this.send("transcript", payload);
  }

  /**
   * Send sign detection result to other participants
   */
  sendSignDetection(result: SignToTextResult): void {
    const payload: SignDetectionPayload = {
      result,
      userId: this.config.userId ?? "anonymous",
      roomId: this.config.roomId ?? "default",
    };
    this.send("sign_detection", payload);
  }

  /**
   * Notify speaker change
   */
  notifySpeakerChange(speakerId: string): void {
    this.send("speaker_change", speakerId);
  }

  /**
   * Join a room
   */
  joinRoom(roomId: string, user: User): void {
    this.config.roomId = roomId;
    this.config.userId = user.id;

    const payload: UserEventPayload = {
      user,
      roomId,
    };
    this.send("user_joined", payload);
  }

  /**
   * Leave current room
   */
  leaveRoom(user: User): void {
    if (this.config.roomId) {
      const payload: UserEventPayload = {
        user,
        roomId: this.config.roomId,
      };
      this.send("user_left", payload);
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopHeartbeat();
    this.messageQueue = [];
    this.reconnectAttempts = this.config.reconnectAttempts ?? 5; // Prevent reconnection

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this.isConnected = false;
  }

  /**
   * Check connection status
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Update callbacks
   */
  setCallbacks(callbacks: Partial<RealtimeSocketCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RealtimeSocketConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a pre-configured realtime socket service
 */
export function createRealtimeSocketService(
  callbacks?: RealtimeSocketCallbacks,
  config?: Partial<RealtimeSocketConfig>,
): RealtimeSocketService {
  return new RealtimeSocketService(WEBSOCKET_URL, callbacks, config);
}
