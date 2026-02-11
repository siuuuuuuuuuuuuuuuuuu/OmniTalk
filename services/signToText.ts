/**
 * REAL-TIME Sign Language to Text Service
 * Uses WebSocket for bidirectional, low-latency communication
 */

import type {
    HandLandmark,
    SignDetectionResult,
    SignToTextResult,
} from "@/types";

// ============================================
// Configuration
// ============================================

export interface SignToTextConfig {
    backendUrl: string; // REQUIRED - WebSocket URL: ws:// or wss://
    apiKey?: string;
    language?: "ASL" | "BSL" | "ISL";
    confidenceThreshold?: number;
    useBinaryFrames?: boolean; // Use binary data for efficiency
    reconnectAttempts?: number;
    maxFrameQueueSize?: number; // Prevent memory overflow
    targetFps?: number; // Target frames per second for real-time
    enableTemporalSmoothing?: boolean; // Smooth out gesture detection
}

const DEFAULT_CONFIG: Partial<SignToTextConfig> = {
    language: "ASL",
    confidenceThreshold: 0.7,
    useBinaryFrames: true,
    reconnectAttempts: 5,
    maxFrameQueueSize: 30,
    targetFps: 15,
    enableTemporalSmoothing: true,
};


// ============================================
// Callbacks
// ============================================

export interface SignToTextCallbacks {
    // Real-time callbacks
    onGestureDetected?: (gesture: string, confidence: number, isFinal?: boolean) => void;
    onTextResult?: (result: SignToTextResult) => void;
    onPartialResult?: (text: string) => void; // For real-time partial text
    onError?: (error: Error) => void;
    onLandmarksDetected?: (landmarks: HandLandmark[][]) => void;
    onConnectionStatus?: (connected: boolean) => void;
    onFrameSent?: (frameId: string, timestamp: number) => void; // For debugging
    onFrameProcessed?: (frameId: string, result: SignDetectionResult) => void;
    onRealTimeStarted?: () => void;
    onRealTimeStopped?: () => void;
}

// ============================================
// Real-Time Sign to Text Service
// ============================================

export class SignToTextService {
    private config: SignToTextConfig;
    private callbacks: SignToTextCallbacks;

    // WebSocket connections
    private videoWs: WebSocket | null = null; // For sending video frames
    private resultsWs: WebSocket | null = null; // For receiving results

    // Real-time state
    private isStreaming = false;
    private isConnected = false;
    private frameSequence = 0;
    private pendingFrames = new Map<string, { timestamp: number, sentAt: number }>();
    private frameQueue: Array<{ id: string, data: any, timestamp: number }> = [];
    private processingQueue = false;
    private lastFrameTime = 0;

    // Reconnection
    private reconnectCount = 0;
    private reconnectTimer: number | null = null;

    // Gesture tracking for temporal smoothing
    private gestureHistory: Array<{ gesture: string, confidence: number, timestamp: number }> = [];
    private currentStableGesture: string | null = null;
    private gestureStartTime: number | null = null;

    constructor(
        config: SignToTextConfig,
        callbacks: SignToTextCallbacks = {},
    ) {
        if (!config.backendUrl) {
            throw new Error('backendUrl is required in SignToTextConfig');
        }

        // Ensure WebSocket URL starts with ws:// or wss://
        if (!config.backendUrl.startsWith('ws://') && !config.backendUrl.startsWith('wss://')) {
            throw new Error('backendUrl must be a WebSocket URL (ws:// or wss://)');
        }

        this.config = {...DEFAULT_CONFIG, ...config} as SignToTextConfig;
        this.callbacks = callbacks;

        // Initialize WebSocket connections
        this.initializeConnections();
    }

    // ============================================
    // Connection Management
    // ============================================

    private async initializeConnections(): Promise<void> {
        try {
            // Connect to video streaming endpoint
            await this.connectVideoWebSocket();

            // Connect to results endpoint (separate for better performance)
            await this.connectResultsWebSocket();

            this.isConnected = true;
            this.callbacks.onConnectionStatus?.(true);

        } catch (error) {
            console.error('Failed to initialize WebSocket connections:', error);
            this.callbacks.onError?.(error as Error);
            this.attemptReconnect();
        }
    }

    private async connectVideoWebSocket(): Promise<void> {
        return new Promise((resolve, reject) => {
            const videoUrl = `${this.config.backendUrl}/video`;
            this.videoWs = new WebSocket(videoUrl);

            this.videoWs.onopen = () => {
                console.log('SignToText: Video WebSocket connected');

                // Send initialization message
                this.videoWs?.send(JSON.stringify({
                    type: 'init',
                    clientId: this.getClientId(),
                    language: this.config.language,
                    targetFps: this.config.targetFps,
                    useBinary: this.config.useBinaryFrames,
                }));

                resolve();
            };

            this.videoWs.onerror = (error) => {
                console.error('SignToText: Video WebSocket error', error);
                reject(new Error('Video WebSocket connection failed'));
            };

            this.videoWs.onclose = () => {
                console.log('SignToText: Video WebSocket disconnected');
                this.handleDisconnection();
            };
        });
    }

    private async connectResultsWebSocket(): Promise<void> {
        return new Promise((resolve, reject) => {
            const resultsUrl = `${this.config.backendUrl}/results`;
            this.resultsWs = new WebSocket(resultsUrl);

            this.resultsWs.onopen = () => {
                console.log('SignToText: Results WebSocket connected');

                // Send client ID to associate with video stream
                this.resultsWs?.send(JSON.stringify({
                    type: 'register',
                    clientId: this.getClientId(),
                }));

                resolve();
            };

            this.resultsWs.onmessage = (event) => {
                this.handleRealTimeResult(event.data);
            };

            this.resultsWs.onerror = (error) => {
                console.error('SignToText: Results WebSocket error', error);
                reject(new Error('Results WebSocket connection failed'));
            };

            this.resultsWs.onclose = () => {
                console.log('SignToText: Results WebSocket disconnected');
            };
        });
    }

    /**
     * Attempt to reconnect WebSocket
     */
    private attemptReconnect(): void {
        if (this.reconnectCount >= (this.config.reconnectAttempts || 5)) {
            console.error('SignToText: Max reconnection attempts reached');
            return;
        }

        this.reconnectCount++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectCount), 30000); // Exponential backoff

        console.log(`SignToText: Attempting reconnect ${this.reconnectCount} in ${delay}ms`);

        this.reconnectTimer = setTimeout(() => {
            this.initializeConnections().then(() => {
                this.reconnectCount = 0;
            }).catch(() => {
                // Will retry on next interval
            });
        }, delay);
    }

    private handleDisconnection(): void {
        this.isConnected = false;
        this.isStreaming = false;
        this.callbacks.onConnectionStatus?.(false);
        this.attemptReconnect();
    }

    // ============================================
    // Real-Time Frame Processing
    // ============================================

    /**
     * Start real-time sign language detection
     */
    startRealTimeDetection(): void {
        if (!this.isConnected) {
            throw new Error('Not connected to backend');
        }

        this.isStreaming = true;
        this.frameSequence = 0;
        this.gestureHistory = [];
        this.currentStableGesture = null;

        console.log('SignToText: Started real-time detection');

        // Send start stream message
        this.videoWs?.send(JSON.stringify({
            type: 'start_stream',
            clientId: this.getClientId(),
            timestamp: Date.now(),
        }));

        this.callbacks.onRealTimeStarted?.();
    }

    /**
     * Send a video frame for real-time processing
     * NON-BLOCKING - doesn't wait for response
     */
    async sendFrame(frameData: any): Promise<string | null> {
        if (!this.isStreaming || !this.videoWs || this.videoWs.readyState !== WebSocket.OPEN) {
            return null;
        }

        const now = Date.now();

        // Control FPS - skip frames if sending too fast
        const targetFrameInterval = 1000 / (this.config.targetFps || 15);
        if (now - this.lastFrameTime < targetFrameInterval) {
            return null; // Skip this frame to maintain target FPS
        }

        // Generate unique frame ID
        const frameId = `${this.getClientId()}_${now}_${this.frameSequence++}`;
        this.lastFrameTime = now;

        try {
            // Prepare frame data (binary or base64)
            const preparedData = this.config.useBinaryFrames
                ? await this.frameToBinary(frameData)
                : await this.prepareFrameData(frameData);

            // Add to queue for controlled sending
            this.frameQueue.push({
                id: frameId,
                data: preparedData,
                timestamp: now,
            });

            // Process queue if not already processing
            if (!this.processingQueue) {
                this.processFrameQueue();
            }

            // Track pending frame
            this.pendingFrames.set(frameId, { timestamp: now, sentAt: Date.now() });

            // Clean up old pending frames
            this.cleanupPendingFrames();

            this.callbacks.onFrameSent?.(frameId, now);
            return frameId;

        } catch (error) {
            console.error('SignToText: Failed to send frame:', error);
            return null;
        }
    }

    /**
     * Process frame queue with controlled FPS
     */
    private async processFrameQueue(): Promise<void> {
        if (this.processingQueue || this.frameQueue.length === 0) {
            return;
        }

        this.processingQueue = true;

        while (this.frameQueue.length > 0 && this.isStreaming) {
            const frame = this.frameQueue.shift();
            if (!frame) continue;

            // Send frame via WebSocket
            this.sendFrameToBackend(frame.id, frame.data, frame.timestamp);

            // Small delay to prevent overwhelming the backend
            await new Promise(resolve => setTimeout(resolve, 5));
        }

        this.processingQueue = false;
    }

    private sendFrameToBackend(frameId: string, frameData: any, timestamp: number): void {
        if (!this.videoWs || this.videoWs.readyState !== WebSocket.OPEN) {
            return;
        }

        const message = this.config.useBinaryFrames
            ? this.createBinaryMessage(frameId, frameData, timestamp)
            : JSON.stringify({
                type: 'frame',
                frameId,
                clientId: this.getClientId(),
                data: frameData,
                timestamp,
                sequence: this.frameSequence,
            });

        this.videoWs.send(message);
    }

    private createBinaryMessage(frameId: string, frameData: any, timestamp: number): ArrayBuffer {
        // Create efficient binary format for video frames
        const encoder = new TextEncoder();

        // Convert frameId to bytes
        const frameIdBytes = encoder.encode(frameId);
        const frameIdLength = frameIdBytes.length;

        // Create buffer
        const headerSize = 12; // 4 bytes each for frameIdLength, timestamp, dataLength
        const data = frameData instanceof ArrayBuffer
            ? new Uint8Array(frameData)
            : encoder.encode(JSON.stringify(frameData));

        const buffer = new ArrayBuffer(headerSize + frameIdLength + data.byteLength);
        const view = new DataView(buffer);

        // Write header
        let offset = 0;
        view.setUint32(offset, frameIdLength, true); offset += 4;
        view.setUint32(offset, timestamp, true); offset += 4;
        view.setUint32(offset, data.byteLength, true); offset += 4;

        // Write frameId
        new Uint8Array(buffer, offset, frameIdLength).set(frameIdBytes);
        offset += frameIdLength;

        // Write frame data
        new Uint8Array(buffer, offset, data.byteLength).set(data);

        return buffer;
    }

    private async frameToBinary(frameData: any): Promise<ArrayBuffer> {
        // Implementation depends on your camera library
        if (frameData instanceof ArrayBuffer) {
            return frameData;
        }

        if (frameData.base64) {
            // Convert base64 to binary
            const binaryString = atob(frameData.base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        }

        // Default: use prepareFrameData to get base64, then convert to binary
        const base64 = await this.prepareFrameData(frameData);
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Prepare frame data for transmission
     */
    private async prepareFrameData(frameData: any): Promise<string> {
        // Handle different input types
        if (typeof frameData === 'string') {
            // If it's already base64 or data URL
            if (frameData.startsWith('data:image')) {
                // Remove data URL prefix
                return frameData.split(',')[1];
            }
            return frameData; // Assume it's already base64
        }

        if (frameData.uri) {
            // React Native image object
            const response = await fetch(frameData.uri);
            const blob = await response.blob();
            return await this.blobToBase64(blob);
        }

        if (frameData instanceof Blob || frameData instanceof File) {
            return await this.blobToBase64(frameData);
        }

        throw new Error('Unsupported frame data format');
    }

    /**
     * Convert Blob/File to base64
     */
    private blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result as string;
                resolve(base64data.split(',')[1]); // Remove data URL prefix
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // ============================================
    // Result Handling
    // ============================================

    private handleRealTimeResult(data: string): void {
        try {
            const result = JSON.parse(data);

            switch (result.type) {
                case 'landmarks':
                    this.callbacks.onLandmarksDetected?.(result.landmarks);
                    break;

                case 'gesture':
                    this.handleRealTimeGesture(result);
                    break;

                case 'partial_text':
                    this.callbacks.onPartialResult?.(result.text);
                    break;

                case 'final_text':
                    this.handleFinalText(result);
                    break;

                case 'frame_processed':
                    this.handleFrameProcessed(result);
                    break;

                case 'error':
                    this.callbacks.onError?.(new Error(result.message));
                    break;
            }
        } catch (error) {
            console.error('SignToText: Failed to parse result:', error);
        }
    }

    private handleRealTimeGesture(result: any): void {
        const { gesture, confidence, frameId, isFinal = false, text } = result;

        // Apply temporal smoothing if enabled
        const smoothedGesture = this.config.enableTemporalSmoothing
            ? this.applyTemporalSmoothing(gesture, confidence)
            : gesture;

        // Remove from pending frames
        this.pendingFrames.delete(frameId);

        // Call gesture callback with smoothed result
        this.callbacks.onGestureDetected?.(smoothedGesture, confidence, isFinal);

        // If it's a final detection with text, trigger text callback
        if (isFinal && text) {
            const textResult: SignToTextResult = {
                text,
                signs: [smoothedGesture],
                confidence,
                timestamp: Date.now(),
                isFinal: true,
            };

            this.callbacks.onTextResult?.(textResult);
        }

        this.callbacks.onFrameProcessed?.(frameId, {
            gesture: smoothedGesture,
            confidence,
            timestamp: Date.now(),
            isFinal,
        });
    }

    private applyTemporalSmoothing(gesture: string, confidence: number): string {
        const now = Date.now();
        const historyWindow = 1000; // 1 second window

        // Add current detection to history
        this.gestureHistory.push({ gesture, confidence, timestamp: now });

        // Remove old entries
        this.gestureHistory = this.gestureHistory.filter(
            g => now - g.timestamp < historyWindow
        );

        // Find most common gesture in history
        const gestureCounts = new Map<string, { count: number, totalConfidence: number }>();
        this.gestureHistory.forEach(g => {
            const current = gestureCounts.get(g.gesture) || { count: 0, totalConfidence: 0 };
            gestureCounts.set(g.gesture, {
                count: current.count + 1,
                totalConfidence: current.totalConfidence + g.confidence,
            });
        });

        // Find dominant gesture
        let dominantGesture = gesture;
        let maxCount = 0;

        gestureCounts.forEach((stats, g) => {
            if (stats.count > maxCount) {
                maxCount = stats.count;
                dominantGesture = g;
            }
        });

        // Update stable gesture if consistent
        if (maxCount >= 3) { // At least 3 consistent detections
            if (this.currentStableGesture !== dominantGesture) {
                this.currentStableGesture = dominantGesture;
                this.gestureStartTime = now;
            }
        }

        return this.currentStableGesture || dominantGesture;
    }

    private handleFinalText(result: any): void {
        const textResult: SignToTextResult = {
            text: result.text,
            signs: result.signs || [],
            confidence: result.confidence,
            timestamp: Date.now(),
            isFinal: true,
        };

        this.callbacks.onTextResult?.(textResult);
    }

    private handleFrameProcessed(result: any): void {
        const { frameId, processingTime } = result;
        this.pendingFrames.delete(frameId);

        // Log performance metrics
        console.log(`Frame ${frameId} processed in ${processingTime}ms`);
    }

    // ============================================
    // Utility Methods
    // ============================================

    private getClientId(): string {
        // Generate or retrieve a unique client ID
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private cleanupPendingFrames(): void {
        const now = Date.now();
        const timeout = 5000; // 5 second timeout

        for (const [frameId, info] of this.pendingFrames.entries()) {
            if (now - info.sentAt > timeout) {
                this.pendingFrames.delete(frameId);
                console.warn(`Frame ${frameId} timed out after ${timeout}ms`);
            }
        }

        // Limit queue size
        const maxSize = this.config.maxFrameQueueSize || 30;
        if (this.frameQueue.length > maxSize) {
            const removed = this.frameQueue.splice(0, this.frameQueue.length - maxSize);
            console.warn(`Dropped ${removed.length} frames from queue`);
        }
    }

    // ============================================
    // Public API
    // ============================================

    /**
     * Process a single frame (non-real-time, for compatibility)
     */
    async processFrame(frameData: any): Promise<SignDetectionResult | null> {
        try {
            // Convert frame data
            const processedData = this.config.useBinaryFrames
                ? await this.frameToBinary(frameData)
                : await this.prepareFrameData(frameData);

            return await this.sendViaREST(processedData);
        } catch (error) {
            console.error('SignToText: Error processing frame:', error);
            this.callbacks.onError?.(error as Error);
            return null;
        }
    }

    /**
     * Send frame via REST API (fallback)
     */
    private async sendViaREST(data: any): Promise<SignDetectionResult | null> {
        try {
            const isBinary = data instanceof ArrayBuffer;
            const endpoint = `${this.config.backendUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/process-sign`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': isBinary ? 'application/octet-stream' : 'application/json',
                    ...(this.config.apiKey && {'Authorization': `Bearer ${this.config.apiKey}`})
                },
                body: isBinary ? data : JSON.stringify({
                    image: data,
                    language: this.config.language,
                    timestamp: Date.now()
                })
            });

            if (!response.ok) {
                throw new Error(`Backend error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            this.processBackendResult(result);
            return result;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Process result from backend (for non-real-time mode)
     */
    private processBackendResult(result: any): void {
        if (result.landmarks) {
            this.callbacks.onLandmarksDetected?.(result.landmarks);
        }

        if (result.gesture && result.confidence) {
            this.callbacks.onGestureDetected?.(result.gesture, result.confidence, result.isFinal);

            const textResult: SignToTextResult = {
                text: result.text || result.gesture,
                signs: [result.gesture],
                confidence: result.confidence,
                timestamp: Date.now(),
                isFinal: result.isFinal,
            };

            this.callbacks.onTextResult?.(textResult);
        }
    }

    /**
     * Stop real-time detection
     */
    stopRealTimeDetection(): void {
        this.isStreaming = false;

        if (this.videoWs?.readyState === WebSocket.OPEN) {
            this.videoWs.send(JSON.stringify({
                type: 'stop_stream',
                clientId: this.getClientId(),
                timestamp: Date.now(),
            }));
        }

        // Clear queues
        this.frameQueue = [];
        this.pendingFrames.clear();
        this.gestureHistory = [];

        this.callbacks.onRealTimeStopped?.();
        console.log('SignToText: Stopped real-time detection');
    }

    /**
     * Get current connection status
     */
    getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' {
        if (this.isConnected && this.videoWs?.readyState === WebSocket.OPEN) {
            return 'connected';
        } else if (this.reconnectTimer !== null) {
            return 'connecting';
        } else {
            return 'disconnected';
        }
    }

    /**
     * Get performance metrics
     */
    getMetrics() {
        return {
            pendingFrames: this.pendingFrames.size,
            queueSize: this.frameQueue.length,
            isStreaming: this.isStreaming,
            isConnected: this.isConnected,
            reconnectCount: this.reconnectCount,
            currentStableGesture: this.currentStableGesture,
            gestureHistorySize: this.gestureHistory.length,
        };
    }

    /**
     * Cleanup
     */
    disconnect(): void {
        this.stopRealTimeDetection();

        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.videoWs?.close();
        this.resultsWs?.close();

        this.isConnected = false;
        this.callbacks.onConnectionStatus?.(false);
    }

    /**
     * Check if connected to backend
     */
    isConnectedToBackend(): boolean {
        return this.isConnected;
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<SignToTextConfig>): void {
        this.config = {...this.config, ...config};
    }

    /**
     * Update callbacks
     */
    setCallbacks(callbacks: Partial<SignToTextCallbacks>): void {
        this.callbacks = {...this.callbacks, ...callbacks};
    }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a sign-to-text service instance
 */
export function createSignToTextService(
    config: SignToTextConfig,
    callbacks?: SignToTextCallbacks,
): SignToTextService {
    return new SignToTextService(config, callbacks);
}