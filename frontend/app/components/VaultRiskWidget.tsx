"use client";

import { useState, useEffect } from "react";
import TrafficLight from "./TrafficLight";

interface VaultRiskWidgetProps {
  vaultAddress?: string;
  vaultName?: string;
  protocol?: string;
  tvl?: number;
  apy?: number;
  compact?: boolean;
  onScoreUpdate?: (score: number) => void;
}

export default function VaultRiskWidget({
  vaultAddress,
  vaultName,
  protocol = "Morpho",
  tvl,
  apy,
  compact = false,
  onScoreUpdate,
}: VaultRiskWidgetProps) {
  const [risk, setRisk] = useState<{
    score: number;
    reason: string;
    loading: boolean;
    error?: string;
  } | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  const evaluate = async () => {
    setEvaluating(true);
    try {
      const response = await fetch("/api/vault-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultAddress,
          vaultName,
          protocol,
          tvl,
          apy,
        }),
      });

      const result = await response.json();

      if (result.error) {
        setRisk({
          score: 0,
          reason: result.error,
          loading: false,
          error: result.error,
        });
      } else {
        setRisk({
          score: result.score,
          reason: result.reason,
          loading: false,
        });
        if (onScoreUpdate) {
          onScoreUpdate(result.score);
        }
      }
    } catch (error: any) {
      setRisk({
        score: 0,
        reason: "Error al evaluar",
        loading: false,
        error: error.message,
      });
    } finally {
      setEvaluating(false);
    }
  };

  useEffect(() => {
    // Auto-evaluar al montar si hay datos suficientes (solo en cliente)
    if (typeof window !== 'undefined' && (vaultAddress || vaultName)) {
      evaluate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultAddress, vaultName]);

  if (compact) {
    // Versión compacta para extensiones de Chrome o embebido
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200 shadow-sm">
        {risk && !risk.loading && !evaluating ? (
          <>
            <TrafficLight score={risk.score} size="sm" showLabel={false} showScore={false} />
            <span className="text-xs font-semibold text-gray-700">
              {risk.score}/100
            </span>
          </>
        ) : (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        )}
      </div>
    );
  }

  // Versión completa
  return (
    <div className="bg-white rounded-lg border-2 border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-semibold text-gray-800">
            {vaultName || vaultAddress || "Vault"}
          </h4>
          {protocol && (
            <p className="text-xs text-gray-500">{protocol}</p>
          )}
        </div>
        {risk && !risk.loading && !evaluating ? (
          <TrafficLight score={risk.score} size="md" />
        ) : (
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        )}
      </div>

      {risk && !risk.loading && !evaluating && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-gray-700">
              Score: {risk.score}/100
            </span>
          </div>
          <p className="text-xs text-gray-600">{risk.reason}</p>
        </div>
      )}

      {risk?.error && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
          {risk.error}
        </div>
      )}

      <button
        onClick={evaluate}
        disabled={evaluating}
        className="mt-3 w-full py-2 px-4 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {evaluating ? "Evaluando..." : "🔄 Reevaluar"}
      </button>
    </div>
  );
}

