"use client";

import { useState, useEffect } from "react";
import TrafficLight from "../components/TrafficLight";

// Forzar renderizado dinámico (no pre-renderizar en build)
export const dynamic = 'force-dynamic';

interface Vault {
  id: string;
  name: string;
  address?: string;
  protocol: string;
  tvl?: number;
  apy?: number;
  description?: string;
  asset?: string;
  minDeposit?: number;
}

interface VaultRisk {
  score: number;
  reason: string;
  factors?: any;
  timestamp?: number;
  loading?: boolean;
  error?: string;
}

export default function VaultsPage() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [vaultRisks, setVaultRisks] = useState<Record<string, VaultRisk>>({});
  const [loading, setLoading] = useState(false);
  const [loadingVaults, setLoadingVaults] = useState(true);
  const [vaultsError, setVaultsError] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Cargar vaults desde la API de Morpho al montar el componente
  const loadVaults = async () => {
    setLoadingVaults(true);
    setVaultsError("");
    try {
      const response = await fetch("/api/morpho-vaults", {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Error al obtener vaults: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      if (data.vaults && Array.isArray(data.vaults) && data.vaults.length > 0) {
        setVaults(data.vaults);
      } else {
        throw new Error("No se encontraron vaults en la respuesta de la API");
      }
    } catch (error: any) {
      console.error("Error cargando vaults:", error);
      setVaultsError(error.message || "Error al cargar vaults de Morpho");
      setVaults([]);
    } finally {
      setLoadingVaults(false);
    }
  };

  const evaluateVault = async (vault: Vault) => {
    setVaultRisks((prev) => ({
      ...prev,
      [vault.id]: { ...prev[vault.id], loading: true, error: undefined },
    }));

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
          chainId: 1, // Ethereum por defecto, ajustar según necesidad
          whitelisted: (vault as any).whitelisted || vault.description?.includes("Whitelisted"),
          curatorAddress: (vault as any).curatorAddress,
          hasRedWarning: (vault as any).hasRedWarning,
          hasYellowWarning: (vault as any).hasYellowWarning,
        }),
      });

      const result = await response.json();

      if (result.error) {
        setVaultRisks((prev) => ({
          ...prev,
          [vault.id]: {
            score: 0,
            reason: result.error,
            loading: false,
            error: result.error,
          },
        }));
      } else {
        setVaultRisks((prev) => ({
          ...prev,
          [vault.id]: {
            score: result.score,
            reason: result.reason,
            factors: result.factors,
            timestamp: result.timestamp,
            loading: false,
          },
        }));
      }
    } catch (error: any) {
      setVaultRisks((prev) => ({
        ...prev,
        [vault.id]: {
          score: 0,
          reason: "Error al evaluar",
          loading: false,
          error: error.message,
        },
      }));
    }
  };

  const evaluateAllVaults = async () => {
    if (vaults.length === 0) {
      // Si no hay vaults, intentar cargarlos primero
      await loadVaults();
      if (vaults.length === 0) {
        return; // Si aún no hay vaults, no hacer nada
      }
    }
    
    setLoading(true);
    for (const vault of vaults) {
      await evaluateVault(vault);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    setLoading(false);
  };

  // Cargar vaults al montar el componente
  useEffect(() => {
    if (typeof window !== 'undefined') {
      loadVaults();
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      evaluateAllVaults();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && autoRefresh) {
      const interval = setInterval(() => {
        evaluateAllVaults();
      }, 60000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  const getRiskStatus = (score: number) => {
    if (score >= 70) return { label: "Bajo Riesgo", color: "green", bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-800" };
    if (score >= 50) return { label: "Moderado", color: "yellow", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-800" };
    return { label: "Alto Riesgo", color: "red", bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", badge: "bg-rose-100 text-rose-800" };
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(2)}B`;
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
    return `$${amount.toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header Mejorado */}
        <div className="mb-12">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
            <div>
              <h1 className="text-5xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                Investment Funds
              </h1>
              <p className="text-gray-600 text-lg max-w-2xl">
                Compare and analyze yield funds with real-time risk assessment powered by AI
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={loadVaults}
                disabled={loadingVaults}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loadingVaults ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Cargando...
                  </>
                ) : (
                  "📥 Cargar Vaults"
                )}
              </button>
              <button
                onClick={evaluateAllVaults}
                disabled={loading || vaults.length === 0}
                className="px-6 py-3 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl font-semibold hover:from-gray-800 hover:to-gray-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Analizando...
                  </>
                ) : (
                  "🔄 Analizar Todos"
                )}
              </button>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-6 py-3 rounded-xl font-semibold transition-all shadow-lg ${
                  autoRefresh
                    ? "bg-gradient-to-r from-emerald-600 to-green-600 text-white hover:from-emerald-700 hover:to-green-700"
                    : "bg-white text-gray-700 border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {autoRefresh ? "⏸️ Auto ON" : "▶️ Auto OFF"}
              </button>
            </div>
          </div>
        </div>

        {/* Mensaje de error o carga */}
        {loadingVaults && (
          <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-xl text-center">
            <div className="flex items-center justify-center gap-3">
              <svg className="animate-spin h-6 w-6 text-blue-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-blue-800 font-medium">Cargando vaults desde la API de Morpho...</span>
            </div>
          </div>
        )}

        {vaultsError && !loadingVaults && (
          <div className="mb-8 p-6 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-1">Error al cargar vaults</h3>
                <p className="text-red-800 text-sm mb-3">{vaultsError}</p>
                <button
                  onClick={loadVaults}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  Reintentar
                </button>
              </div>
            </div>
          </div>
        )}

        {!loadingVaults && !vaultsError && vaults.length === 0 && (
          <div className="mb-8 p-6 bg-yellow-50 border border-yellow-200 rounded-xl text-center">
            <p className="text-yellow-800 font-medium">No se encontraron vaults. Haz clic en "Cargar Vaults" para obtenerlos desde la API de Morpho.</p>
          </div>
        )}

        {/* Grid de Cards Mejorado */}
        {vaults.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-8">
            {vaults.map((vault) => {
            const risk = vaultRisks[vault.id];
            const isLoading = risk?.loading || false;
            const riskStatus = risk?.score !== undefined ? getRiskStatus(risk.score) : null;

            return (
              <div
                key={vault.id}
                className={`bg-white rounded-2xl shadow-xl border-2 ${
                  riskStatus?.border || "border-gray-200"
                } transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 overflow-hidden group`}
              >
                {/* Header con gradiente sutil */}
                <div className={`p-6 ${riskStatus?.bg || "bg-gradient-to-br from-gray-50 to-gray-100"} border-b ${riskStatus?.border || "border-gray-200"}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-3">
                        <div className="w-16 h-16 bg-gradient-to-br from-gray-900 to-gray-700 rounded-2xl flex items-center justify-center font-bold text-white text-lg shadow-lg group-hover:scale-105 transition-transform">
                          {vault.asset}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-gray-900 mb-1">{vault.name}</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">{vault.protocol}</span>
                            {riskStatus && (
                              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${riskStatus.badge} shadow-sm`}>
                                {riskStatus.label}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {risk?.score !== undefined && !isLoading && (
                      <TrafficLight score={risk.score} size="md" showLabel={false} showScore={false} />
                    )}
                    {isLoading && (
                      <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-gray-900"></div>
                    )}
                  </div>
                </div>

                {/* Contenido principal */}
                <div className="p-6">
                  {/* Métricas destacadas */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {vault.apy && (
                      <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-4 border border-emerald-100">
                        <div className="text-xs font-medium text-emerald-700 mb-1">Annual Yield</div>
                        <div className="text-3xl font-bold text-emerald-900">{vault.apy}%</div>
                        <div className="text-xs text-emerald-600 mt-1">APY</div>
                      </div>
                    )}
                    {vault.tvl && (
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                        <div className="text-xs font-medium text-blue-700 mb-1">Total Assets</div>
                        <div className="text-3xl font-bold text-blue-900">{formatCurrency(vault.tvl)}</div>
                        <div className="text-xs text-blue-600 mt-1">Under management</div>
                      </div>
                    )}
                  </div>

                  {/* Score Bar mejorado */}
                  {risk && !isLoading && (
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-gray-700">Security Score</span>
                        <span className={`text-xl font-bold ${riskStatus?.text || "text-gray-900"}`}>
                          {risk.score}/100
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
                        <div
                          className={`h-3 rounded-full transition-all duration-1000 shadow-lg ${
                            risk.score >= 70
                              ? "bg-gradient-to-r from-emerald-500 to-green-500"
                              : risk.score >= 50
                              ? "bg-gradient-to-r from-amber-500 to-yellow-500"
                              : "bg-gradient-to-r from-rose-500 to-red-500"
                          }`}
                          style={{ width: `${risk.score}%` }}
                        ></div>
                      </div>
                      <p className="text-sm text-gray-600 mt-3 leading-relaxed">{risk.reason}</p>
                    </div>
                  )}

                  {/* Info adicional */}
                  <div className="space-y-3 mb-6 pt-4 border-t border-gray-100">
                    {vault.minDeposit && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-2">
                          <span className="text-lg">💰</span> Min. Deposit
                        </span>
                        <span className="font-semibold text-gray-900">
                          {vault.minDeposit >= 1 
                            ? `${vault.minDeposit.toLocaleString()} ${vault.asset}`
                            : `${vault.minDeposit} ${vault.asset}`
                          }
                        </span>
                      </div>
                    )}
                    {risk?.timestamp && (
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>Last updated</span>
                        <span>{new Date(risk.timestamp).toLocaleString("es-ES", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}</span>
                      </div>
                    )}
                  </div>

                  {/* Descripción */}
                  {vault.description && (
                    <p className="text-sm text-gray-600 mb-6 leading-relaxed italic">{vault.description}</p>
                  )}

                  {/* Advertencia de Alto Riesgo */}
                  {risk && !isLoading && risk.score < 50 && (
                    <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-300 rounded-xl shadow-lg">
                      <div className="flex items-start gap-3">
                        <div className="text-2xl">⚠️</div>
                        <div className="flex-1">
                          <h4 className="font-bold text-red-900 mb-1">Alto Riesgo Detectado</h4>
                          <p className="text-sm text-red-800 mb-2">
                            Este vault tiene un score de seguridad bajo. No recomendamos depositar fondos.
                          </p>
                          <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                            <li>Score de seguridad: {risk.score}/100</li>
                            <li>Riesgo de pérdida de fondos</li>
                            <li>Protocolo no verificado</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {risk?.error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-xs text-red-800">{risk.error}</p>
                    </div>
                  )}

                  {/* Botones de Acción */}
                  {risk && !isLoading ? (
                    <div className="space-y-3">
                      {risk.score < 50 ? (
                        <>
                          <button
                            disabled
                            className="w-full py-3 px-4 bg-gray-300 text-gray-500 rounded-xl font-semibold cursor-not-allowed border-2 border-gray-400"
                          >
                            🚫 Depósito Bloqueado - Alto Riesgo
                          </button>
                          <p className="text-xs text-center text-red-600 font-medium">
                            No se recomienda depositar en este vault debido al alto riesgo detectado
                          </p>
                        </>
                      ) : risk.score >= 50 && risk.score < 70 ? (
                        <>
                          <button
                            className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-yellow-500 text-white rounded-xl font-semibold hover:from-amber-600 hover:to-yellow-600 transition-all shadow-lg hover:shadow-xl"
                            onClick={() => alert("⚠️ Advertencia: Este vault tiene riesgo moderado. Procede con precaución.")}
                          >
                            ⚠️ Depositar con Precaución
                          </button>
                          <p className="text-xs text-center text-amber-600 font-medium">
                            Riesgo moderado - Revisa cuidadosamente antes de depositar
                          </p>
                        </>
                      ) : (
                        <button
                          className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl font-semibold hover:from-emerald-700 hover:to-green-700 transition-all shadow-lg hover:shadow-xl"
                          onClick={() => alert("✅ Este vault tiene un score de seguridad alto. Puedes proceder con confianza.")}
                        >
                          ✅ Depositar - Bajo Riesgo
                        </button>
                      )}
                    </div>
                  ) : !isLoading ? (
                    <button
                      onClick={() => evaluateVault(vault)}
                      className="w-full py-3 px-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl font-semibold hover:from-gray-800 hover:to-gray-700 transition-all shadow-lg hover:shadow-xl"
                    >
                      Analyze Fund
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          </div>
        )}

        {/* Footer Info mejorado */}
        <div className="mt-16 bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-8">Understanding Risk Levels</h3>
          
          <div className="grid md:grid-cols-3 gap-6 mb-10">
            <div className="p-6 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border-2 border-emerald-200 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-4 h-4 bg-emerald-500 rounded-full shadow-lg"></div>
                <span className="font-bold text-emerald-900 text-lg">Low Risk</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">Score 70-100. Funds with excellent security and stability.</p>
            </div>
            
            <div className="p-6 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl border-2 border-amber-200 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-4 h-4 bg-amber-500 rounded-full shadow-lg"></div>
                <span className="font-bold text-amber-900 text-lg">Moderate Risk</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">Score 50-69. Funds with acceptable risk and balanced returns.</p>
            </div>
            
            <div className="p-6 bg-gradient-to-br from-rose-50 to-red-50 rounded-xl border-2 border-rose-200 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-4 h-4 bg-rose-500 rounded-full shadow-lg"></div>
                <span className="font-bold text-rose-900 text-lg">High Risk</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">Score 0-49. Funds requiring additional caution.</p>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-4 text-lg">Evaluation Factors</h4>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-600">
              <div className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span><strong className="text-gray-900">Total Assets:</strong> Higher capital typically indicates more stability</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span><strong className="text-gray-900">Annual Yield:</strong> Reasonable APY suggests sustainable strategies</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span><strong className="text-gray-900">Platform:</strong> Established protocols offer greater confidence</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span><strong className="text-gray-900">AI Analysis:</strong> Intelligent evaluation of multiple metrics</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-6 pt-4 border-t border-gray-100">
              Data updates in real-time from reliable sources. Evaluations performed by our AI system.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
