"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { MessageSquare, X, Minimize2, Maximize2 } from "lucide-react";
import { ChatHeader } from "./chat-header";
import ChatConversation from "./chat-conversation";
import ChatPreview from "./chat-preview";
import { useChatState } from "./use-chat-state";
import { cn } from "@/lib/utils";

export default function ChatWindow() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const {
    chatState,
    conversations,
    newMessage,
    setNewMessage,
    activeConversation,
    handleSendMessage,
    openConversation,
    goBack,
  } = useChatState();

  const toggleChat = () => {
    if (isMinimized) {
      setIsMinimized(false);
    } else {
      setIsOpen(!isOpen);
    }
  };

  const minimize = () => {
    setIsMinimized(true);
  };

  const expand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <>
      {/* Chat Toggle Button - Always visible */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20
            }}
            className="fixed bottom-6 right-6 z-50"
          >
            <Button
              onClick={toggleChat}
              size="lg"
              className="rounded-full h-14 w-14 shadow-lg bg-primary hover:bg-primary/90 transition-all hover:shadow-xl"
            >
              <MessageSquare className="h-6 w-6" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ 
              opacity: isMinimized ? 0.3 : 1, 
              y: 0, 
              scale: 1,
              height: isMinimized ? "auto" : isExpanded ? "80vh" : "600px",
              width: isExpanded ? "600px" : "400px"
            }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "fixed bottom-6 right-6 z-50",
              "bg-background border border-border rounded-lg shadow-2xl",
              "flex flex-col overflow-hidden",
              isMinimized && "cursor-pointer"
            )}
            onClick={isMinimized ? () => setIsMinimized(false) : undefined}
          >
            {/* Chat Header */}
            <div className="flex items-center justify-between p-4 border-b bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm font-medium">AI Assistant</span>
                </div>
                {chatState.state === "conversation" && activeConversation && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goBack}
                    className="h-8 px-2"
                  >
                    ← Back
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={expand}
                  className="h-8 w-8 p-0"
                >
                  {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={minimize}
                  className="h-8 w-8 p-0"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleChat}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Chat Content - Hidden when minimized */}
            {!isMinimized && (
              <div className="flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                  {chatState.state === "expanded" && (
                    <motion.div
                      key="expanded"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="h-full flex flex-col"
                    >
                      {/* Conversations List */}
                      <div className="flex-1 overflow-y-auto">
                        {conversations.length > 0 ? (
                          conversations.map((conversation) => (
                            <ChatPreview
                              key={conversation.id}
                              conversation={conversation}
                              onOpenConversation={openConversation}
                            />
                          ))
                        ) : (
                          <div className="p-8 text-center text-muted-foreground">
                            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p className="text-sm">No conversations yet</p>
                            <p className="text-xs mt-2">Start chatting with AI agents!</p>
                          </div>
                        )}
                      </div>

                      {/* New Chat Button */}
                      <div className="p-4 border-t">
                        <Button
                          className="w-full"
                          onClick={() => openConversation("new")}
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          New Chat
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {chatState.state === "conversation" && activeConversation && (
                    <ChatConversation
                      activeConversation={activeConversation}
                      newMessage={newMessage}
                      setNewMessage={setNewMessage}
                      onSendMessage={handleSendMessage}
                    />
                  )}

                  {chatState.state === "collapsed" && (
                    <motion.div
                      key="collapsed"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="h-full flex items-center justify-center p-8"
                    >
                      <div className="text-center">
                        <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Click to expand chat</p>
                        <Button
                          className="mt-4"
                          onClick={() => chatState.state = "expanded"}
                        >
                          Open Chat
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}