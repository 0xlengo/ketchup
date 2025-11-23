"use client";

import { useState, useEffect } from "react";

export type NotificationType = "success" | "error" | "warning" | "info";

interface NotificationProps {
  message: string;
  type: NotificationType;
  duration?: number;
  onClose: () => void;
}

export default function Notification({
  message,
  type,
  duration = 5000,
  onClose,
}: NotificationProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const typeStyles = {
    success: "bg-emerald-50 border-emerald-200 text-emerald-800",
    error: "bg-red-50 border-red-200 text-red-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
  };

  const icons = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 min-w-[320px] max-w-md p-4 rounded-lg border-2 shadow-xl animate-slide-in-right ${typeStyles[type]}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0">{icons[type]}</span>
        <div className="flex-1">
          <p className="font-semibold text-sm leading-tight break-words">
            {message}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Hook para manejar notificaciones
export function useNotifications() {
  const [notifications, setNotifications] = useState<
    Array<{ id: string; message: string; type: NotificationType }>
  >([]);

  const showNotification = (
    message: string,
    type: NotificationType = "info",
    duration?: number
  ) => {
    const id = `notification-${Date.now()}-${Math.random()}`;
    setNotifications((prev) => [...prev, { id, message, type }]);

    if (duration !== undefined && duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const NotificationContainer = () => (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map((notification) => (
        <Notification
          key={notification.id}
          message={notification.message}
          type={notification.type}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );

  return {
    showNotification,
    removeNotification,
    NotificationContainer,
  };
}

