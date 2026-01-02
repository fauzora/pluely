import { useState, useEffect, useCallback } from "react";
import {
  getAllConversations,
  deleteConversation,
  DOWNLOAD_SUCCESS_DISPLAY_MS,
} from "@/lib";
import { ChatConversation } from "@/types/completion";

export type UseHistoryType = ReturnType<typeof useHistory>;

export interface UseHistoryReturn {
  // State
  conversations: ChatConversation[];
  selectedConversationId: string | null;
  viewingConversation: ChatConversation | null;
  downloadedConversations: Set<string>;
  deleteConfirm: string | null;
  isDownloaded: boolean;
  isAttached: boolean;
  
  // Batch Selection State
  isSelectionMode: boolean;
  selectedIds: Set<string>;
  batchDeleteConfirm: boolean;

  // Actions
  handleViewConversation: (conversation: ChatConversation) => void;
  handleDownloadConversation: (
    conversation: ChatConversation,
    e: React.MouseEvent
  ) => void;
  handleDeleteConfirm: (conversationId: string) => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
  handleAttachToOverlay: (conversationId: string) => void;
  handleDownload: (
    conversation: ChatConversation | null,
    e: React.MouseEvent
  ) => void;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  
  // Batch Selection Actions
  toggleSelectionMode: () => void;
  toggleSelectItem: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  handleBatchDeleteConfirm: () => void;
  confirmBatchDelete: () => void;
  cancelBatchDelete: () => void;
  
  // Utilities
  refreshConversations: () => void;
  isLoading: boolean;
}

export function useHistory(): UseHistoryReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [search, setSearch] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [viewingConversation, setViewingConversation] =
    useState<ChatConversation | null>(null);

  const [downloadedConversations, setDownloadedConversations] = useState<
    Set<string>
  >(new Set());

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isAttached, setIsAttached] = useState(false);
  
  // Batch Selection State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);

  // Function to refresh conversations
  const refreshConversations = useCallback(async () => {
    try {
      setIsLoading(true);
      const loadedConversations = await getAllConversations();
      setConversations(loadedConversations);
    } catch (error) {
      console.error("Failed to load conversations:", error);
      setConversations([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load conversations when component mounts or popover opens
  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const handleViewConversation = (conversation: ChatConversation) => {
    setViewingConversation(conversation);
  };

  const handleDownloadConversation = (
    conversation: ChatConversation,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();

    // Show download success state
    setDownloadedConversations((prev) => new Set(prev).add(conversation.id));

    try {
      // Convert conversation to markdown format
      const markdown = generateConversationMarkdown(conversation);

      // Create and download the file
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = generateFilename(conversation.title);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download conversation:", error);
      // Remove from success state if download failed
      setDownloadedConversations((prev) => {
        const newSet = new Set(prev);
        newSet.delete(conversation.id);
        return newSet;
      });
      return;
    }

    // Clear success state after display timeout
    setTimeout(() => {
      setDownloadedConversations((prev) => {
        const newSet = new Set(prev);
        newSet.delete(conversation.id);
        return newSet;
      });
    }, DOWNLOAD_SUCCESS_DISPLAY_MS);
  };

  const handleDeleteConfirm = (conversationId: string) => {
    setDeleteConfirm(conversationId);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;

    try {
      setSelectedConversationId(null);
      setViewingConversation(null);
      await deleteConversation(deleteConfirm);
      setConversations((prev) => prev.filter((c) => c.id !== deleteConfirm));

      // Emit event to notify other components about deletion
      window.dispatchEvent(
        new CustomEvent("conversationDeleted", {
          detail: deleteConfirm,
        })
      );
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  // Batch Selection Functions
  const toggleSelectionMode = () => {
    setIsSelectionMode((prev) => !prev);
    setSelectedIds(new Set());
  };

  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(conversations.map((c) => c.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleBatchDeleteConfirm = () => {
    if (selectedIds.size > 0) {
      setBatchDeleteConfirm(true);
    }
  };

  const confirmBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    try {
      // Delete all selected conversations
      for (const id of selectedIds) {
        await deleteConversation(id);
      }
      
      // Update local state
      setConversations((prev) => 
        prev.filter((c) => !selectedIds.has(c.id))
      );

      // Emit events for each deletion
      selectedIds.forEach((id) => {
        window.dispatchEvent(
          new CustomEvent("conversationDeleted", {
            detail: id,
          })
        );
      });

      // Reset selection state
      setSelectedIds(new Set());
      setIsSelectionMode(false);
    } catch (error) {
      console.error("Failed to delete conversations:", error);
    } finally {
      setBatchDeleteConfirm(false);
    }
  };

  const cancelBatchDelete = () => {
    setBatchDeleteConfirm(false);
  };

  const handleAttachToOverlay = (conversationId: string) => {
    // Use localStorage to communicate between windows
    localStorage.setItem(
      "pluely-conversation-selected",
      JSON.stringify({ id: conversationId, timestamp: Date.now() })
    );
    setIsAttached(true);
    setTimeout(() => {
      setIsAttached(false);
    }, DOWNLOAD_SUCCESS_DISPLAY_MS);
  };

  const handleDownload = (
    conversation: ChatConversation | null,
    e: React.MouseEvent
  ) => {
    if (conversation) {
      handleDownloadConversation(conversation, e);
      setIsDownloaded(true);
      setTimeout(() => {
        setIsDownloaded(false);
      }, DOWNLOAD_SUCCESS_DISPLAY_MS);
    }
  };

  // Helper functions
  const generateConversationMarkdown = (
    conversation: ChatConversation
  ): string => {
    let markdown = `# ${conversation.title}\n\n`;
    markdown += `**Created:** ${new Date(
      conversation.createdAt
    ).toLocaleString()}\n`;
    markdown += `**Updated:** ${new Date(
      conversation.updatedAt
    ).toLocaleString()}\n`;
    markdown += `**Messages:** ${conversation.messages.length}\n\n---\n\n`;

    conversation.messages.forEach((message, index) => {
      const roleLabel = message.role.toUpperCase();
      markdown += `## ${roleLabel}: ${message.content}\n`;

      if (index < conversation.messages.length - 1) {
        markdown += "\n";
      }
    });

    return markdown;
  };

  const generateFilename = (title: string): string => {
    const sanitizedTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    return `${sanitizedTitle.substring(0, 16)}.md`;
  };

  return {
    // State
    conversations,
    selectedConversationId,
    viewingConversation,
    downloadedConversations,
    deleteConfirm,
    isDownloaded,
    isAttached,
    
    // Batch Selection State
    isSelectionMode,
    selectedIds,
    batchDeleteConfirm,

    // Actions
    handleViewConversation,
    handleDownloadConversation,
    handleDeleteConfirm,
    confirmDelete,
    cancelDelete,
    handleAttachToOverlay,
    handleDownload,
    
    // Batch Selection Actions
    toggleSelectionMode,
    toggleSelectItem,
    selectAll,
    deselectAll,
    handleBatchDeleteConfirm,
    confirmBatchDelete,
    cancelBatchDelete,
    
    // Utilities
    refreshConversations,
    search,
    setSearch,
    isLoading,
  };
}
