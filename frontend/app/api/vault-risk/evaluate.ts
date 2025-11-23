import { createPublicClient, http, type Address } from "viem";
import { sepolia, mainnet } from "viem/chains";

// ABI del Chainlink Data Feed
const CHAINLINK_DATA_FEED_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { internalType: "uint80", name: "roundId", type: "uint80" },
      { internalType: "int256", name: "answer", type: "int256" },
      { internalType: "uint256", name: "startedAt", type: "uint256" },
      { internalType: "uint256", name: "updatedAt", type: "uint256" },
      { internalType: "uint80", name: "answeredInRound", type: "uint80" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

const CHAINLINK_FEEDS = {
  sepolia: { ethUsd: "0x694AA1769357215DE4FAC081bf1f309aDC325306" as Address },
  mainnet: { ethUsd: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" as Address },
};

async function fetchPriceFromChainlink(useMainnet: boolean = false): Promise<{ price: number; updatedAt: number }> {
  const chain = useMainnet ? mainnet : sepolia;
  const feedAddress = useMainnet ? CHAINLINK_FEEDS.mainnet.ethUsd : CHAINLINK_FEEDS.sepolia.ethUsd;
  
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });

  try {
    const decimals = await publicClient.readContract({
      address: feedAddress,
      abi: CHAINLINK_DATA_FEED_ABI,
      functionName: "decimals",
    });

    const result = await publicClient.readContract({
      address: feedAddress,
      abi: CHAINLINK_DATA_FEED_ABI,
      functionName: "latestRoundData",
    }) as [bigint, bigint, bigint, bigint, bigint];

    const [, answer, , updatedAt] = result;
    const price = Number(answer) / Math.pow(10, Number(decimals));

    return {
      price,
      updatedAt: Number(updatedAt),
    };
  } catch (error: any) {
    console.error("Error leyendo Chainlink Data Feed:", error.message);
    throw error;
  }
}

export interface VaultRiskRequest {
  vaultAddress?: string;
  vaultName?: string;
  protocol?: string;
  tvl?: number;
  apy?: number;
  chainId?: number;
  whitelisted?: boolean;
  curatorAddress?: string;
  hasRedWarning?: boolean;
  hasYellowWarning?: boolean;
}

// Función para obtener detalles del vault desde la API de Morpho
async function getVaultDetailsFromMorpho(vaultAddress: string, chainId: number = 1) {
  try {
    const graphqlEndpoint = "https://api.morpho.org/graphql";
    
    // Query mejorada según la documentación de Morpho
    // https://docs.morpho.org/tools/offchain/api/morpho-vaults/
    const query = `
      query GetVaultDetails($address: String!, $chainId: Int!) {
        vaultV2ByAddress(address: $address, chainId: $chainId) {
          address
          totalAssets
          totalAssetsUsd
          totalSupply
          avgApy
          avgNetApy
          whitelisted
          warnings {
            type
            level
          }
          curators {
            items {
              addresses {
                address
              }
            }
          }
          positions(first: 1) {
            pageInfo {
              countTotal
            }
          }
        }
        vaultV2Snapshots(
          first: 24
          where: { vaultV2: { address: $address, chainId: $chainId } }
          orderBy: timestamp
          orderDirection: desc
        ) {
          items {
            totalAssets
            totalAssetsUsd
            totalSupply
            timestamp
          }
        }
      }
    `;

    const response = await fetch(graphqlEndpoint, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { address: vaultAddress, chainId },
      }),
      cache: 'no-store',
    });

    if (response.ok) {
      const result = await response.json();
      if (result.data && !result.errors) {
        return result.data;
      }
    }
  } catch (e) {
    console.error("Error obteniendo detalles del vault:", e);
  }
  return null;
}

// Función para evaluar riesgo de un vault específico
export async function evaluateVaultRisk(vaultData: VaultRiskRequest) {
  try {
    // Obtener precio desde Chainlink Data Feed (on-chain)
    let chainlinkPrice = 0;
    let priceUpdatedAt = 0;
    
    try {
      try {
        const priceData = await fetchPriceFromChainlink(false); // Sepolia
        chainlinkPrice = priceData.price;
        priceUpdatedAt = priceData.updatedAt;
      } catch (e) {
        const priceData = await fetchPriceFromChainlink(true); // Mainnet
        chainlinkPrice = priceData.price;
        priceUpdatedAt = priceData.updatedAt;
      }
    } catch (e) {
      console.error("Error obteniendo precio de Chainlink:", e);
    }

    // Obtener TVL desde DeFiLlama
    let tvlTotal = 0;
    try {
      const tvlResponse = await fetch("https://api.llama.fi/tvl/Ethereum", {
        cache: 'no-store',
        headers: { 'Accept': 'text/plain' },
      });
      
      if (tvlResponse.ok) {
        const tvlText = await tvlResponse.text();
        tvlTotal = Number.parseFloat(tvlText.trim()) || 0;
      }
    } catch (e) {
      console.error("Error obteniendo TVL:", e);
    }

    // Obtener detalles del vault desde la API de Morpho si tenemos la dirección
    let vaultDetails: any = null;
    let vaultTVL = vaultData.tvl || 0;
    let vaultAPY = vaultData.apy;
    let tvlHistory: number[] = [];
    let tvlDropPercentage = 0;
    let depositorCount = 0;
    let curatorAddress = vaultData.curatorAddress;
    let isWhitelisted = vaultData.whitelisted;

    if (vaultData.vaultAddress) {
      vaultDetails = await getVaultDetailsFromMorpho(
        vaultData.vaultAddress,
        vaultData.chainId || 1
      );

      if (vaultDetails) {
        const vault = vaultDetails.vaultV2ByAddress;
        
        // Obtener TVL actual (preferir USD)
        if (vault?.totalAssetsUsd) {
          vaultTVL = Number(vault.totalAssetsUsd);
        } else if (vault?.totalAssets) {
          vaultTVL = Number(vault.totalAssets);
        }

        // Obtener APY actual (preferir avgApy)
        if (vault?.avgApy) {
          vaultAPY = Number(vault.avgApy) * 100; // Convertir a porcentaje
        } else if (vault?.avgNetApy) {
          vaultAPY = Number(vault.avgNetApy) * 100;
        }

        // Obtener curator
        if (vault?.curators?.items?.[0]?.addresses?.[0]?.address) {
          curatorAddress = vault.curators.items[0].addresses[0].address;
        }

        // Obtener número de depositantes
        if (vault?.positions?.pageInfo?.countTotal) {
          depositorCount = Number(vault.positions.pageInfo.countTotal);
        }

        // Obtener whitelisted status
        if (vault?.whitelisted !== undefined) {
          isWhitelisted = vault.whitelisted;
        }

        // Obtener warnings
        if (vault?.warnings) {
          const hasRed = vault.warnings.some((w: any) => w.level === "RED");
          const hasYellow = vault.warnings.some((w: any) => w.level === "YELLOW");
          if (hasRed) {
            vaultData.hasRedWarning = true;
          }
          if (hasYellow) {
            vaultData.hasYellowWarning = true;
          }
        }

        // Analizar historial de TVL para calcular caída
        if (vaultDetails.vaultV2Snapshots?.items && Array.isArray(vaultDetails.vaultV2Snapshots.items)) {
          const snapshots = vaultDetails.vaultV2Snapshots.items;
          
          // Obtener TVL de las últimas 24 horas (snapshots) - preferir USD
          tvlHistory = snapshots
            .map((s: any) => Number(s.totalAssetsUsd || s.totalAssets || 0))
            .filter((tvl: number) => tvl > 0);

          // Calcular % de caída en las últimas horas
          if (tvlHistory.length >= 2) {
            const currentTVL = tvlHistory[0];
            const previousTVL = tvlHistory[tvlHistory.length - 1];
            if (previousTVL > 0) {
              tvlDropPercentage = ((previousTVL - currentTVL) / previousTVL) * 100;
            }
          }

          // Estimar número de depositantes (usando totalSupply como proxy si está disponible)
          // En un vault, cada depositor tiene shares, pero no tenemos ese dato directo
          // Podríamos estimar basándonos en la variación de TVL
        }
      }
    }

    // Calcular score base (empezar desde 50 - neutral, para diferenciar mejor)
    let score = 50;
    const reasons: string[] = [];
    const factors: any = {};

    // Factor 0: Warnings del vault (crítico - se evalúa primero)
    if (vaultData.hasRedWarning) {
      score -= 30;
      factors.warnings = -30;
      reasons.push("⚠️ Advertencia ROJA detectada (alto riesgo)");
    } else if (vaultData.hasYellowWarning) {
      score -= 10;
      factors.warnings = -10;
      reasons.push("⚠️ Advertencia AMARILLA detectada");
    } else {
      score += 5;
      factors.warnings = 5;
      reasons.push("Sin advertencias del sistema");
    }

    // Factor 1: TVL del vault (0-20 puntos) - Más granular pero menos penalización
    if (vaultTVL > 100000000) {
      // > $100M
      score += 20;
      factors.vaultTVL = 20;
      reasons.push("TVL muy alto (>$100M)");
    } else if (vaultTVL > 50000000) {
      // > $50M
      score += 18;
      factors.vaultTVL = 18;
      reasons.push("TVL alto (>$50M)");
    } else if (vaultTVL > 10000000) {
      // > $10M
      score += 15;
      factors.vaultTVL = 15;
      reasons.push("TVL moderado-alto (>$10M)");
    } else if (vaultTVL > 1000000) {
      // > $1M
      score += 12;
      factors.vaultTVL = 12;
      reasons.push("TVL moderado (>$1M)");
    } else if (vaultTVL > 100000) {
      // > $100K
      score += 8;
      factors.vaultTVL = 8;
      reasons.push("TVL bajo (>$100K)");
    } else if (vaultTVL > 10000) {
      // > $10K
      score += 5;
      factors.vaultTVL = 5;
      reasons.push("TVL muy bajo (>$10K)");
    } else if (vaultTVL > 0) {
      score += 2;
      factors.vaultTVL = 2;
      reasons.push("TVL mínimo");
    } else {
      // No penalizar tanto si no hay TVL - puede ser un vault nuevo
      factors.vaultTVL = 0;
      reasons.push("TVL no disponible (vault nuevo?)");
    }

    // Factor 2: Caída de TVL en las últimas horas (0-20 puntos, negativo si hay caída)
    if (tvlHistory.length >= 2) {
      if (tvlDropPercentage > 20) {
        // Caída > 20% es muy preocupante
        score -= 20;
        factors.tvlDrop = -20;
        reasons.push(`Caída crítica de TVL: ${tvlDropPercentage.toFixed(1)}%`);
      } else if (tvlDropPercentage > 10) {
        // Caída 10-20% es preocupante
        score -= 15;
        factors.tvlDrop = -15;
        reasons.push(`Caída significativa de TVL: ${tvlDropPercentage.toFixed(1)}%`);
      } else if (tvlDropPercentage > 5) {
        // Caída 5-10% es moderada
        score -= 10;
        factors.tvlDrop = -10;
        reasons.push(`Caída moderada de TVL: ${tvlDropPercentage.toFixed(1)}%`);
      } else if (tvlDropPercentage > 0) {
        // Caída pequeña
        score -= 5;
        factors.tvlDrop = -5;
        reasons.push(`Ligera caída de TVL: ${tvlDropPercentage.toFixed(1)}%`);
      } else if (tvlDropPercentage < -5) {
        // Crecimiento > 5% es positivo
        score += 10;
        factors.tvlDrop = 10;
        reasons.push(`Crecimiento de TVL: ${Math.abs(tvlDropPercentage).toFixed(1)}%`);
      } else {
        // Estable
        score += 5;
        factors.tvlDrop = 5;
        reasons.push("TVL estable");
      }
    } else {
      // Sin historial suficiente
      factors.tvlDrop = 0;
    }

    // Factor 3: Variabilidad del TVL (0-10 puntos)
    if (tvlHistory.length >= 3) {
      const avgTVL = tvlHistory.reduce((a, b) => a + b, 0) / tvlHistory.length;
      const variance = tvlHistory.reduce((sum, tvl) => sum + Math.pow(tvl - avgTVL, 2), 0) / tvlHistory.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = avgTVL > 0 ? (stdDev / avgTVL) * 100 : 0;

      if (coefficientOfVariation < 5) {
        // Muy estable
        score += 10;
        factors.tvlStability = 10;
        reasons.push("TVL muy estable");
      } else if (coefficientOfVariation < 10) {
        // Estable
        score += 7;
        factors.tvlStability = 7;
        reasons.push("TVL estable");
      } else if (coefficientOfVariation < 20) {
        // Moderadamente variable
        score += 3;
        factors.tvlStability = 3;
        reasons.push("TVL moderadamente variable");
      } else {
        // Muy variable (riesgoso)
        score -= 5;
        factors.tvlStability = -5;
        reasons.push("TVL muy variable (riesgo)");
      }
    }

    // Factor 4: APY (0-15 puntos) - APY muy alto puede ser señal de riesgo
    if (vaultAPY !== undefined && vaultAPY !== null) {
      if (vaultAPY > 50) {
        // APY > 50% es muy alto, puede ser riesgoso
        score -= 15;
        factors.apy = -15;
        reasons.push(`APY extremadamente alto: ${vaultAPY.toFixed(2)}% (riesgo)`);
      } else if (vaultAPY > 30) {
        // APY 30-50% es alto pero razonable
        score += 5;
        factors.apy = 5;
        reasons.push(`APY alto: ${vaultAPY.toFixed(2)}%`);
      } else if (vaultAPY > 15) {
        // APY 15-30% es bueno
        score += 12;
        factors.apy = 12;
        reasons.push(`APY atractivo: ${vaultAPY.toFixed(2)}%`);
      } else if (vaultAPY > 5) {
        // APY 5-15% es normal
        score += 10;
        factors.apy = 10;
        reasons.push(`APY razonable: ${vaultAPY.toFixed(2)}%`);
      } else if (vaultAPY > 0) {
        // APY < 5% es bajo pero seguro
        score += 5;
        factors.apy = 5;
        reasons.push(`APY bajo: ${vaultAPY.toFixed(2)}%`);
      }
    } else if (vaultData.apy) {
      // Fallback a apy del request
      const apy = vaultData.apy;
      if (apy > 50) {
        score -= 15;
        factors.apy = -15;
        reasons.push("APY extremadamente alto (riesgo)");
      } else if (apy > 20) {
        score += 10;
        factors.apy = 10;
        reasons.push("APY alto");
      } else if (apy > 5) {
        score += 12;
        factors.apy = 12;
        reasons.push("APY razonable");
      } else {
        score += 5;
        factors.apy = 5;
        reasons.push("APY bajo pero seguro");
      }
    }

    // Factor 5: Whitelisted status (0-15 puntos) - Más importante
    if (isWhitelisted === true) {
      score += 15;
      factors.whitelisted = 15;
      reasons.push("✅ Vault whitelisted (verificado por Morpho)");
    } else if (isWhitelisted === false) {
      // No penalizar tanto - muchos vaults legítimos no están whitelisted
      score -= 2;
      factors.whitelisted = -2;
      reasons.push("Vault no whitelisted");
    }

    // Factor 6: Número de depositantes (0-10 puntos)
    if (depositorCount > 1000) {
      score += 10;
      factors.depositors = 10;
      reasons.push(`Gran comunidad: ${depositorCount} depositantes`);
    } else if (depositorCount > 100) {
      score += 8;
      factors.depositors = 8;
      reasons.push(`Comunidad activa: ${depositorCount} depositantes`);
    } else if (depositorCount > 10) {
      score += 5;
      factors.depositors = 5;
      reasons.push(`${depositorCount} depositantes`);
    } else if (depositorCount > 0) {
      score += 2;
      factors.depositors = 2;
      reasons.push(`${depositorCount} depositante(s)`);
    } else {
      factors.depositors = 0;
      reasons.push("Sin depositantes aún");
    }

    // Factor 7: Confiabilidad del Curator (0-10 puntos)
    if (curatorAddress) {
      // Tener un curator es positivo
      score += 8;
      factors.curator = 8;
      reasons.push("Curator asignado");
      
      // Lista de curators conocidos/confiables (puedes expandir esto)
      const trustedCurators: string[] = [
        // Agregar direcciones de curators confiables aquí
        // Ejemplo: "0x..." (direcciones en lowercase)
      ];
      
      if (trustedCurators.includes(curatorAddress.toLowerCase())) {
        score += 2;
        factors.curator = 10;
        reasons.push("Curator confiable verificado");
      }
    } else {
      // No penalizar tanto - algunos vaults pueden no tener curator aún
      factors.curator = 0;
      reasons.push("Sin curator asignado");
    }

    // Factor 8: Protocolo conocido (0-8 puntos)
    if (vaultData.protocol === "Morpho" || vaultData.protocol?.toLowerCase().includes("morpho")) {
      score += 8;
      factors.protocol = 8;
      reasons.push("Protocolo Morpho (confiable)");
    } else if (vaultData.protocol && vaultData.protocol.toLowerCase().includes("unknown")) {
      score -= 5;
      factors.protocol = -5;
      reasons.push("Protocolo desconocido");
    } else if (vaultData.protocol) {
      score += 4;
      factors.protocol = 4;
      reasons.push(`Protocolo ${vaultData.protocol}`);
    } else {
      // No penalizar si no se especifica - asumimos Morpho
      factors.protocol = 0;
      reasons.push("Protocolo no especificado");
    }

    // Factor 8: Precio de mercado desde Chainlink (0-5 puntos)
    if (chainlinkPrice > 0) {
      score += 5;
      factors.marketPrice = 5;
      reasons.push("Datos on-chain disponibles");
    }

    // Factor 9: TVL total del ecosistema (0-5 puntos)
    if (tvlTotal > 10000000000) {
      score += 5;
      factors.ecosystemTVL = 5;
      reasons.push("Ecosistema DeFi saludable");
    } else if (tvlTotal > 1000000000) {
      score += 3;
      factors.ecosystemTVL = 3;
      reasons.push("Ecosistema DeFi estable");
    }

    // Evaluar con OpenAI si está disponible
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && openaiKey !== "your_openai_key_here") {
      try {
        const prompt = `Eres un experto analista de riesgo DeFi. Evalúa el riesgo de este vault considerando múltiples factores:

Vault: ${vaultData.vaultName || vaultData.vaultAddress || "Desconocido"}
Protocolo: ${vaultData.protocol || "Desconocido"}
Dirección: ${vaultData.vaultAddress || "N/A"}

Métricas del Vault:
- TVL actual: $${vaultTVL.toLocaleString()} USD
- APY: ${vaultAPY !== undefined ? `${vaultAPY.toFixed(2)}%` : "N/A"}
- Caída de TVL (últimas 24h): ${tvlDropPercentage !== 0 ? `${tvlDropPercentage.toFixed(2)}%` : "N/A"}
- Variabilidad TVL: ${tvlHistory.length >= 3 ? "Disponible" : "Insuficiente"}
- Whitelisted: ${isWhitelisted !== undefined ? (isWhitelisted ? "Sí" : "No") : "N/A"}
- Curator: ${curatorAddress || "No asignado"}

Contexto del Ecosistema:
- TVL Total Ethereum: $${tvlTotal.toLocaleString()} USD
- Precio ETH/USD (Chainlink): ${chainlinkPrice > 0 ? `$${chainlinkPrice.toFixed(2)} USD` : "N/A"}

Factores de riesgo a considerar:
1. TVL alto es positivo, pero caídas recientes son negativas
2. APY extremadamente alto (>50%) puede indicar riesgo
3. Vaults whitelisted son más confiables
4. Curators conocidos aumentan confianza
5. Variabilidad alta de TVL indica inestabilidad
6. Caídas de TVL >10% son señales de alerta

Responde SOLO con JSON:
{
  "score": <0-100, siendo 0 muy riesgoso y 100 muy seguro>,
  "reason": "<razón concisa, máximo 250 caracteres, destacando los factores más importantes>",
  "factors": {
    "vaultTVL": <puntos -25 a 25>,
    "tvlDrop": <puntos -20 a 10>,
    "tvlStability": <puntos -5 a 10>,
    "apy": <puntos -15 a 15>,
    "whitelisted": <puntos -5 a 10>,
    "curator": <puntos -3 a 15>,
    "protocol": <puntos -10 a 10>,
    "marketPrice": <puntos 0 a 5>,
    "ecosystemTVL": <puntos 0 a 5>
  }
}`;

        const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "Eres un analista de riesgo DeFi. Responde siempre en JSON válido.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            temperature: 0.3,
            max_tokens: 300,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices[0].message.content;
          const parsed = JSON.parse(content.trim());
          score = Math.max(0, Math.min(100, parsed.score));
          reasons.length = 0;
          reasons.push(parsed.reason || "Evaluación AI completada");
          Object.assign(factors, parsed.factors || factors);
        }
      } catch (error: any) {
        console.error("Error en OpenAI:", error.message);
        // Usar cálculo basado en reglas
      }
    }

    // Asegurar que el score esté entre 0 y 100
    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      score,
      reason: reasons.join(". ") || "Evaluación completada",
      factors,
      timestamp: Date.now(),
      vaultData: {
        name: vaultData.vaultName,
        address: vaultData.vaultAddress,
        protocol: vaultData.protocol,
        tvl: vaultTVL,
        apy: vaultAPY !== undefined ? vaultAPY : vaultData.apy,
        tvlDropPercentage: tvlDropPercentage !== 0 ? tvlDropPercentage : undefined,
        whitelisted: isWhitelisted,
        curatorAddress: curatorAddress,
      },
    };
  } catch (error: any) {
    throw new Error(`Error evaluando vault: ${error.message}`);
  }
}

