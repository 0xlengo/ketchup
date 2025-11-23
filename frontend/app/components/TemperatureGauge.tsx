"use client";

interface TemperatureGaugeProps {
  score: number; // 0-100 (100 = más seguro, 0 = más riesgoso)
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  showScore?: boolean;
}

export default function TemperatureGauge({
  score,
  size = "md",
  showLabel = true,
  showScore = true,
}: TemperatureGaugeProps) {
  // Convertir score (0-100) a temperatura visual
  // Score alto (100) = temperatura baja (frío = seguro)
  // Score bajo (0) = temperatura alta (caliente = riesgoso)
  const temperature = 100 - score; // Invertido
  const clampedTemp = Math.max(0, Math.min(100, temperature));

  // Determinar color y estado
  const getTemperatureColor = () => {
    if (clampedTemp <= 20) return { 
      color: "text-blue-600", 
      bg: "bg-blue-100", 
      border: "border-blue-300", 
      label: "Frío (Seguro)",
      gradient: "from-blue-400 to-blue-600"
    };
    if (clampedTemp <= 40) return { 
      color: "text-green-600", 
      bg: "bg-green-100", 
      border: "border-green-300", 
      label: "Templado (Bueno)",
      gradient: "from-green-400 to-green-600"
    };
    if (clampedTemp <= 60) return { 
      color: "text-yellow-600", 
      bg: "bg-yellow-100", 
      border: "border-yellow-300", 
      label: "Caliente (Moderado)",
      gradient: "from-yellow-400 to-yellow-600"
    };
    if (clampedTemp <= 80) return { 
      color: "text-orange-600", 
      bg: "bg-orange-100", 
      border: "border-orange-300", 
      label: "Muy Caliente (Riesgo)",
      gradient: "from-orange-400 to-orange-600"
    };
    return { 
      color: "text-red-600", 
      bg: "bg-red-100", 
      border: "border-red-300", 
      label: "Ardiendo (Alto Riesgo)",
      gradient: "from-red-400 to-red-600"
    };
  };

  const tempColor = getTemperatureColor();
  
  // Tamaños
  const sizeClasses = {
    sm: { container: "w-12 h-12", text: "text-xs", radius: 20, center: 24 },
    md: { container: "w-16 h-16", text: "text-sm", radius: 28, center: 32 },
    lg: { container: "w-24 h-24", text: "text-base", radius: 40, center: 48 },
  };

  const sizes = sizeClasses[size];
  
  // Calcular posición del indicador en el arco (0-180 grados)
  // 0°C = 0°, 100°C = 180°
  const angle = (clampedTemp / 100) * 180;
  const indicatorX = sizes.center + sizes.radius * Math.cos((angle - 90) * (Math.PI / 180));
  const indicatorY = sizes.center + sizes.radius * Math.sin((angle - 90) * (Math.PI / 180));

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative ${sizes.container}`}>
        {/* Fondo del medidor (semicírculo) */}
        <svg
          width={sizes.center * 2}
          height={sizes.center * 2}
          className="transform rotate-180"
        >
          {/* Arco de fondo (gris claro) */}
          <path
            d={`M ${sizes.center - sizes.radius} ${sizes.center} A ${sizes.radius} ${sizes.radius} 0 0 1 ${sizes.center + sizes.radius} ${sizes.center}`}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={size === "sm" ? 3 : size === "md" ? 4 : 6}
            strokeLinecap="round"
          />
          
          {/* Arco de temperatura (coloreado según nivel) */}
          <path
            d={`M ${sizes.center - sizes.radius} ${sizes.center} A ${sizes.radius} ${sizes.radius} 0 0 1 ${indicatorX} ${indicatorY}`}
            fill="none"
            stroke={
              clampedTemp <= 20
                ? "#3b82f6" // azul
                : clampedTemp <= 40
                ? "#10b981" // verde
                : clampedTemp <= 60
                ? "#eab308" // amarillo
                : clampedTemp <= 80
                ? "#f97316" // naranja
                : "#ef4444" // rojo
            }
            strokeWidth={size === "sm" ? 3 : size === "md" ? 4 : 6}
            strokeLinecap="round"
          />
          
          {/* Indicador (punto) */}
          <circle
            cx={indicatorX}
            cy={indicatorY}
            r={size === "sm" ? 3 : size === "md" ? 4 : 6}
            fill={
              clampedTemp <= 20
                ? "#3b82f6"
                : clampedTemp <= 40
                ? "#10b981"
                : clampedTemp <= 60
                ? "#eab308"
                : clampedTemp <= 80
                ? "#f97316"
                : "#ef4444"
            }
            stroke="white"
            strokeWidth={2}
          />
        </svg>
        
        {/* Número de temperatura en el centro */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`${sizes.text} font-bold ${tempColor.color}`}>
            {Math.round(clampedTemp)}°
          </span>
        </div>
      </div>
      
      {showLabel && (
        <div className="text-center">
          <div className={`text-xs font-semibold ${tempColor.color}`}>
            {tempColor.label}
          </div>
          {showScore && (
            <div className="text-xs text-gray-500 mt-1">
              Score: {score}/100
            </div>
          )}
        </div>
      )}
    </div>
  );
}
