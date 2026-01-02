import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Monitor, Copy, Check, X } from "lucide-react";
import { Card, Button } from "@/components";

interface MultiMonitorSupport {
  supported: boolean;
  session_type: string;
  available_tools: string[];
  missing_tools: string[];
  install_command: string;
}

interface MultiMonitorWarningProps {
  showAlways?: boolean;
  onDismiss?: () => void;
}

export const MultiMonitorWarning = ({
  showAlways = false,
  onDismiss,
}: MultiMonitorWarningProps) => {
  const [support, setSupport] = useState<MultiMonitorSupport | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkSupport();
  }, []);

  const checkSupport = async () => {
    try {
      const result = await invoke<MultiMonitorSupport>(
        "check_multi_monitor_support"
      );
      setSupport(result);

      // Check if user previously dismissed this warning
      const dismissedKey = "multi_monitor_warning_dismissed";
      const wasDismissed = localStorage.getItem(dismissedKey);
      if (wasDismissed && !showAlways) {
        setDismissed(true);
      }
    } catch (error) {
      console.error("Failed to check multi-monitor support:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCommand = async () => {
    if (support?.install_command) {
      await navigator.clipboard.writeText(support.install_command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("multi_monitor_warning_dismissed", "true");
    setDismissed(true);
    onDismiss?.();
  };

  // Don't show if loading, supported, or dismissed
  if (loading || dismissed) {
    return null;
  }

  if (support?.supported && !showAlways) {
    return null;
  }

  // Show success state if showAlways and supported
  if (support?.supported && showAlways) {
    return (
      <Card className="p-4 bg-green-500/10 border-green-500/20">
        <div className="flex items-start gap-3">
          <Monitor className="size-5 text-green-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Multi-Monitor Screenshot Active
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Session: {support.session_type} • Tools:{" "}
              {support.available_tools.join(", ")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Screenshot will be captured from the monitor where your mouse is
              located.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-yellow-500/10 border-yellow-500/20">
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-5 text-yellow-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
              Multi-Monitor Screenshot Limited
            </p>
            {!showAlways && (
              <Button
                size="icon"
                variant="ghost"
                className="size-6 -mt-1 -mr-1"
                onClick={handleDismiss}
              >
                <X className="size-3" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Install additional tools to enable screenshot from the monitor where
            your mouse is located. Without this, screenshots will be taken from
            the primary monitor.
          </p>
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium">
              Session Type:{" "}
              <code className="px-1.5 py-0.5 bg-muted rounded">
                {support?.session_type || "unknown"}
              </code>
            </p>
            {support?.available_tools && support.available_tools.length > 0 && (
              <p className="text-xs">
                ✅ Available: {support.available_tools.join(", ")}
              </p>
            )}
            {support?.missing_tools && support.missing_tools.length > 0 && (
              <p className="text-xs">
                ❌ Missing: {support.missing_tools.join(", ")}
              </p>
            )}
          </div>
          {support?.install_command &&
            !support.install_command.startsWith("#") && (
              <div className="mt-3">
                <p className="text-xs font-medium mb-1.5">
                  Install command (run in terminal):
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-muted rounded text-xs font-mono overflow-x-auto">
                    {support.install_command}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyCommand}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="size-3" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          <p className="text-[10px] text-muted-foreground mt-3">
            After installing, restart Pluely to enable multi-monitor screenshot.
          </p>
        </div>
      </div>
    </Card>
  );
};
