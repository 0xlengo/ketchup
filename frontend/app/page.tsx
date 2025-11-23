"use client";

import { useState } from "react";

// Forzar renderizado dinámico (no pre-renderizar en build)
export const dynamic = 'force-dynamic';

interface RiskResult {
  score: number | null;
  reason: string;
  error?: string;
  factors?: {
    priceStability?: number;
    tvlLiquidity?: number;
    tradingVolume?: number;
    marketTrend?: number;
  };
  timestamp?: number;
  data?: {
    price?: any;
    tvl?: number;
    volume?: any;
    protocols?: number;
    priceUpdatedAt?: number;
    source?: string;
  };
}

export default function Home() {
  const [score, setScore] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [factors, setFactors] = useState<RiskResult["factors"]>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<RiskResult["data"]>(undefined);
  const [timestamp, setTimestamp] = useState<number | null>(null);

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 70) return "bg-green-100 border-green-300";
    if (score >= 50) return "bg-yellow-100 border-yellow-300";
    return "bg-red-100 border-red-300";
  };

  const getRiskLevel = (score: number) => {
    if (score >= 70) return "🟢 Seguro";
    if (score >= 50) return "🟡 Moderado";
    return "🔴 Riesgoso";
  };

  const runCheck = async () => {
    setLoading(true);
    setError("");
    setScore(null);
    setReason("");
    setFactors(undefined);
    setData(undefined);
    setTimestamp(null);

    try {
      const res = await fetch("/api/run-check", { method: "POST" });
      const result: RiskResult = await res.json();

      if (result.error) {
        setError(result.error);
      } else if (result.score !== null) {
        setScore(result.score);
        setReason(result.reason);
        setFactors(result.factors);
        setData(result.data);
        setTimestamp(result.timestamp || Date.now());
      } else {
        setError("No se pudo obtener el score de riesgo");
      }
    } catch (err: any) {
      setError(err.message || "Error al ejecutar la evaluación");
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            DeFi Risk Oracle
          </h1>
          <p className="text-gray-600 mb-6">
            Evaluación de riesgo en tiempo real usando Chainlink Data Feeds (on-chain) y OpenAI
          </p>

          <button
            className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition-all ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 active:scale-95"
            }`}
            onClick={runCheck}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Evaluando riesgo...
              </span>
            ) : (
              "🚀 Ejecutar Evaluación de Riesgo"
            )}
          </button>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800">❌ {error}</p>
            </div>
          )}

          {score !== null && (
            <div className={`mt-6 p-6 rounded-lg border-2 ${getScoreBgColor(score)}`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Resultado de la Evaluación</h2>
                <span className="text-lg font-semibold">{getRiskLevel(score)}</span>
              </div>

              <div className="mb-4">
                <div className="flex items-baseline gap-2">
                  <span className={`text-5xl font-bold ${getScoreColor(score)}`}>
                    {score}
                  </span>
                  <span className="text-2xl text-gray-600">/ 100</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 mt-2">
                  <div
                    className={`h-4 rounded-full transition-all ${
                      score >= 70
                        ? "bg-green-500"
                        : score >= 50
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${score}%` }}
                  ></div>
                </div>
              </div>

              <div className="mb-4">
                <h3 className="font-semibold text-gray-700 mb-2">📝 Razón:</h3>
                <p className="text-gray-800">{reason}</p>
              </div>

              {factors && (
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-700 mb-2">📊 Factores de Evaluación:</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {factors.priceStability !== undefined && (
                      <div className="bg-white p-2 rounded">
                        <span className="text-sm text-gray-600">Estabilidad Precio:</span>
                        <span className="ml-2 font-semibold">{factors.priceStability} pts</span>
                      </div>
                    )}
                    {factors.tvlLiquidity !== undefined && (
                      <div className="bg-white p-2 rounded">
                        <span className="text-sm text-gray-600">TVL/Liquidez:</span>
                        <span className="ml-2 font-semibold">{factors.tvlLiquidity} pts</span>
                      </div>
                    )}
                    {factors.tradingVolume !== undefined && (
                      <div className="bg-white p-2 rounded">
                        <span className="text-sm text-gray-600">Volumen Trading:</span>
                        <span className="ml-2 font-semibold">{factors.tradingVolume} pts</span>
                      </div>
                    )}
                    {factors.marketTrend !== undefined && (
                      <div className="bg-white p-2 rounded">
                        <span className="text-sm text-gray-600">Tendencia Mercado:</span>
                        <span className="ml-2 font-semibold">{factors.marketTrend} pts</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {data && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold text-gray-700 mb-2">📈 Datos Utilizados:</h3>
                  <div className="text-sm space-y-1">
                    {data.price && data.price.ethereum?.usd ? (
                      <p>
                        <span className="font-medium">Precio ETH/USD (Chainlink Data Feed):</span>{" "}
                        ${data.price.ethereum.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {data.priceUpdatedAt && (
                          <span className="text-xs text-gray-500 ml-2">
                            (actualizado hace {Math.floor((Date.now() / 1000 - data.priceUpdatedAt) / 60)} min)
                          </span>
                        )}
                      </p>
                    ) : (
                      <p>
                        <span className="font-medium">Precio ETH/USD (Chainlink Data Feed):</span>{" "}
                        <span className="text-gray-400">Cargando desde blockchain...</span>
                      </p>
                    )}
                    {data.tvl !== undefined && data.tvl > 0 ? (
                      <p>
                        <span className="font-medium">TVL Total (DeFiLlama):</span>{" "}
                        ${data.tvl.toLocaleString()} USD
                      </p>
                    ) : (
                      <p>
                        <span className="font-medium">TVL Total (DeFiLlama):</span>{" "}
                        <span className="text-gray-400">Cargando...</span>
                      </p>
                    )}
                    {data.protocols !== undefined && (
                      <p>
                        <span className="font-medium">Protocolos activos:</span>{" "}
                        {data.protocols}
                      </p>
                    )}
                    {data.volume && (
                      <>
                        <p>
                          <span className="font-medium">Volumen 24h:</span>{" "}
                          ${data.volume.volume24h?.toLocaleString() || "N/A"} USD
                        </p>
                        <p>
                          <span className="font-medium">Cambio Precio 24h:</span>{" "}
                          {data.volume.priceChange24h?.toFixed(2) || "N/A"}%
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {timestamp && (
                <div className="text-sm text-gray-500">
                  ⏰ Evaluado el: {formatTimestamp(timestamp)}
                </div>
              )}
            </div>
          )}

          <div className="mt-8 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">ℹ️ Sobre esta Evaluación</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Utiliza Chainlink Data Feeds para precios on-chain (descentralizado y confiable)</li>
              <li>• Datos de TVL desde DeFiLlama</li>
              <li>• Evaluación con OpenAI GPT-4o-mini (si está configurado)</li>
              <li>• Score de 0-100: &lt;50 Riesgoso, 50-70 Moderado, &gt;70 Seguro</li>
              <li>• Los datos se actualizan en cada ejecución</li>
            </ul>
          </div>

          <div className="mt-6 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
            <h3 className="font-semibold text-purple-900 mb-3 text-xl">
              🏦 Agregador de Vaults DeFi
            </h3>
            <p className="text-purple-800 mb-4">
              Explora y evalúa la salud de vaults de Morpho y otros protocolos DeFi con nuestro
              sistema de semáforos visuales.
            </p>
            <a
              href="/vaults"
              className="inline-block px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-all active:scale-95"
            >
              🚀 Ver Agregador de Vaults →
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
