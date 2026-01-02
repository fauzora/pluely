import { Button } from "@/components";

interface BatchDeleteConfirmationProps {
  isOpen: boolean;
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export const BatchDeleteConfirmation = ({
  isOpen,
  count,
  onCancel,
  onConfirm,
}: BatchDeleteConfirmationProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border rounded-lg p-6 max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-2">Delete {count} Conversations</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Are you sure you want to delete {count} conversation{count > 1 ? "s" : ""}? 
          This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete {count} Conversation{count > 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </div>
  );
};
