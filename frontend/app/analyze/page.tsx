"use client";

import { useState } from "react";
import TrafficLight from "../components/TrafficLight";

export const dynamic = 'force-dynamic';

interface Vault {
  id: string;
  name: string;
  address?: string;
  protocol: string;
  tvl?: number;
  apy?: number;
  asset?: string;
  description?: string;
}

interface VaultAnalysis {
  vault: Vault;
  risk: {
    score: number | null;
    reason: string;
    error?: string;
    factors?: any;
    timestamp?: number;
  };
}

export default function AnalyzePage() {
  const [url, setUrl] = useState("https://app.morpho.org/ethereum/earn");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<VaultAnalysis[]>([]);
  const [vaultsFound, setVaultsFound] = useState(0);

  const analyzeMorphoVaults = async () => {
    setLoading(true);
    setError("");
    setResults([]);
    setVaultsFound(0);

    try {
      // Obtener vaults directamente de la API de Morpho
      const vaultsResponse = await fetch("/api/morpho-vaults", {
        cache: 'no-store',
      });

      if (!vaultsResponse.ok) {
        throw new Error("Error al obtener vaults de Morpho");
      }

      const vaultsData = await vaultsResponse.json();
      const vaults = vaultsData.vaults || [];

      if (vaults.length === 0) {
        setError("No se encontraron vaults de Morpho");
        setLoading(false);
        return;
      }

      setVaultsFound(vaults.length);

      // Analizar cada vault
      const analyzed: VaultAnalysis[] = [];
      
      for (const vault of vaults) {
        try {
          const response = await fetch("/api/vault-risk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              vaultAddress: vault.address,
              vaultName: vault.name,
              protocol: vault.protocol,
              tvl: vault.tvl,
              apy: vault.apy,
              chainId: 1, // Ethereum por defecto
              whitelisted: vault.description?.includes("Whitelisted"),
            }),
          });

          const risk = await response.json();
          
          analyzed.push({
            vault,
            risk,
          });

          // Pequeña pausa para no sobrecargar
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (err: any) {
          analyzed.push({
            vault,
            risk: {
              error: err.message,
              score: null,
              reason: "Error al analizar el vault",
            },
          });
        }
      }

      setResults(analyzed);
    } catch (err: any) {
      setError(err.message || "Error al analizar los vaults de Morpho");
    } finally {
      setLoading(false);
    }
  };

  const analyzeUrl = async () => {
    if (!url || !url.includes('morpho.org')) {
      setError("Por favor ingresa una URL válida de Morpho (morpho.org)");
      return;
    }

    setLoading(true);
    setError("");
    setResults([]);
    setVaultsFound(0);

    try {
      const response = await fetch("/api/analyze-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setVaultsFound(data.vaultsFound || 0);
        setResults(data.analyzed || []);
      }
    } catch (err: any) {
      setError(err.message || "Error al analizar la URL");
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return "text-gray-600";
    if (score >= 70) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getRiskLevel = (score: number | null) => {
    if (score === null) return "⚪ Sin evaluar";
    if (score >= 70) return "🟢 Seguro";
    if (score >= 50) return "🟡 Moderado";
    return "🔴 Riesgoso";
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Analizador de Vaults de Morpho
          </h1>
          <p className="text-gray-600 mb-6">
            Analiza automáticamente todos los vaults disponibles en Morpho usando su API pública
          </p>

          <div className="mb-6">
            <button
              onClick={analyzeMorphoVaults}
              disabled={loading}
              className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold text-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl disabled:bg-gray-400 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analizando vaults de Morpho...
                </span>
              ) : (
                "🔍 Analizar Vaults de Morpho"
              )}
            </button>
          </div>

          <div className="border-t border-gray-200 pt-6 mt-6">
            <p className="text-sm text-gray-500 mb-4">O analiza desde una URL específica:</p>
            <div className="flex gap-4">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://app.morpho.org/ethereum/earn"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={analyzeUrl}
                disabled={loading}
                className="px-6 py-3 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Analizar URL
              </button>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-100 border border-red-300 text-red-800 rounded-lg mb-6">
              <strong>Error:</strong> {error}
            </div>
          )}

          {vaultsFound > 0 && (
            <div className="p-4 bg-blue-100 border border-blue-300 text-blue-800 rounded-lg mb-6">
              <strong>✓</strong> Se encontraron {vaultsFound} vault{vaultsFound !== 1 ? 's' : ''} en la URL
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Resultados del Análisis ({results.length} vaults)
            </h2>

            {results.map((analysis, index) => {
              const { vault, risk } = analysis;
              const score = risk.score;

              return (
                <div
                  key={vault.id || index}
                  className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        {vault.name}
                      </h3>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                        {vault.asset && (
                          <span>
                            <strong>Activo:</strong> {vault.asset}
                          </span>
                        )}
                        {vault.protocol && (
                          <span>
                            <strong>Protocolo:</strong> {vault.protocol}
                          </span>
                        )}
                        {vault.tvl !== undefined && (
                          <span>
                            <strong>TVL:</strong> ${vault.tvl.toLocaleString()}
                          </span>
                        )}
                        {vault.apy !== undefined && (
                          <span>
                            <strong>APY:</strong> {vault.apy.toFixed(2)}%
                          </span>
                        )}
                      </div>
                      {vault.description && (
                        <p className="text-sm text-gray-500 mt-2">{vault.description}</p>
                      )}
                    </div>

                    <div className="ml-4">
                      {score !== null ? (
                        <TrafficLight score={score} />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                          <span className="text-gray-500 text-xs">N/A</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {risk.error ? (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
                      <strong>Error:</strong> {risk.error}
                    </div>
                  ) : score !== null ? (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">
                          Score de Riesgo:
                        </span>
                        <span className={`text-lg font-bold ${getScoreColor(score)}`}>
                          {score}/100 - {getRiskLevel(score)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">
                        <strong>Análisis:</strong> {risk.reason}
                      </p>
                      {score < 50 && (
                        <div className="mt-3 p-3 bg-red-100 border border-red-300 text-red-800 rounded-lg text-sm">
                          <span className="font-semibold">⚠️ Advertencia:</span> Este vault presenta un alto riesgo. Se recomienda no depositar.
                        </div>
                      )}
                      {score >= 50 && score < 70 && (
                        <div className="mt-3 p-3 bg-yellow-100 border border-yellow-300 text-yellow-800 rounded-lg text-sm">
                          <span className="font-semibold">⚠️ Precaución:</span> Este vault tiene riesgo moderado. Proceda con cuidado.
                        </div>
                      )}
                      {score >= 70 && (
                        <div className="mt-3 p-3 bg-green-100 border border-green-300 text-green-800 rounded-lg text-sm">
                          <span className="font-semibold">✓ Seguro:</span> Este vault presenta un riesgo bajo. Puede proceder con confianza.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 p-3 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg text-sm">
                      No se pudo evaluar el riesgo de este vault
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && results.length === 0 && !error && (
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <p className="text-gray-500 text-lg">
              Ingresa una URL de Morpho y haz clic en "Analizar Vaults" para comenzar
            </p>
            <div className="mt-6 text-sm text-gray-400 space-y-2">
              <p>Ejemplo de URLs válidas:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>https://app.morpho.org/ethereum/earn</li>
                <li>https://app.morpho.org/ethereum/markets</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

