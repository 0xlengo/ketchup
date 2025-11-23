import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { sepolia, mainnet } from "viem/chains";

// ABI del Chainlink Data Feed (AggregatorV3Interface)
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
  },
  {
    inputs: [],
    name: "description",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

// Direcciones de Chainlink Data Feeds
const CHAINLINK_FEEDS = {
  sepolia: {
    ethUsd: "0x694AA1769357215DE4FAC081bf1f309aDC325306" as Address,
  },
  mainnet: {
    ethUsd: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" as Address,
  },
};

// Función para obtener precio desde Chainlink Data Feed
async function fetchPriceFromChainlink(useMainnet: boolean = false): Promise<{ price: number; decimals: number; updatedAt: number }> {
  const chain = useMainnet ? mainnet : sepolia;
  const feedAddress = useMainnet ? CHAINLINK_FEEDS.mainnet.ethUsd : CHAINLINK_FEEDS.sepolia.ethUsd;
  
  // Crear cliente público (puede usar RPC público o configurado)
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });

  try {
    // Obtener decimals
    const decimals = await publicClient.readContract({
      address: feedAddress,
      abi: CHAINLINK_DATA_FEED_ABI,
      functionName: "decimals",
    });

    // Obtener latestRoundData
    const result = await publicClient.readContract({
      address: feedAddress,
      abi: CHAINLINK_DATA_FEED_ABI,
      functionName: "latestRoundData",
    }) as [bigint, bigint, bigint, bigint, bigint];

    const [, answer, , updatedAt] = result;
    
    // Convertir answer a número con los decimales correctos
    const price = Number(answer) / Math.pow(10, Number(decimals));

    return {
      price,
      decimals: Number(decimals),
      updatedAt: Number(updatedAt),
    };
  } catch (error: any) {
    console.error("Error leyendo Chainlink Data Feed:", error.message);
    throw error;
  }
}

// Función principal del workflow
async function simulateWorkflow() {
  try {
    // Obtener precio desde Chainlink Data Feed (on-chain)
    let chainlinkPrice = 0;
    let priceUpdatedAt = 0;
    let priceDecimals = 8;
    
    try {
      // Intentar primero Sepolia (testnet), si falla intentar Mainnet
      try {
        const priceData = await fetchPriceFromChainlink(false); // Sepolia
        chainlinkPrice = priceData.price;
        priceUpdatedAt = priceData.updatedAt;
        priceDecimals = priceData.decimals;
      } catch (e) {
        console.log("Intentando Mainnet...");
        const priceData = await fetchPriceFromChainlink(true); // Mainnet
        chainlinkPrice = priceData.price;
        priceUpdatedAt = priceData.updatedAt;
        priceDecimals = priceData.decimals;
      }
    } catch (e) {
      console.error("Error obteniendo precio de Chainlink:", e);
      // Continuar sin precio, pero con score reducido
    }
    
    // Obtener TVL desde DeFiLlama
    let tvlTotal = 0;
    try {
      const tvlResponse = await fetch("https://api.llama.fi/tvl/Ethereum", {
        cache: 'no-store',
        headers: {
          'Accept': 'text/plain',
        },
      });
      
      if (tvlResponse.ok) {
        const tvlText = await tvlResponse.text();
        tvlTotal = Number.parseFloat(tvlText.trim()) || 0;
      }
    } catch (e) {
      console.error("Error obteniendo TVL:", e);
    }
    
    // Obtener número de protocolos
    let protocolsCount = 0;
    try {
      const protocolsResponse = await fetch("https://api.llama.fi/protocols", {
        cache: 'no-store',
      });
      if (protocolsResponse.ok) {
        const protocolsData: any = await protocolsResponse.json();
        const ethereumProtocols = Array.isArray(protocolsData) 
          ? protocolsData.filter((p: any) => p.chain === "Ethereum" || p.chains?.includes("Ethereum"))
          : [];
        protocolsCount = ethereumProtocols.length;
      }
    } catch (e) {
      console.error("Error obteniendo protocolos:", e);
    }

    // Evaluar con OpenAI si está disponible
    let score = 50;
    let reason = "Evaluación basada en datos disponibles";
    let factors: any = {};

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && openaiKey !== "your_openai_key_here") {
      try {
        const priceAge = priceUpdatedAt > 0 
          ? Math.floor((Date.now() / 1000 - priceUpdatedAt) / 60) 
          : null;
        
        const prompt = `Eres un experto analista de riesgo DeFi. Evalúa el riesgo basándote en:

Precio ETH/USD (Chainlink Data Feed): ${chainlinkPrice > 0 ? `$${chainlinkPrice.toFixed(2)} USD${priceAge ? ` (actualizado hace ${priceAge} minutos)` : ''}` : 'No disponible'}
TVL Total Ethereum (DeFiLlama): ${tvlTotal > 0 ? `$${tvlTotal.toLocaleString()} USD` : 'No disponible'}
Protocolos activos: ${protocolsCount}

Responde SOLO con JSON:
{
  "score": <0-100>,
  "reason": "<razón concisa, máximo 200 caracteres>",
  "factors": {
    "priceStability": <puntos>,
    "tvlLiquidity": <puntos>,
    "tradingVolume": <puntos>,
    "marketTrend": <puntos>
  }
}`;

        const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "Eres un analista de riesgo DeFi. Responde siempre en JSON válido."
              },
              {
                role: "user",
                content: prompt
              }
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
          reason = parsed.reason || reason;
          factors = parsed.factors || {};
        }
      } catch (error: any) {
        console.error("Error en OpenAI:", error.message);
        // Fallback a cálculo basado en reglas
        const result = calculateRiskScore(chainlinkPrice, { total: tvlTotal, protocols: protocolsCount });
        score = result.score;
        reason = result.reason;
      }
    } else {
      // Cálculo basado en reglas
      const result = calculateRiskScore(chainlinkPrice, { total: tvlTotal, protocols: protocolsCount });
      score = result.score;
      reason = result.reason;
    }

    return {
      score,
      reason,
      factors,
      timestamp: Date.now(),
      data: {
        price: chainlinkPrice > 0 ? { ethereum: { usd: chainlinkPrice } } : null,
        tvl: tvlTotal,
        protocols: protocolsCount,
        priceUpdatedAt: priceUpdatedAt > 0 ? priceUpdatedAt : undefined,
        source: "Chainlink Data Feed (on-chain) + DeFiLlama",
      },
    };
  } catch (error: any) {
    throw new Error(`Error en workflow: ${error.message}`);
  }
}

// Función de cálculo basado en reglas (fallback)
function calculateRiskScore(chainlinkPrice: number, tvlData: { total: number; protocols: number }) {
  let score = 50;
  const reasons: string[] = [];

  if (chainlinkPrice > 0) {
    score += 20; // Bonus por usar Chainlink Data Feed
    reasons.push("precio Chainlink Data Feed confiable");
  }

  const tvlTotal = tvlData.total || 0;
  if (tvlTotal > 10000000000) { // > $10B
    score += 30;
    reasons.push("TVL muy alto (DeFiLlama)");
  } else if (tvlTotal > 1000000000) { // > $1B
    score += 25;
    reasons.push("TVL alto (DeFiLlama)");
  } else if (tvlTotal > 100000000) { // > $100M
    score += 15;
    reasons.push("TVL moderado (DeFiLlama)");
  } else if (tvlTotal > 0) {
    score += 5;
    reasons.push("TVL bajo (DeFiLlama)");
  }
  
  // Bonus por diversidad de protocolos
  if (tvlData.protocols && tvlData.protocols > 100) {
    score += 5;
    reasons.push("ecosistema diverso");
  }
  
  // Bonus por usar Chainlink
  score += 10;
  reasons.push("datos Chainlink Data Feed + DeFiLlama");

  score = Math.max(0, Math.min(100, score));

  return {
    score: Math.round(score),
    reason: reasons.join(", ") || "evaluación basada en datos disponibles",
  };
}

export async function POST(request: NextRequest) {
  try {
    const result = await simulateWorkflow();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { 
        error: error.message,
        score: null,
        reason: "Error al ejecutar evaluación"
      },
      { status: 500 }
    );
  }
}
