"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Download, Monitor, X } from "lucide-react";
import { Button } from "./ui/button";
import { ToastNotification } from "./ui/toast-notification";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstaller() {
  const t = useTranslations("Pwa");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  useEffect(() => {
    // Register Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => console.log("Service Worker registered successfully:", reg.scope))
        .catch((err) => console.error("Service Worker registration failed:", err));
    }

    // Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setToast({ message: t("installSuccess"), type: "success" });
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [t]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
      setIsModalOpen(false);
    } else {
      // Show manual installation instructions modal
      setIsModalOpen(true);
    }
  };

  if (isInstalled) return null;

  return (
    <>
      <ToastNotification
        message={toast?.message || null}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      {/* Navbar / Floating Install Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleInstallClick}
        className="gap-1.5 border-primary/40 hover:bg-primary/10 text-xs font-semibold rounded-full shadow-2xs transition-all"
        title={t("installTooltip")}
      >
        <Download className="h-3.5 w-3.5 text-primary" />
        <span className="hidden sm:inline">{t("installApp")}</span>
      </Button>

      {/* Manual Install Instructions Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-background border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-lg">{t("modalTitle")}</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setIsModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground">{t("modalSub")}</p>

              <div className="bg-muted/40 p-3 rounded-xl border space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-primary shrink-0">1.</span>
                  <span>{t("stepChromeDesktop")}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-primary shrink-0">2.</span>
                  <span>{t("stepMobile")}</span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-full px-5 text-xs font-semibold"
                >
                  {t("gotIt")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
