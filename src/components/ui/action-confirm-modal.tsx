"use client";

import React from "react";
import { AlertTriangle, Trash2, PlusCircle, Edit3, Loader2, X } from "lucide-react";
import { Button } from "./button";

export interface ActionConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  actionType: "delete" | "add" | "edit" | "warning";
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export function ActionConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  actionType,
  confirmText,
  cancelText = "إلغاء",
  isLoading = false,
}: ActionConfirmModalProps) {
  if (!isOpen) return null;

  const getThemeConfig = () => {
    switch (actionType) {
      case "delete":
        return {
          icon: Trash2,
          iconBg: "bg-destructive/10 text-destructive border-destructive/20",
          buttonVariant: "destructive" as const,
          defaultConfirmText: "حذف",
        };
      case "add":
        return {
          icon: PlusCircle,
          iconBg: "bg-primary/10 text-primary border-primary/20",
          buttonVariant: "default" as const,
          defaultConfirmText: "إضافة",
        };
      case "edit":
        return {
          icon: Edit3,
          iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
          buttonVariant: "default" as const,
          defaultConfirmText: "حفظ التعديلات",
        };
      case "warning":
      default:
        return {
          icon: AlertTriangle,
          iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
          buttonVariant: "outline" as const,
          defaultConfirmText: "تأكيد",
        };
    }
  };

  const config = getThemeConfig();
  const IconComponent = config.icon;
  const finalConfirmText = confirmText || config.defaultConfirmText;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="bg-background border rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-5 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute ltr:right-4 rtl:left-4 top-4 text-muted-foreground hover:text-foreground rounded-full p-1 transition-colors disabled:opacity-50"
        >
          <X className="h-5 w-5" />
          <span className="sr-only">إغلاق</span>
        </button>

        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full border ${config.iconBg} shrink-0`}>
            <IconComponent className="h-6 w-6" />
          </div>
          <div className="space-y-1.5 flex-1 pt-0.5">
            <h3 className="font-bold text-lg text-foreground leading-snug">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium rounded-xl"
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={config.buttonVariant}
            onClick={onConfirm}
            disabled={isLoading}
            className="px-5 py-2 text-sm font-semibold rounded-xl gap-2 min-w-25 justify-center"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>جاري التنفيذ...</span>
              </>
            ) : (
              <span>{finalConfirmText}</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
