/**
 * App Context & State Management
 * Central state management for OmniTalk application
 */

import type {
    AccessibilitySettings,
    Room,
    SessionState,
    SpeakerInfo,
    TranscriptSegment,
    User,
} from "@/types";
import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useReducer,
} from "react";

// ============================================
// State Types
// ============================================

interface AppState {
  session: SessionState;
  transcript: TranscriptSegment[];
  speakers: Map<string, SpeakerInfo>;
  accessibility: AccessibilitySettings;
  isLoading: boolean;
  error: string | null;
}

type AppAction =
  | { type: "SET_USER"; payload: User | null }
  | { type: "SET_ROOM"; payload: Room | null }
  | { type: "SET_CONNECTED"; payload: boolean }
  | { type: "SET_RECORDING"; payload: boolean }
  | { type: "SET_CAMERA_ACTIVE"; payload: boolean }
  | { type: "ADD_TRANSCRIPT"; payload: TranscriptSegment }
  | { type: "UPDATE_TRANSCRIPT"; payload: TranscriptSegment }
  | { type: "CLEAR_TRANSCRIPT" }
  | { type: "UPDATE_SPEAKER"; payload: SpeakerInfo }
  | { type: "SET_ACCESSIBILITY"; payload: Partial<AccessibilitySettings> }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "RESET" };

// ============================================
// Initial State
// ============================================

const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  fontSize: "medium",
  highContrast: false,
  captionsEnabled: true,
  ttsEnabled: false,
  ttsSpeed: 1.0,
  signLanguageEnabled: false,
  hapticFeedback: true,
};

const initialState: AppState = {
  session: {
    currentUser: null,
    currentRoom: null,
    isConnected: false,
    isRecording: false,
    isCameraActive: false,
  },
  transcript: [],
  speakers: new Map(),
  accessibility: DEFAULT_ACCESSIBILITY,
  isLoading: false,
  error: null,
};

// ============================================
// Reducer
// ============================================

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_USER":
      return {
        ...state,
        session: { ...state.session, currentUser: action.payload },
      };

    case "SET_ROOM":
      return {
        ...state,
        session: { ...state.session, currentRoom: action.payload },
      };

    case "SET_CONNECTED":
      return {
        ...state,
        session: { ...state.session, isConnected: action.payload },
      };

    case "SET_RECORDING":
      return {
        ...state,
        session: { ...state.session, isRecording: action.payload },
      };

    case "SET_CAMERA_ACTIVE":
      return {
        ...state,
        session: { ...state.session, isCameraActive: action.payload },
      };

    case "ADD_TRANSCRIPT":
      return {
        ...state,
        transcript: [...state.transcript, action.payload],
      };

    case "UPDATE_TRANSCRIPT": {
      const index = state.transcript.findIndex(
        (s) => s.id === action.payload.id,
      );
      if (index === -1) {
        return { ...state, transcript: [...state.transcript, action.payload] };
      }
      const updated = [...state.transcript];
      updated[index] = action.payload;
      return { ...state, transcript: updated };
    }

    case "CLEAR_TRANSCRIPT":
      return { ...state, transcript: [] };

    case "UPDATE_SPEAKER": {
      const newSpeakers = new Map(state.speakers);
      newSpeakers.set(action.payload.id, action.payload);
      return { ...state, speakers: newSpeakers };
    }

    case "SET_ACCESSIBILITY":
      return {
        ...state,
        accessibility: { ...state.accessibility, ...action.payload },
      };

    case "SET_LOADING":
      return { ...state, isLoading: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

// ============================================
// Context
// ============================================

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  actions: {
    setUser: (user: User | null) => void;
    joinRoom: (room: Room) => void;
    leaveRoom: () => void;
    addTranscript: (segment: TranscriptSegment) => void;
    updateTranscript: (segment: TranscriptSegment) => void;
    clearTranscript: () => void;
    updateSpeaker: (speaker: SpeakerInfo) => void;
    updateAccessibility: (settings: Partial<AccessibilitySettings>) => void;
    setRecording: (isRecording: boolean) => void;
    setCameraActive: (isActive: boolean) => void;
    setConnected: (isConnected: boolean) => void;
    setError: (error: string | null) => void;
  };
}

const AppContext = createContext<AppContextValue | null>(null);

// ============================================
// Provider
// ============================================

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const actions = {
    setUser: useCallback((user: User | null) => {
      dispatch({ type: "SET_USER", payload: user });
    }, []),

    joinRoom: useCallback((room: Room) => {
      dispatch({ type: "SET_ROOM", payload: room });
    }, []),

    leaveRoom: useCallback(() => {
      dispatch({ type: "SET_ROOM", payload: null });
      dispatch({ type: "CLEAR_TRANSCRIPT" });
    }, []),

    addTranscript: useCallback((segment: TranscriptSegment) => {
      dispatch({ type: "ADD_TRANSCRIPT", payload: segment });
    }, []),

    updateTranscript: useCallback((segment: TranscriptSegment) => {
      dispatch({ type: "UPDATE_TRANSCRIPT", payload: segment });
    }, []),

    clearTranscript: useCallback(() => {
      dispatch({ type: "CLEAR_TRANSCRIPT" });
    }, []),

    updateSpeaker: useCallback((speaker: SpeakerInfo) => {
      dispatch({ type: "UPDATE_SPEAKER", payload: speaker });
    }, []),

    updateAccessibility: useCallback(
      (settings: Partial<AccessibilitySettings>) => {
        dispatch({ type: "SET_ACCESSIBILITY", payload: settings });
      },
      [],
    ),

    setRecording: useCallback((isRecording: boolean) => {
      dispatch({ type: "SET_RECORDING", payload: isRecording });
    }, []),

    setCameraActive: useCallback((isActive: boolean) => {
      dispatch({ type: "SET_CAMERA_ACTIVE", payload: isActive });
    }, []),

    setConnected: useCallback((isConnected: boolean) => {
      dispatch({ type: "SET_CONNECTED", payload: isConnected });
    }, []),

    setError: useCallback((error: string | null) => {
      dispatch({ type: "SET_ERROR", payload: error });
    }, []),
  };

  return (
    <AppContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </AppContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}

// Export individual hooks for convenience
export function useSession() {
  const { state } = useApp();
  return state.session;
}

export function useTranscript() {
  const { state, actions } = useApp();
  return {
    segments: state.transcript,
    speakers: state.speakers,
    addTranscript: actions.addTranscript,
    updateTranscript: actions.updateTranscript,
    clearTranscript: actions.clearTranscript,
  };
}

export function useAccessibility() {
  const { state, actions } = useApp();
  return {
    settings: state.accessibility,
    updateSettings: actions.updateAccessibility,
  };
}
