// Global State Store - Centralized state management using Zustand
// Replaces scattered @state() decorators and event-based communication

import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

// ===== Session Types =====
export interface Session {
  key: string;
  name?: string;
  updatedAt: string;
  messageCount: number;
  archived?: boolean;
}

export interface SessionState {
  current: Session | null;
  list: Session[];
  loading: boolean;
  error: string | null;
}

export interface SessionActions {
  setCurrent: (session: Session | null) => void;
  setList: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  updateSession: (key: string, updates: Partial<Session>) => void;
  removeSession: (key: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// ===== Connection Types =====
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';

export interface ConnectionStatus {
  state: ConnectionState;
  error: string | null;
  reconnectCount: number;
}

export interface ConnectionActions {
  setState: (state: ConnectionState) => void;
  setError: (error: string | null) => void;
  incrementReconnect: () => void;
  resetReconnect: () => void;
}

// ===== Message Types =====
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: Array<{ type: string; text?: string }>;
  attachments?: Array<{
    type: string;
    mimeType?: string;
    data?: string;
    name?: string;
    size?: number;
  }>;
  timestamp: number;
  isStreaming?: boolean;
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface MessageState {
  list: Message[];
  streaming: {
    isActive: boolean;
    content: string;
    message: Message | null;
  };
  loading: boolean;
  error: string | null;
}

export interface MessageActions {
  setList: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  removeMessage: (id: string) => void;
  clearMessages: () => void;
  setStreaming: (isActive: boolean) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (content: string) => void;
  finalizeStreaming: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// ===== Route Types =====
export type ChatRouteType = 'recent' | 'session' | 'new';

export interface ChatRoute {
  type: ChatRouteType;
  sessionKey?: string;
}

export interface RouteState {
  current: ChatRoute;
  previous: ChatRoute | null;
  transitioning: boolean;
}

export interface RouteActions {
  navigate: (route: ChatRoute) => void;
  setTransitioning: (transitioning: boolean) => void;
}

// ===== App State =====
export interface AppState extends
  SessionState,
  ConnectionStatus,
  MessageState,
  RouteState {}

export interface AppActions extends
  SessionActions,
  ConnectionActions,
  MessageActions,
  RouteActions {}

// ===== Store Creation =====
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const createAppStore = () =>
  createStore(
    subscribeWithSelector<AppState & AppActions>((set, get) => ({
      // Initial State
      current: null,
      list: [],
      loading: false,
      error: null,
      state: 'disconnected',
      reconnectCount: 0,
      list: [],
      streaming: {
        isActive: false,
        content: '',
        message: null,
      },
      current: { type: 'recent' },
      previous: null,
      transitioning: false,

      // Session Actions
      setCurrent: (session) => set({ current: session }),
      setList: (sessions) => set({ list: sessions }),
      addSession: (session) =>
        set((state) => ({
          list: [session, ...state.list],
        })),
      updateSession: (key, updates) =>
        set((state) => ({
          list: state.list.map((s) =>
            s.key === key ? { ...s, ...updates } : s
          ),
        })),
      removeSession: (key) =>
        set((state) => ({
          list: state.list.filter((s) => s.key !== key),
        })),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

      // Connection Actions
      setState: (state) => set({ state }),
      setError: (error) => set({ error }),
      incrementReconnect: () =>
        set((state) => ({ reconnectCount: state.reconnectCount + 1 })),
      resetReconnect: () => set({ reconnectCount: 0 }),

      // Message Actions
      setList: (messages) => set({ list: messages }),
      addMessage: (message) =>
        set((state) => ({
          list: [...state.list, message],
        })),
      updateMessage: (id, updates) =>
        set((state) => ({
          list: state.list.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        })),
      removeMessage: (id) =>
        set((state) => ({
          list: state.list.filter((m) => m.id !== id),
        })),
      clearMessages: () =>
        set({
          list: [],
          streaming: { isActive: false, content: '', message: null },
        }),
      setStreaming: (isActive) =>
        set((state) => ({
          streaming: { ...state.streaming, isActive },
        })),
      setStreamingContent: (content) =>
        set((state) => ({
          streaming: { ...state.streaming, content },
        })),
      appendStreamingContent: (content) =>
        set((state) => ({
          streaming: {
            ...state.streaming,
            content: state.streaming.content + content,
          },
        })),
      finalizeStreaming: () => {
        const { streaming, list } = get();
        if (streaming.content) {
          const message: Message = {
            id: generateId(),
            role: 'assistant',
            content: [{ type: 'text', text: streaming.content }],
            timestamp: Date.now(),
          };
          set({
            list: [...list, message],
            streaming: { isActive: false, content: '', message: null },
          });
        }
      },

      // Route Actions
      navigate: (route) =>
        set((state) => ({
          previous: state.current,
          current: route,
          transitioning: true,
        })),
      setTransitioning: (transitioning) => set({ transitioning }),
    }))
  );

// Singleton store instance
let storeInstance: ReturnType<typeof createAppStore> | null = null;

export function getStore(): ReturnType<typeof createAppStore> {
  if (!storeInstance) {
    storeInstance = createAppStore();
  }
  return storeInstance;
}

export function resetStore(): void {
  storeInstance = null;
}

// Selector helpers for better performance
export function selectSession(store: ReturnType<typeof createAppStore>) {
  return {
    current: store.getState().current,
    list: store.getState().list,
    loading: store.getState().loading,
    error: store.getState().error,
  };
}

export function selectConnection(store: ReturnType<typeof createAppStore>) {
  return {
    state: store.getState().state,
    error: store.getState().error,
    reconnectCount: store.getState().reconnectCount,
  };
}

export function selectMessages(store: ReturnType<typeof createAppStore>) {
  return {
    list: store.getState().list,
    streaming: store.getState().streaming,
    loading: store.getState().loading,
    error: store.getState().error,
  };
}

export function selectRoute(store: ReturnType<typeof createAppStore>) {
  return {
    current: store.getState().current,
    previous: store.getState().previous,
    transitioning: store.getState().transitioning,
  };
}

export type { AppStore } from 'zustand';
