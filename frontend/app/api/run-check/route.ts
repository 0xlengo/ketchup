import { NextRequest, NextResponse } from "next/server";

// Simulación del workflow (en producción, esto ejecutaría el workflow CRE real)
// Nota: El workflow real usa Chainlink Data Feeds para obtener precios on-chain
async function simulateWorkflow() {
  try {
    // Obtener datos de APIs (simulando el workflow)
    // En producción, el workflow CRE lee directamente de Chainlink Data Feeds on-chain
    // DeFiLlama API v1: obtener TVL total de Ethereum (más simple y confiable)
    const tvlResponse = await fetch("https://api.llama.fi/tvl/Ethereum");
    
    // Para simulación, obtenemos precio de CoinGecko
    // En producción, el workflow CRE usa Chainlink Data Feed ETH/USD on-chain
    const priceResponse = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");

    const priceData = priceResponse.ok
      ? await priceResponse.json()
      : null;
    
    // La API v1 retorna solo el número del TVL como texto
    const tvlText = tvlResponse.ok ? await tvlResponse.text() : "0";
    const tvlTotal = Number.parseFloat(tvlText) || 0;
    
    // Para obtener el número de protocolos, hacemos otra llamada
    let protocolsCount = 0;
    try {
      const protocolsResponse = await fetch("https://api.llama.fi/protocols");
      if (protocolsResponse.ok) {
        const protocolsData: any = await protocolsResponse.json();
        // Filtrar solo protocolos de Ethereum
        const ethereumProtocols = Array.isArray(protocolsData) 
          ? protocolsData.filter((p: any) => p.chain === "Ethereum" || p.chains?.includes("Ethereum"))
          : [];
        protocolsCount = ethereumProtocols.length;
      }
    } catch (e) {
      // Si falla, continuamos sin el número de protocolos
    }
    
    const tvlData = {
      total: tvlTotal,
      protocols: protocolsCount,
    };

    // Nota: En producción, el workflow CRE obtiene precio directamente de Chainlink Data Feed
    const chainlinkPrice = priceData?.ethereum?.usd || 0;

    // Evaluar con OpenAI si está disponible
    let score = 50;
    let reason = "Evaluación basada en datos disponibles";
    let factors: any = {};

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && openaiKey !== "your_openai_key_here") {
      try {
        const prompt = `Eres un experto analista de riesgo DeFi. Evalúa el riesgo basándote en:

Precio ETH/USD: ${chainlinkPrice} USD (simulado - en producción viene de Chainlink Data Feed)
TVL Total Ethereum (DeFiLlama): ${tvlData.total.toLocaleString()} USD
Protocolos activos: ${tvlData.protocols.length}

Responde SOLO con JSON:
{
  "score": <0-100>,
  "reason": "<razón concisa>",
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
        const result = calculateRiskScore(priceData, tvlData);
        score = result.score;
        reason = result.reason;
      }
    } else {
      // Cálculo basado en reglas
      const result = calculateRiskScore(priceData, tvlData);
      score = result.score;
      reason = result.reason;
    }

    return {
      score,
      reason,
      factors,
      timestamp: Date.now(),
      data: {
        price: { ethereum: { usd: chainlinkPrice } },
        tvl: tvlData.total,
        protocols: tvlData.protocols.length,
        source: "Chainlink Data Feed + DeFiLlama (simulado en frontend)",
      },
    };
  } catch (error: any) {
    throw new Error(`Error en workflow: ${error.message}`);
  }
}

// Función de cálculo basado en reglas (fallback)
function calculateRiskScore(priceData: any, tvlData: { total: number; protocols: any[] }) {
  let score = 50;
  const reasons: string[] = [];

  if (priceData?.ethereum?.usd) {
    score += 20; // Bonus por usar Chainlink Data Feed
    reasons.push("precio Chainlink confiable");
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
  if (tvlData.protocols && tvlData.protocols.length > 100) {
    score += 5;
    reasons.push("ecosistema diverso");
  }
  
  // Bonus por usar Chainlink
  score += 10;
  reasons.push("datos Chainlink + DeFiLlama");

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
