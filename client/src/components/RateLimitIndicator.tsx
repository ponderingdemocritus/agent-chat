import React, { useEffect, useState } from "react";
import { Socket } from "socket.io-client";

interface RateLimitStatus {
  direct: {
    count: number;
    limit: number;
    windowRemaining: number;
    blockedUntil?: string;
  };
  global: {
    count: number;
    limit: number;
    windowRemaining: number;
    blockedUntil?: string;
  };
  room: {
    count: number;
    limit: number;
    windowRemaining: number;
    blockedUntil?: string;
  };
}

interface RateLimitIndicatorProps {
  socket: Socket | null;
  messageType: "direct" | "global" | "room";
}

export const RateLimitIndicator: React.FC<RateLimitIndicatorProps> = ({
  socket,
  messageType,
}) => {
  const [status, setStatus] = useState<RateLimitStatus | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleRateLimitStatus = (newStatus: RateLimitStatus) => {
      setStatus(newStatus);
    };

    // Request initial status
    socket.emit("getRateLimitStatus");

    // Listen for updates
    socket.on("rateLimitStatus", handleRateLimitStatus);

    // Request status periodically
    const interval = setInterval(() => {
      socket.emit("getRateLimitStatus");
    }, 5000); // Update every 5 seconds

    return () => {
      socket.off("rateLimitStatus", handleRateLimitStatus);
      clearInterval(interval);
    };
  }, [socket]);

  if (!status || !status[messageType]) return null;

  const typeStatus = status[messageType];
  const percentage = (typeStatus.count / typeStatus.limit) * 100;
  const isBlocked = !!typeStatus.blockedUntil;
  const isWarning = percentage > 70;
  const isDanger = percentage > 90;

  const styles = {
    indicator: {
      margin: "10px 0",
      fontSize: "12px",
    },
    bar: {
      position: "relative" as const,
      height: "20px",
      background: "#f0f0f0",
      borderRadius: "10px",
      overflow: "hidden",
      transition: "all 0.3s ease",
    },
    progress: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      height: "100%",
      background: isDanger ? "#f44336" : isWarning ? "#ff9800" : "#4caf50",
      transition: "width 0.3s ease",
      width: `${percentage}%`,
    },
    text: {
      position: "relative" as const,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      fontWeight: 500,
      color: "#333",
    },
    blocked: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "10px",
      background: "#ffebee",
      color: "#c62828",
      borderRadius: "8px",
      fontWeight: 500,
    },
    blockIcon: {
      fontSize: "16px",
    },
  };

  return (
    <div style={styles.indicator}>
      {isBlocked ? (
        <div style={styles.blocked}>
          <span style={styles.blockIcon}>🚫</span>
          <span>
            Rate limit exceeded. Try again in{" "}
            {Math.ceil(typeStatus.windowRemaining)}s
          </span>
        </div>
      ) : (
        <div style={styles.bar}>
          <div style={styles.progress} />
          <span style={styles.text}>
            {typeStatus.count}/{typeStatus.limit} messages
          </span>
        </div>
      )}
    </div>
  );
};
