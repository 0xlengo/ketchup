"use client";

interface TrafficLightProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  showScore?: boolean;
  className?: string;
}

export default function TrafficLight({
  score,
  size = "md",
  showLabel = true,
  showScore = true,
  className = "",
}: TrafficLightProps) {
  const getStatus = () => {
    if (score >= 70) return { color: "green", label: "Seguro", emoji: "🟢" };
    if (score >= 50) return { color: "yellow", label: "Moderado", emoji: "🟡" };
    return { color: "red", label: "Riesgoso", emoji: "🔴" };
  };

  const status = getStatus();
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
  };

  const containerSize = {
    sm: "w-10 h-24",
    md: "w-14 h-32",
    lg: "w-18 h-40",
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Semáforo visual */}
      <div
        className={`${containerSize[size]} bg-gray-800 rounded-lg p-2 flex flex-col items-center justify-between shadow-lg`}
      >
        {/* Luz roja */}
        <div
          className={`${sizeClasses[size]} rounded-full border-2 ${
            status.color === "red"
              ? "bg-red-500 border-red-600 shadow-lg shadow-red-500/50"
              : "bg-gray-600 border-gray-700"
          } transition-all duration-300`}
        />

        {/* Luz amarilla */}
        <div
          className={`${sizeClasses[size]} rounded-full border-2 ${
            status.color === "yellow"
              ? "bg-yellow-500 border-yellow-600 shadow-lg shadow-yellow-500/50"
              : "bg-gray-600 border-gray-700"
          } transition-all duration-300`}
        />

        {/* Luz verde */}
        <div
          className={`${sizeClasses[size]} rounded-full border-2 ${
            status.color === "green"
              ? "bg-green-500 border-green-600 shadow-lg shadow-green-500/50"
              : "bg-gray-600 border-gray-700"
          } transition-all duration-300`}
        />
      </div>

      {/* Información adicional */}
      {(showLabel || showScore) && (
        <div className="mt-2 text-center">
          {showScore && (
            <div className="text-xs font-bold text-gray-700">{score}/100</div>
          )}
          {showLabel && (
            <div className={`text-xs font-semibold mt-1 ${
              status.color === "green"
                ? "text-green-600"
                : status.color === "yellow"
                ? "text-yellow-600"
                : "text-red-600"
            }`}>
              {status.emoji} {status.label}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

