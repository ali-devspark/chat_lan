"use client";

import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneOff,
  Video,
  Search,
  UserPlus,
  MessageSquarePlus,
  Loader2,
  X,
  Sparkles,
  Trash2,
  Edit2,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import { ToastNotification } from "@/components/ui/toast-notification";
import { VoiceCallModal } from "@/components/chat/VoiceCallModal";
import { useAudioCall } from "@/hooks/useAudioCall";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface Profile {
  id: string;
  username: string;
  display_name?: string;
  avatar_url: string;
}

interface ConversationItem {
  id: string;
  otherUser: Profile;
  lastMessage?: string;
  time?: string;
  updated_at: string;
  unreadCount?: number;
}

interface MessageItem {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_edited?: boolean;
  is_deleted?: boolean;
}

interface ModalState {
  isOpen: boolean;
  type: "delete_conv" | "delete_msg" | "edit_msg" | "add_chat" | null;
  targetData?: unknown;
  title: string;
  description: string;
  actionType: "delete" | "add" | "edit" | "warning";
  confirmText?: string;
}

export default function ChatPage() {
  const t = useTranslations("Chat");
  const tCall = useTranslations("Call");
  const supabase = createClient();
  const params = useParams();
  const locale = (params?.locale as string) || "ar";

  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);

  // Realtime Presence for active online users
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // Toast Notification state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Edit message inline state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgContent, setEditingMsgContent] = useState("");

  // Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<ModalState>({
    isOpen: false,
    type: null,
    title: "",
    description: "",
    actionType: "warning",
  });
  const [isModalActionLoading, setIsModalActionLoading] = useState(false);

  // Sidebar search for saved conversations
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");

  // Desktop sidebar collapse toggle state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("chatlan_sidebar_open");
    if (saved !== null) {
      setIsSidebarOpen(saved === "true");
    }
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("chatlan_sidebar_open", String(next));
      return next;
    });
  };

  // System-wide User Search Modal State
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [systemSearchQuery, setSystemSearchQuery] = useState("");
  const [systemSearchResults, setSystemSearchResults] = useState<Profile[]>([]);
  const [isSearchingSystem, setIsSearchingSystem] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message: msg, type });
  };

  const audioCall = useAudioCall(currentUser, showToast);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load auth user and monitor Auth State
  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadingUser(false);
        window.location.href = `/${locale}/login`;
        return;
      }
      setCurrentUser(user);
      setLoadingUser(false);
    }
    loadUser();

    // Realtime auth listener - redirects immediately on logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        setCurrentUser(null);
        window.location.href = `/${locale}/login`;
      } else if (session?.user) {
        setCurrentUser(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [locale, supabase]);

  // Track Online Presence using Supabase Realtime Presence
  useEffect(() => {
    if (!currentUser?.id) return;

    const presenceChannel = supabase.channel("online-users-presence", {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const ids = new Set<string>();
        Object.keys(state).forEach((key) => {
          ids.add(key);
        });
        setOnlineUserIds(ids);
      })
      .on("presence", { event: "join" }, ({ key }) => {
        setOnlineUserIds((prev) => new Set(prev).add(key));
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });

    presenceChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({
          user_id: currentUser.id,
          online_at: new Date().toISOString(),
        });
      }
    });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [currentUser?.id, supabase]);

  // Mark conversation as read in state & database
  const markConversationAsRead = useCallback(async (convId: string) => {
    if (!currentUser) return;

    // Update local state immediately
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
    );

    // Update is_read status in DB
    try {
      await supabase
        .from("messages")
        .update({ is_read: true })
        .eq("conversation_id", convId)
        .neq("sender_id", currentUser.id)
        .eq("is_read", false);
    } catch (err) {
      console.error("Error marking messages as read:", err);
    }
  }, [currentUser, supabase]);

  // Fetch user's saved conversations
  const fetchConversations = useCallback(async (userId: string) => {
    try {
      const { data: memberData, error: memberError } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", userId);

      if (memberError || !memberData || memberData.length === 0) {
        setConversations([]);
        return;
      }

      const conversationIds = memberData.map((m) => m.conversation_id);

      const { data: allMembers, error: allMembersError } = await supabase
        .from("conversation_members")
        .select("conversation_id, user_id, profiles(id, username, display_name, avatar_url)")
        .in("conversation_id", conversationIds);

      if (allMembersError || !allMembers) return;

      const convList: ConversationItem[] = [];

      for (const convId of conversationIds) {
        const otherMemberObj = allMembers.find(
          (m) => m.conversation_id === convId && m.user_id !== userId
        );

        const otherProfile = (otherMemberObj?.profiles as unknown as Profile) || {
          id: "unknown",
          username: "user",
          display_name: "User",
          avatar_url: `https://avatar.vercel.sh/${convId}`,
        };

        const { data: lastMsgData } = await supabase
          .from("messages")
          .select("content, created_at")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        // Calculate unread count for messages sent by other user that are not read yet
        const { count: unreadCount } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", convId)
          .neq("sender_id", userId)
          .eq("is_read", false);

        convList.push({
          id: convId,
          otherUser: {
            id: otherProfile.id,
            username: otherProfile.username || "user",
            display_name: otherProfile.display_name || otherProfile.username || "User",
            avatar_url: otherProfile.avatar_url || `https://avatar.vercel.sh/${otherProfile.username}`,
          },
          lastMessage: lastMsgData?.content || "",
          time: lastMsgData ? new Date(lastMsgData.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "",
          updated_at: lastMsgData?.created_at || new Date().toISOString(),
          unreadCount: unreadCount || 0,
        });
      }

      convList.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      setConversations(convList);
    } catch (err) {
      console.error("Error loading conversations:", err);
    }
  }, [supabase]);

  useEffect(() => {
    if (currentUser?.id) {
      fetchConversations(currentUser.id);
    }
  }, [currentUser?.id, fetchConversations]);

  // Handle system-wide username & display_name search
  useEffect(() => {
    const query = systemSearchQuery.trim();
    if (!query || !currentUser) {
      setSystemSearchResults([]);
      setIsSearchingSystem(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingSystem(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq("id", currentUser.id)
        .limit(10);

      if (!error && data) {
        setSystemSearchResults(data as Profile[]);
      } else {
        setSystemSearchResults([]);
      }
      setIsSearchingSystem(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [systemSearchQuery, currentUser, supabase]);

  // Direct start or switch to conversation
  const handleDirectStartChat = async (targetUser: Profile) => {
    if (!currentUser) return;

    // Check if conversation already exists in local saved conversations state
    const existingInState = conversations.find((c) => c.otherUser.id === targetUser.id);
    if (existingInState) {
      setSelectedChat(existingInState.id);
      markConversationAsRead(existingInState.id);
      setIsNewChatModalOpen(false);
      setSystemSearchQuery("");
      setSystemSearchResults([]);
      showToast(`${targetUser.display_name || '@' + targetUser.username}`, "success");
      return;
    }

    setCreatingChat(true);

    try {
      const { data: convId, error: rpcError } = await supabase.rpc("create_direct_conversation", {
        target_user_id: targetUser.id,
      });

      if (!rpcError && convId) {
        await fetchConversations(currentUser.id);
        setSelectedChat(convId as string);
        setIsNewChatModalOpen(false);
        setSystemSearchQuery("");
        setSystemSearchResults([]);
        showToast(`${targetUser.display_name || '@' + targetUser.username}`, "success");
        return;
      }

      // Fallback manual creation
      const { data: myConvs } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", currentUser.id);

      let existingConvId: string | null = null;

      if (myConvs && myConvs.length > 0) {
        const myConvIds = myConvs.map((c) => c.conversation_id);
        const { data: targetConvs } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", targetUser.id)
          .in("conversation_id", myConvIds);

        if (targetConvs && targetConvs.length > 0) {
          existingConvId = targetConvs[0].conversation_id;
        }
      }

      if (existingConvId) {
        await fetchConversations(currentUser.id);
        setSelectedChat(existingConvId);
      } else {
        const { data: newConv, error: convErr } = await supabase
          .from("conversations")
          .insert({ is_group: false })
          .select("id")
          .single();

        if (convErr || !newConv) {
          showToast("Database error", "error");
          return;
        }

        await supabase
          .from("conversation_members")
          .insert([
            { conversation_id: newConv.id, user_id: currentUser.id },
            { conversation_id: newConv.id, user_id: targetUser.id },
          ]);

        await fetchConversations(currentUser.id);
        setSelectedChat(newConv.id);
      }

      setIsNewChatModalOpen(false);
      setSystemSearchQuery("");
      setSystemSearchResults([]);
      showToast(`${targetUser.display_name || '@' + targetUser.username}`, "success");
    } catch (err) {
      console.error("Error starting chat:", err);
      showToast("Error starting chat", "error");
    } finally {
      setCreatingChat(false);
    }
  };

  // Trigger confirmation modal for deleting a conversation
  const promptDeleteConversation = (chat: ConversationItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const displayNameToShow = chat.otherUser.display_name || `@${chat.otherUser.username}`;
    setConfirmModal({
      isOpen: true,
      type: "delete_conv",
      targetData: chat,
      title: t("deleteConvTitle"),
      description: `${displayNameToShow}`,
      actionType: "delete",
      confirmText: t("deleteConvText"),
    });
  };

  // Execute conversation deletion
  const executeDeleteConversation = async (chat: ConversationItem) => {
    if (!currentUser) return;
    setIsModalActionLoading(true);

    try {
      const { error: memErr } = await supabase
        .from("conversation_members")
        .delete()
        .eq("conversation_id", chat.id)
        .eq("user_id", currentUser.id);

      if (memErr) {
        await supabase.from("messages").delete().eq("conversation_id", chat.id).eq("sender_id", currentUser.id);
      }

      setConversations((prev) => prev.filter((c) => c.id !== chat.id));
      if (selectedChat === chat.id) {
        setSelectedChat(null);
        setMessages([]);
      }
      showToast(t("msgDeleteSuccess"), "success");
    } catch (err) {
      console.error("Failed to delete conversation:", err);
      showToast("Failed to delete conversation", "error");
    } finally {
      setIsModalActionLoading(false);
      closeConfirmModal();
    }
  };

  // Trigger confirmation modal for editing a message
  const promptEditMessage = (msg: MessageItem) => {
    if (!editingMsgContent.trim()) return;
    setConfirmModal({
      isOpen: true,
      type: "edit_msg",
      targetData: { msg, newContent: editingMsgContent.trim() },
      title: t("editMsgTitle"),
      description: t("editMsgDesc"),
      actionType: "edit",
      confirmText: t("saveEdits"),
    });
  };

  // Execute message edit (Sets is_edited: true)
  const executeEditMessage = async (target: { msg: MessageItem; newContent: string }) => {
    if (!currentUser) return;
    setIsModalActionLoading(true);
    try {
      const { error } = await supabase
        .from("messages")
        .update({
          content: target.newContent,
          is_edited: true,
        })
        .eq("id", target.msg.id)
        .eq("sender_id", currentUser.id);

      if (error && error.message.includes("is_edited")) {
        // Fallback if is_edited column isn't in DB schema yet
        await supabase
          .from("messages")
          .update({ content: target.newContent })
          .eq("id", target.msg.id)
          .eq("sender_id", currentUser.id);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === target.msg.id
            ? { ...m, content: target.newContent, is_edited: true }
            : m
        )
      );
      setEditingMsgId(null);
      setEditingMsgContent("");
      showToast(t("msgEditSuccess"), "success");
    } catch (err) {
      console.error("Error editing message:", err);
      showToast("Error editing message", "error");
    } finally {
      setIsModalActionLoading(false);
      closeConfirmModal();
    }
  };

  // Helper to check if a message is within the 15-minute deletion window
  const isMessageWithin15Mins = (createdAt: string) => {
    const msgTime = new Date(createdAt).getTime();
    const now = Date.now();
    const diffInMins = (now - msgTime) / (1000 * 60);
    return diffInMins <= 15;
  };

  // Trigger confirmation modal or error toast for deleting a message
  const promptDeleteMessage = (msg: MessageItem) => {
    if (!isMessageWithin15Mins(msg.created_at)) {
      showToast(t("deleteWindowExceeded"), "error");
      return;
    }

    setConfirmModal({
      isOpen: true,
      type: "delete_msg",
      targetData: msg,
      title: t("confirmDeleteMsgTitle"),
      description: t("confirmDeleteMsgDesc"),
      actionType: "delete",
      confirmText: t("deleteMessage"),
    });
  };

  // Execute soft message deletion (Sets is_deleted: true column in DB)
  const executeDeleteMessage = async (msg: MessageItem) => {
    if (!currentUser) return;
    if (!isMessageWithin15Mins(msg.created_at)) {
      showToast(t("deleteWindowExceeded"), "error");
      closeConfirmModal();
      return;
    }

    setIsModalActionLoading(true);
    try {
      const { error } = await supabase
        .from("messages")
        .update({ is_deleted: true })
        .eq("id", msg.id)
        .eq("sender_id", currentUser.id);

      if (error) {
        console.error("Error deleting message:", error);
        showToast("Error deleting message: " + error.message, "error");
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, is_deleted: true } : m))
        );
        showToast(t("msgDeleteSuccess"), "success");
      }
    } catch (err) {
      console.error("Error deleting message:", err);
      showToast("Error deleting message", "error");
    } finally {
      setIsModalActionLoading(false);
      closeConfirmModal();
    }
  };

  // Handle modal confirmation dispatch
  const handleConfirmModalAction = async () => {
    if (!confirmModal.type || !confirmModal.targetData) return;

    switch (confirmModal.type) {
      case "add_chat":
        await handleDirectStartChat(confirmModal.targetData as Profile);
        break;
      case "delete_conv":
        await executeDeleteConversation(confirmModal.targetData as ConversationItem);
        break;
      case "edit_msg":
        await executeEditMessage(confirmModal.targetData as { msg: MessageItem; newContent: string });
        break;
      case "delete_msg":
        await executeDeleteMessage(confirmModal.targetData as MessageItem);
        break;
    }
  };

  const closeConfirmModal = () => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  };

  // Load active chat messages & mark read
  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      return;
    }

    async function fetchMessages() {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedChat)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setMessages(data as MessageItem[]);
      }
    }

    fetchMessages();
    markConversationAsRead(selectedChat);
  }, [selectedChat, currentUser?.id, markConversationAsRead, supabase]);

  // Global Realtime Listener for messages across all user's conversations
  useEffect(() => {
    if (!currentUser?.id) return;

    const globalChannel = supabase
      .channel("global_messages_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const newMsg = payload.new as MessageItem;

            // If message belongs to current open chat
            if (selectedChat && newMsg.conversation_id === selectedChat) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });

              if (newMsg.sender_id !== currentUser.id) {
                await supabase
                  .from("messages")
                  .update({ is_read: true })
                  .eq("id", newMsg.id);
              }
            }

            // Update sidebar conversation list
            setConversations((prev) => {
              const existingIndex = prev.findIndex((c) => c.id === newMsg.conversation_id);
              const formattedTime = new Date(newMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              if (existingIndex !== -1) {
                const updatedList = [...prev];
                const targetConv = { ...updatedList[existingIndex] };
                targetConv.lastMessage = newMsg.content;
                targetConv.time = formattedTime;
                targetConv.updated_at = newMsg.created_at;

                // Increment unread count if message is from another user & not in current active chat
                if (newMsg.sender_id !== currentUser.id && newMsg.conversation_id !== selectedChat) {
                  targetConv.unreadCount = (targetConv.unreadCount || 0) + 1;
                }

                // Move conversation to top
                updatedList.splice(existingIndex, 1);
                return [targetConv, ...updatedList];
              } else {
                fetchConversations(currentUser.id);
                return prev;
              }
            });
          } else if (payload.eventType === "UPDATE") {
            const updatedMsg = payload.new as MessageItem;
            if (selectedChat && updatedMsg.conversation_id === selectedChat) {
              setMessages((prev) =>
                prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
              );
            }
          } else if (payload.eventType === "DELETE") {
            const deletedId = payload.old.id;
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(globalChannel);
    };
  }, [currentUser?.id, selectedChat, fetchConversations, supabase]);

  // Send message
  const handleSendMessage = async () => {
    if (!message.trim() || !selectedChat || !currentUser) return;
    const content = message.trim();
    setMessage("");

    const { error } = await supabase.from("messages").insert({
      conversation_id: selectedChat,
      sender_id: currentUser.id,
      content,
    });

    if (error) {
      console.error("Failed to send message:", error);
      showToast("Failed to send message: " + error.message, "error");
    }
  };

  // Filter saved conversations locally
  const filteredConversations = conversations.filter((chat) => {
    const q = sidebarSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      chat.otherUser.username.toLowerCase().includes(q) ||
      (chat.otherUser.display_name && chat.otherUser.display_name.toLowerCase().includes(q)) ||
      (chat.lastMessage && chat.lastMessage.toLowerCase().includes(q))
    );
  });

  const activeConversation = conversations.find((c) => c.id === selectedChat);
  const isOtherUserOnline = activeConversation ? onlineUserIds.has(activeConversation.otherUser.id) : false;

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-muted/30">
      {/* Sidebar Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="hidden md:inline-flex h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
              title={t("toggleSidebar")}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-bold truncate">{t("conversations")}</h2>
          </div>
          <Button
            size="sm"
            onClick={() => setIsNewChatModalOpen(true)}
            className="gap-1.5 text-xs font-semibold shadow-xs shrink-0"
          >
            <MessageSquarePlus className="h-4 w-4" />
            <span>{t("newChat")}</span>
          </Button>
        </div>

        {/* Local Search Input */}
        <div className="relative">
          <Search className="absolute ltr:left-3 rtl:right-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchSavedChats")}
            value={sidebarSearchQuery}
            onChange={(e) => setSidebarSearchQuery(e.target.value)}
            className="ltr:pl-9 rtl:pr-9"
          />
        </div>
      </div>

      {/* Saved Conversations List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredConversations.length > 0 ? (
            filteredConversations.map((chat) => {
              const hasUnread = (chat.unreadCount || 0) > 0;
              const displayName = chat.otherUser.display_name || chat.otherUser.username;
              const isUserOnline = onlineUserIds.has(chat.otherUser.id);

              const isLastMsgDeleted =
                chat.lastMessage === "تم حذف هذه الرسالة" ||
                chat.lastMessage === "This message was deleted";

              const isCallLog = chat.lastMessage?.startsWith("[call_log:");
              let displayLastMsg = chat.lastMessage;

              if (isLastMsgDeleted) {
                displayLastMsg = t("messageDeleted");
              } else if (isCallLog && chat.lastMessage) {
                const parts = chat.lastMessage.replace("[call_log:", "").replace("]", "").split(":");
                const logType = parts[0];
                if (logType === "answered") {
                  displayLastMsg = `📞 ${tCall("voiceCall")}`;
                } else if (logType === "missed") {
                  displayLastMsg = `📞 ${tCall("callLogMissed")}`;
                } else if (logType === "rejected") {
                  displayLastMsg = `📞 ${tCall("callLogRejected")}`;
                } else if (logType === "busy") {
                  displayLastMsg = `📞 ${tCall("callLogBusy")}`;
                } else {
                  displayLastMsg = `📞 ${tCall("voiceCall")}`;
                }
              }

              return (
                <div
                  key={chat.id}
                  onClick={() => {
                    setSelectedChat(chat.id);
                    markConversationAsRead(chat.id);
                  }}
                  className={`group flex items-center justify-between gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                    selectedChat === chat.id ? "bg-accent shadow-xs" : "hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <div className="relative shrink-0">
                      <Avatar className="h-10 w-10 border border-border/50">
                        <AvatarImage src={chat.otherUser.avatar_url} />
                        <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {isUserOnline && (
                        <span className="absolute bottom-0 ltr:right-0 rtl:left-0 block h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-background" />
                      )}
                      {hasUnread && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-xs animate-pulse md:hidden">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex justify-between items-baseline">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <span className={`truncate text-sm ${hasUnread ? "font-bold text-foreground" : "font-semibold text-foreground/90"}`}>
                            {displayName}
                          </span>
                        </div>
                        <span className={`text-[11px] ms-1 shrink-0 ${hasUnread ? "font-bold text-primary" : "text-muted-foreground"}`}>
                          {chat.time}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p className={`text-xs truncate flex-1 ${hasUnread ? "font-bold text-foreground" : "text-muted-foreground"} ${isLastMsgDeleted ? "italic opacity-80" : ""}`}>
                          {displayLastMsg || <span className="italic text-[11px]">{t("noMessagesYet")}</span>}
                        </p>
                        {hasUnread && (
                          <span className="hidden md:inline-flex items-center justify-center min-w-5 h-5 px-1.5 py-0.5 text-[11px] font-bold rounded-full bg-primary text-primary-foreground shrink-0 shadow-xs">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Delete Conversation Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => promptDeleteConversation(chat, e)}
                    title={t("deleteConvText")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground space-y-3">
              <p>{conversations.length === 0 ? t("noConversationsYet") : t("noUsersFound")}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsNewChatModalOpen(true)}
                className="gap-1.5"
              >
                <UserPlus className="h-4 w-4" />
                <span>{t("newChat")}</span>
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  if (loadingUser) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-background relative">
      {/* Toast Notification Banner */}
      <ToastNotification
        message={toast?.message || null}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      {/* System Action Confirmation Modal */}
      <ActionConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={closeConfirmModal}
        onConfirm={handleConfirmModalAction}
        title={confirmModal.title}
        description={confirmModal.description}
        actionType={confirmModal.actionType}
        confirmText={confirmModal.confirmText}
        isLoading={isModalActionLoading}
      />

      {/* Voice Call Modal Overlay */}
      <VoiceCallModal
        callState={audioCall.callState}
        otherUser={audioCall.otherUser}
        durationSeconds={audioCall.durationSeconds}
        isMuted={audioCall.isMuted}
        onAccept={audioCall.acceptCall}
        onReject={audioCall.rejectCall}
        onEndCall={audioCall.endCall}
        onToggleMute={audioCall.toggleMute}
        remoteAudioRef={audioCall.remoteAudioRef}
      />

      {/* Mobile Sidebar View (shown when no chat is selected on mobile) */}
      <div className={`w-full flex-col h-full md:hidden ${selectedChat ? "hidden" : "flex"}`}>
        {renderSidebarContent()}
      </div>

      {/* Desktop Sidebar View (Collapsible) */}
      <div
        className={`hidden md:flex flex-col border-r transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${
          isSidebarOpen ? "w-80 opacity-100" : "w-0 opacity-0 border-none"
        }`}
      >
        {renderSidebarContent()}
      </div>

      {/* Main Chat Area (Mobile: visible when chat selected, Desktop: always visible) */}
      <div
        className={`flex-1 flex-col min-w-0 h-full overflow-hidden ${
          selectedChat ? "flex" : "hidden md:flex"
        }`}
      >
        {selectedChat && activeConversation ? (
          <>
            {/* Active Chat Header */}
            <div className="shrink-0 flex items-center justify-between p-3 sm:p-4 border-b bg-background/95 backdrop-blur z-10 supports-backdrop-filter:bg-background/60">
              <div className="flex items-center gap-2 sm:gap-3 overflow-hidden me-2">
                {/* Mobile Back Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedChat(null)}
                  className="h-9 w-9 text-muted-foreground hover:text-foreground md:hidden shrink-0"
                  title={t("backToChats")}
                >
                  <ChevronRight className="h-5 w-5 rtl:rotate-0 ltr:rotate-180" />
                </Button>

                {/* Desktop Toggle Sidebar Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSidebar}
                  className="hidden md:inline-flex h-9 w-9 text-muted-foreground hover:text-foreground shrink-0 me-1"
                  title={t("toggleSidebar")}
                >
                  {isSidebarOpen ? (
                    <PanelLeftClose className="h-5 w-5" />
                  ) : (
                    <PanelLeftOpen className="h-5 w-5 text-primary" />
                  )}
                </Button>

                <div className="relative shrink-0">
                  <Avatar className="h-9 w-9 sm:h-10 sm:w-10 border border-border/50">
                    <AvatarImage src={activeConversation.otherUser.avatar_url} />
                    <AvatarFallback>{(activeConversation.otherUser.display_name || activeConversation.otherUser.username)[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {isOtherUserOnline && (
                    <span className="absolute bottom-0 ltr:right-0 rtl:left-0 block h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-emerald-500 ring-2 ring-background" />
                  )}
                </div>
                <div className="overflow-hidden">
                  <h3 className="font-bold text-sm sm:text-base leading-snug truncate">
                    {activeConversation.otherUser.display_name || activeConversation.otherUser.username}
                  </h3>
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="text-[11px] text-muted-foreground truncate">@{activeConversation.otherUser.username}</span>
                    {isOtherUserOnline ? (
                      <span className="text-xs text-emerald-500 font-medium shrink-0">• {t("online")}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground font-medium shrink-0">• {t("offline")}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Phone, Video, Delete Conv, and Close Chat */}
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (activeConversation) {
                      audioCall.startCall({
                        id: activeConversation.otherUser.id,
                        name: activeConversation.otherUser.display_name || activeConversation.otherUser.username,
                        username: activeConversation.otherUser.username,
                        avatarUrl: activeConversation.otherUser.avatar_url,
                        conversationId: activeConversation.id,
                      });
                    }
                  }}
                  title={tCall("voiceCall")}
                  className="hover:bg-emerald-500/10 hover:text-emerald-500 text-muted-foreground transition-colors"
                >
                  <Phone className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon">
                  <Video className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => promptDeleteConversation(activeConversation)}
                  title={t("deleteConvText")}
                  className="hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedChat(null)}
                  title={t("closeChat")}
                  className="hover:bg-muted text-muted-foreground transition-colors"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Chat Messages Area */}
            <ScrollArea className="flex-1 min-h-0 p-4">
              <div className="space-y-4">
                {messages.map((msg) => {
                  const isMe = msg.sender_id === currentUser.id;
                  const isDeleted = Boolean(
                    msg.is_deleted ||
                    msg.content === t("messageDeleted") ||
                    msg.content === "تم حذف هذه الرسالة" ||
                    msg.content === "This message was deleted"
                  );
                  const isEditing = editingMsgId === msg.id;
                  const isCallLog = msg.content.startsWith("[call_log:");
                  const isWithin15Mins = isMessageWithin15Mins(msg.created_at);
                  const msgTime = new Date(msg.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[85%] ${
                        isMe ? "ltr:ml-auto rtl:mr-auto items-end" : "ltr:mr-auto rtl:ml-auto items-start"
                      }`}
                    >
                      {/* Inner Container wrapped tightly around bubble for exact button attachment */}
                      <div className="relative group inline-flex items-center">
                        {/* Hover action menu for sent messages */}
                        {isMe && !isEditing && !isDeleted && !isCallLog && (
                          <div className="absolute top-1/2 -translate-y-1/2 ltr:-left-16 rtl:-right-16 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all duration-150 bg-background/90 backdrop-blur-xs p-1 rounded-lg border shadow-xs z-10 shrink-0">
                            {/* Edit Button */}
                            <button
                              onClick={() => {
                                setEditingMsgId(msg.id);
                                setEditingMsgContent(msg.content);
                              }}
                              className="p-1 text-muted-foreground hover:text-primary transition-colors rounded-sm"
                              title={t("editMessage")}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={() => promptDeleteMessage(msg)}
                              className={`p-1 transition-colors rounded-sm ${
                                isWithin15Mins
                                  ? "text-muted-foreground hover:text-destructive"
                                  : "text-muted-foreground/40 hover:text-muted-foreground/60"
                              }`}
                              title={t("deleteMessage")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Inline Editing Form, Call Log Bubble, or Normal Message Bubble */}
                        {isCallLog ? (
                          (() => {
                            const parts = msg.content.replace("[call_log:", "").replace("]", "").split(":");
                            const logType = parts[0];
                            const durationSec = parts[1] ? parseInt(parts[1], 10) : 0;

                            const formatSecs = (sec: number) => {
                              const m = Math.floor(sec / 60);
                              const s = sec % 60;
                              return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
                            };

                            let IconComponent = PhoneOutgoing;
                            let title = tCall("callLogOutgoing");
                            const subtext = durationSec > 0 ? formatSecs(durationSec) : "";
                            let isMissedOrRejected = false;

                            if (logType === "answered") {
                              if (isMe) {
                                IconComponent = PhoneOutgoing;
                                title = tCall("callLogOutgoing");
                              } else {
                                IconComponent = PhoneIncoming;
                                title = tCall("callLogIncoming");
                              }
                            } else if (logType === "rejected") {
                              IconComponent = PhoneOff;
                              title = tCall("callLogRejected");
                              isMissedOrRejected = true;
                            } else if (logType === "missed") {
                              IconComponent = PhoneMissed;
                              title = tCall("callLogMissed");
                              isMissedOrRejected = true;
                            } else if (logType === "busy") {
                              IconComponent = PhoneOff;
                              title = tCall("callLogBusy");
                              isMissedOrRejected = true;
                            }

                            return (
                              <div
                                className={`flex items-center gap-3 p-3 rounded-2xl border shadow-2xs transition-all ${
                                  isMissedOrRejected
                                    ? "bg-destructive/10 border-destructive/20 text-foreground"
                                    : "bg-muted/90 border-border text-foreground"
                                }`}
                              >
                                <div
                                  className={`p-2.5 rounded-full shrink-0 ${
                                    isMissedOrRejected
                                      ? "bg-destructive/20 text-destructive"
                                      : "bg-emerald-500/20 text-emerald-500"
                                  }`}
                                >
                                  <IconComponent className="h-4 w-4 rtl:-scale-x-100" />
                                </div>
                                <div className="flex-1 min-w-0 me-2">
                                  <p className="text-xs font-bold truncate leading-snug">{title}</p>
                                  {subtext && (
                                    <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                                      {subtext}
                                    </p>
                                  )}
                                </div>

                                {/* Re-call Button for Missed/Rejected Calls */}
                                {!isMe && activeConversation && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      audioCall.startCall({
                                        id: activeConversation.otherUser.id,
                                        name: activeConversation.otherUser.display_name || activeConversation.otherUser.username,
                                        username: activeConversation.otherUser.username,
                                        avatarUrl: activeConversation.otherUser.avatar_url,
                                        conversationId: activeConversation.id,
                                      });
                                    }}
                                    className="h-7 text-[11px] px-2.5 gap-1 shrink-0 rounded-full border-primary/40 hover:bg-primary hover:text-primary-foreground transition-all shadow-2xs"
                                  >
                                    <Phone className="h-3 w-3" />
                                    <span>{tCall("callBack")}</span>
                                  </Button>
                                )}
                              </div>
                            );
                          })()
                        ) : isEditing ? (
                          <div className="flex items-center gap-2 w-full min-w-65 max-w-md bg-muted p-2 rounded-xl border">
                            <Input
                              value={editingMsgContent}
                              onChange={(e) => setEditingMsgContent(e.target.value)}
                              className="text-sm bg-background flex-1"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") promptEditMessage(msg);
                                if (e.key === "Escape") setEditingMsgId(null);
                              }}
                            />
                            <Button
                              size="icon"
                              className="h-8 w-8 rounded-lg shrink-0"
                              onClick={() => promptEditMessage(msg)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg shrink-0 text-muted-foreground"
                              onClick={() => setEditingMsgId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : isDeleted ? (
                          <div
                            className={`px-3.5 py-2 rounded-2xl text-xs italic select-none border shadow-2xs flex items-center gap-1.5 ${
                              isMe
                                ? "bg-muted/70 text-muted-foreground border-border/40 ltr:rounded-tr-sm rtl:rounded-tl-sm"
                                : "bg-muted/70 text-muted-foreground border-border/40 ltr:rounded-tl-sm rtl:rounded-tr-sm"
                            }`}
                          >
                            <Trash2 className="h-3.5 w-3.5 opacity-60 shrink-0" />
                            <span>{t("messageDeleted")}</span>
                          </div>
                        ) : (
                          <div
                            className={`px-4 py-2 rounded-2xl wrap-break-word ${
                              isMe
                                ? "bg-primary text-primary-foreground ltr:rounded-tr-sm rtl:rounded-tl-sm"
                                : "bg-muted ltr:rounded-tl-sm rtl:rounded-tr-sm"
                            }`}
                          >
                            {msg.content}
                          </div>
                        )}
                      </div>

                      {/* Message Footer: Timestamp & Edited indicator */}
                      <div className="flex items-center gap-1.5 mt-1 mx-1 text-[10px] text-muted-foreground select-none">
                        <span>{msgTime}</span>
                        {msg.is_edited && !isDeleted && (
                          <>
                            <span className="opacity-40">•</span>
                            <span className="italic font-medium text-primary/80">{t("edited")}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Chat Input */}
            <div className="shrink-0 p-4 bg-background border-t">
              <div className="flex gap-2 items-center bg-muted/50 p-1 rounded-full border">
                <Input
                  className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-4"
                  placeholder={t("typeMessage")}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="rounded-full shrink-0 h-10 w-10 transition-all active:scale-95"
                  disabled={!message.trim()}
                  onClick={handleSendMessage}
                >
                  <Send className="h-4 w-4 rtl:-scale-x-100" />
                  <span className="sr-only">{t("send")}</span>
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* Empty / Initial Welcome Screen */
          <div className="flex-1 flex items-center justify-center flex-col text-muted-foreground p-6 text-center space-y-4">
            <div className="relative">
              <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <Sparkles className="h-12 w-12" />
              </div>
            </div>
            <div className="space-y-1 max-w-sm">
              <h2 className="font-bold text-xl text-foreground">{t("noConversation")}</h2>
              <p className="text-sm text-muted-foreground">{t("welcomeSubtext")}</p>
            </div>

            {/* Start New Chat & Desktop Expand Sidebar Button */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Button
                onClick={() => setIsNewChatModalOpen(true)}
                className="gap-2 px-6 py-5 rounded-full font-semibold shadow-md"
              >
                <MessageSquarePlus className="h-5 w-5" />
                <span>{t("newChat")}</span>
              </Button>

              {!isSidebarOpen && (
                <Button
                  variant="outline"
                  onClick={toggleSidebar}
                  className="hidden md:flex items-center gap-2 px-5 py-5 rounded-full font-semibold border-primary/30 hover:bg-primary/10"
                >
                  <PanelLeftOpen className="h-5 w-5 text-primary" />
                  <span>{t("toggleSidebar")}</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* System-wide User Search Modal (Dialog) */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-background border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 relative">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-lg">{t("systemSearchTitle")}</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => {
                  setIsNewChatModalOpen(false);
                  setSystemSearchQuery("");
                  setSystemSearchResults([]);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">{t("systemSearchSub")}</p>

            {/* System Search Input */}
            <div className="relative">
              <Search className="absolute ltr:left-3 rtl:right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("searchSystemUsers")}
                value={systemSearchQuery}
                onChange={(e) => setSystemSearchQuery(e.target.value)}
                autoFocus
                className="ltr:pl-9 rtl:pr-9"
              />
              {isSearchingSystem && (
                <Loader2 className="absolute ltr:right-3 rtl:left-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Search Suggestions Results */}
            <ScrollArea className="max-h-60 overflow-y-auto border rounded-xl p-2 bg-muted/20">
              {systemSearchResults.length > 0 ? (
                <div className="space-y-1">
                  {systemSearchResults.map((user) => {
                    const userDisplayName = user.display_name || user.username;
                    return (
                      <div
                        key={user.id}
                        onClick={() => handleDirectStartChat(user)}
                        className="flex items-center justify-between p-2.5 rounded-lg cursor-pointer hover:bg-accent/70 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={user.avatar_url || `https://avatar.vercel.sh/${user.username}`} />
                            <AvatarFallback>{userDisplayName[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-foreground">{userDisplayName}</span>
                            <span className="text-[11px] text-muted-foreground">@{user.username}</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="h-8 text-xs shrink-0 gap-1"
                          disabled={creatingChat}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDirectStartChat(user);
                          }}
                        >
                          {t("startChat")}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : systemSearchQuery.trim().length > 0 && !isSearchingSystem ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {t("noUsersFound")}
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  {t("searchSystemUsers")}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
