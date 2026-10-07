"use client";

import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export interface ToastNotificationProps {
  message: string | null;
  type?: "success" | "error" | "info";
  onClose: () => void;
  duration?: number;
}

export function ToastNotification({
  message,
  type = "error",
  onClose,
  duration = 5000,
}: ToastNotificationProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  const getTypeStyles = () => {
    switch (type) {
      case "success":
        return {
          bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
          icon: CheckCircle2,
        };
      case "info":
        return {
          bg: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
          icon: Info,
        };
      case "error":
      default:
        return {
          bg: "bg-destructive/10 border-destructive/30 text-destructive",
          icon: AlertCircle,
        };
    }
  };

  const styles = getTypeStyles();
  const IconComponent = styles.icon;

  return (
    <div className="fixed bottom-5 ltr:right-5 rtl:left-5 z-50 max-w-md w-full animate-in slide-in-from-bottom-5 duration-300">
      <div className={`flex items-start gap-3 p-4 rounded-2xl border shadow-xl backdrop-blur-md ${styles.bg}`}>
        <IconComponent className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="flex-1 text-sm font-medium leading-relaxed wrap-break-word">{message}</div>
        <button
          onClick={onClose}
          className="text-current opacity-70 hover:opacity-100 transition-opacity p-0.5"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">إغلاق</span>
        </button>
      </div>
    </div>
  );
}
