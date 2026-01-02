import { Badge, Input, Card, Empty, Button, Checkbox } from "@/components";
import { useHistory } from "@/hooks";
import { PageLayout } from "@/layouts";
import { MessageCircleIcon, Search, Trash2Icon, XIcon, CheckSquareIcon } from "lucide-react";
import moment from "moment";
import { useNavigate } from "react-router-dom";
import { BatchDeleteConfirmation } from "./components/BatchDeleteConfirmation";

const Dashboard = () => {
  const conversations = useHistory();
  const navigate = useNavigate();
  
  const {
    isSelectionMode,
    selectedIds,
    batchDeleteConfirm,
    toggleSelectionMode,
    toggleSelectItem,
    selectAll,
    deselectAll,
    handleBatchDeleteConfirm,
    confirmBatchDelete,
    cancelBatchDelete,
  } = conversations;
  
  // Group conversations by date
  const groupedConversations = conversations.conversations.reduce(
    (acc, doc) => {
      const dateKey = moment(doc.updatedAt).format("YYYY-MM-DD");
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(doc);
      return acc;
    },
    {} as Record<string, typeof conversations.conversations>
  );

  // Sort dates in descending order (most recent first)
  const sortedDates = Object.keys(groupedConversations).sort((a, b) =>
    moment(b).diff(moment(a))
  );

  return (
    <PageLayout
      title="All conversations"
      description="View all your conversations"
    >
      <>
        {conversations.conversations.length === 0 ? (
          <Empty
            isLoading={conversations.isLoading}
            icon={MessageCircleIcon}
            title="No conversations found"
            description="Start a new conversation to get started"
          />
        ) : (
          <div className="flex flex-col gap-6 pb-8">
            {/* Search and Batch Actions */}
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="relative w-1/3">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search conversations..."
                  className="pl-9 focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={conversations.search}
                  onChange={(e) => conversations.setSearch(e.target.value)}
                />
              </div>
              
              <div className="flex items-center gap-2">
                {isSelectionMode ? (
                  <>
                    <span className="text-sm text-muted-foreground">
                      {selectedIds.size} selected
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectedIds.size === conversations.conversations.length ? deselectAll : selectAll}
                    >
                      <CheckSquareIcon className="h-4 w-4 mr-1" />
                      {selectedIds.size === conversations.conversations.length ? "Deselect All" : "Select All"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBatchDeleteConfirm}
                      disabled={selectedIds.size === 0}
                    >
                      <Trash2Icon className="h-4 w-4 mr-1" />
                      Delete ({selectedIds.size})
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleSelectionMode}
                    >
                      <XIcon className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectionMode}
                  >
                    <CheckSquareIcon className="h-4 w-4 mr-1" />
                    Select
                  </Button>
                )}
              </div>
            </div>
            
            {sortedDates
              .filter((dateKey) =>
                conversations?.search?.length === 0
                  ? true
                  : groupedConversations?.[dateKey]?.some((doc) =>
                      doc?.title
                        .toLowerCase()
                        .includes(conversations?.search?.toLowerCase() || "")
                    )
              )
              .map((dateKey) => (
                <div key={dateKey} className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground select-none font-medium">
                    {moment(dateKey).format("ddd, MMM D")}
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {groupedConversations[dateKey].map((doc) => (
                      <Card
                        key={doc.id}
                        className={`shadow-none select-none p-4 gap-0 group relative transition-all !bg-black/5 dark:!bg-white/5 hover:!border-primary/50 cursor-pointer ${
                          selectedIds.has(doc.id) ? "!border-primary ring-1 ring-primary" : ""
                        }`}
                        onClick={() => {
                          if (isSelectionMode) {
                            toggleSelectItem(doc.id);
                          } else {
                            navigate(`/chats/view/${doc.id}`);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isSelectionMode && (
                              <Checkbox
                                checked={selectedIds.has(doc.id)}
                                onCheckedChange={() => toggleSelectItem(doc.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            )}
                            <p className="line-clamp-1 text-sm mr-8">
                              {doc.title}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">
                              {doc.messages.length} messages
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {moment(doc.updatedAt).format("hh:mm A")}
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
        
        <BatchDeleteConfirmation
          isOpen={batchDeleteConfirm}
          count={selectedIds.size}
          onCancel={cancelBatchDelete}
          onConfirm={confirmBatchDelete}
        />
      </>
    </PageLayout>
  );
};

export default Dashboard;
