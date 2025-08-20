import { create } from "zustand";
import type { ChatState, ChatMessage, ChatConversation } from "@/types/chat";
import { mockChatData } from "@/data/chat-mock";

type ChatComponentState = {
  state: ChatState;
  activeConversation?: string;
  activeAgent?: string;
};

interface AgentMessage extends ChatMessage {
  agentType?: string;
  toolsUsed?: string[];
  isStreaming?: boolean;
  streamChunks?: string[];
}

interface ChatStore {
  // State
  chatState: ChatComponentState;
  conversations: ChatConversation[];
  newMessage: string;
  
  // Agent state
  activeAgent: string | null;
  isAgentTyping: boolean;
  streamingMessage: string | null;
  agentSessions: Map<string, string>; // leagueId -> sessionId
  
  // Actions
  setChatState: (state: ChatComponentState) => void;
  setConversations: (conversations: ChatConversation[]) => void;
  setNewMessage: (message: string) => void;
  handleSendMessage: () => void;
  openConversation: (conversationId: string) => void;
  goBack: () => void;
  toggleExpanded: () => void;
  
  // Agent actions
  setActiveAgent: (agent: string | null) => void;
  setAgentTyping: (isTyping: boolean) => void;
  addAgentMessage: (message: AgentMessage) => void;
  startStreaming: (initialChunk: string) => void;
  appendStreamChunk: (chunk: string) => void;
  endStreaming: () => void;
  setAgentSession: (leagueId: string, sessionId: string) => void;
  getAgentSession: (leagueId: string) => string;
}

const chatStore = create<ChatStore>((set, get) => ({
  // Initial state
  chatState: {
    state: "collapsed",
  },
  conversations: mockChatData.conversations,
  newMessage: "",
  
  // Agent state
  activeAgent: null,
  isAgentTyping: false,
  streamingMessage: null,
  agentSessions: new Map(),

  // Actions
  setChatState: (chatState) => set({ chatState }),

  setConversations: (conversations) => set({ conversations }),

  setNewMessage: (newMessage) => set({ newMessage }),

  handleSendMessage: () => {
    const { newMessage, conversations, chatState } = get();
    const activeConv = conversations.find(
      (conv) => conv.id === chatState.activeConversation
    );

    if (!newMessage.trim() || !activeConv) return;

    const message: ChatMessage = {
      id: `msg-${Date.now()}`,
      content: newMessage.trim(),
      timestamp: new Date().toISOString(),
      senderId: mockChatData.currentUser.id,
      isFromCurrentUser: true,
    };

    const updatedConversations = conversations.map((conv) =>
      conv.id === activeConv.id
        ? {
            ...conv,
            messages: [...conv.messages, message],
            lastMessage: message,
          }
        : conv
    );

    set({
      conversations: updatedConversations,
      newMessage: "",
    });
  },

  openConversation: (conversationId) => {
    const { conversations } = get();

    // Update chat state
    set({
      chatState: { state: "conversation", activeConversation: conversationId },
    });

    // Mark conversation as read
    const updatedConversations = conversations.map((conv) =>
      conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
    );

    set({ conversations: updatedConversations });
  },

  goBack: () => {
    const { chatState } = get();
    if (chatState.state === "conversation") {
      set({ chatState: { state: "expanded" } });
    } else {
      set({ chatState: { state: "collapsed" } });
    }
  },

  toggleExpanded: () => {
    const { chatState } = get();
    set({
      chatState: {
        state: chatState.state === "collapsed" ? "expanded" : "collapsed",
      },
    });
  },
  
  // Agent actions
  setActiveAgent: (agent) => set({ activeAgent: agent }),
  
  setAgentTyping: (isTyping) => set({ isAgentTyping: isTyping }),
  
  addAgentMessage: (message) => {
    const { conversations, chatState } = get();
    const activeConv = conversations.find(
      (conv) => conv.id === chatState.activeConversation
    );
    
    if (!activeConv) return;
    
    const updatedConversations = conversations.map((conv) =>
      conv.id === activeConv.id
        ? {
            ...conv,
            messages: [...conv.messages, message as ChatMessage],
            lastMessage: message as ChatMessage,
          }
        : conv
    );
    
    set({ conversations: updatedConversations });
  },
  
  startStreaming: (initialChunk) => {
    set({ streamingMessage: initialChunk, isAgentTyping: true });
  },
  
  appendStreamChunk: (chunk) => {
    const { streamingMessage } = get();
    set({ streamingMessage: (streamingMessage || '') + chunk });
  },
  
  endStreaming: () => {
    const { streamingMessage, activeAgent, conversations, chatState } = get();
    
    if (streamingMessage) {
      const message: AgentMessage = {
        id: `agent-${Date.now()}`,
        content: streamingMessage,
        timestamp: new Date().toISOString(),
        senderId: activeAgent || 'agent',
        isFromCurrentUser: false,
        agentType: activeAgent || undefined,
      };
      
      const activeConv = conversations.find(
        (conv) => conv.id === chatState.activeConversation
      );
      
      if (activeConv) {
        const updatedConversations = conversations.map((conv) =>
          conv.id === activeConv.id
            ? {
                ...conv,
                messages: [...conv.messages, message as ChatMessage],
                lastMessage: message as ChatMessage,
              }
            : conv
        );
        
        set({ 
          conversations: updatedConversations,
          streamingMessage: null,
          isAgentTyping: false
        });
      }
    }
  },
  
  setAgentSession: (leagueId, sessionId) => {
    const { agentSessions } = get();
    const newSessions = new Map(agentSessions);
    newSessions.set(leagueId, sessionId);
    set({ agentSessions: newSessions });
  },
  
  getAgentSession: (leagueId) => {
    const { agentSessions } = get();
    return agentSessions.get(leagueId) || `session-${Date.now()}`;
  },
}));

// Hook with computed values using selectors
export const useChatState = () => {
  const chatState = chatStore((state) => state.chatState);
  const conversations = chatStore((state) => state.conversations);
  const newMessage = chatStore((state) => state.newMessage);
  const setChatState = chatStore((state) => state.setChatState);
  const setConversations = chatStore((state) => state.setConversations);
  const setNewMessage = chatStore((state) => state.setNewMessage);
  const handleSendMessage = chatStore((state) => state.handleSendMessage);
  const openConversation = chatStore((state) => state.openConversation);
  const goBack = chatStore((state) => state.goBack);
  const toggleExpanded = chatStore((state) => state.toggleExpanded);
  
  // Agent state and actions
  const activeAgent = chatStore((state) => state.activeAgent);
  const isAgentTyping = chatStore((state) => state.isAgentTyping);
  const streamingMessage = chatStore((state) => state.streamingMessage);
  const setActiveAgent = chatStore((state) => state.setActiveAgent);
  const setAgentTyping = chatStore((state) => state.setAgentTyping);
  const addAgentMessage = chatStore((state) => state.addAgentMessage);
  const startStreaming = chatStore((state) => state.startStreaming);
  const appendStreamChunk = chatStore((state) => state.appendStreamChunk);
  const endStreaming = chatStore((state) => state.endStreaming);
  const setAgentSession = chatStore((state) => state.setAgentSession);
  const getAgentSession = chatStore((state) => state.getAgentSession);

  // Computed values
  const totalUnreadCount = conversations.reduce(
    (total, conv) => total + conv.unreadCount,
    0
  );

  const activeConversation = conversations.find(
    (conv) => conv.id === chatState.activeConversation
  );

  return {
    chatState,
    conversations,
    newMessage,
    totalUnreadCount,
    activeConversation,
    setChatState,
    setConversations,
    setNewMessage,
    handleSendMessage,
    openConversation,
    goBack,
    toggleExpanded,
    // Agent features
    activeAgent,
    isAgentTyping,
    streamingMessage,
    setActiveAgent,
    setAgentTyping,
    addAgentMessage,
    startStreaming,
    appendStreamChunk,
    endStreaming,
    setAgentSession,
    getAgentSession,
  };
};
