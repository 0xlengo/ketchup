import { NextRequest, NextResponse } from "next/server";

// Simulación del workflow (en producción, esto ejecutaría el workflow CRE real)
async function simulateWorkflow() {
  try {
    // Obtener datos de APIs (simulando el workflow)
    const [priceResponse, tvlResponse, volumeResponse] = await Promise.allSettled([
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"),
      fetch("https://api.llama.fi/tvl/ethereum"),
      fetch("https://api.coingecko.com/api/v3/coins/ethereum?localization=false&tickers=false&market_data=true"),
    ]);

    const priceData = priceResponse.status === "fulfilled" 
      ? await priceResponse.value.json() 
      : null;
    
    const tvlData = tvlResponse.status === "fulfilled"
      ? await tvlResponse.value.text().then(t => parseFloat(t) || 0)
      : 0;

    const volumeData = volumeResponse.status === "fulfilled"
      ? await volumeResponse.value.json().then((d: any) => ({
          priceChange24h: d.market_data?.price_change_percentage_24h || 0,
          volume24h: d.market_data?.total_volume?.usd || 0,
          marketCap: d.market_data?.market_cap?.usd || 0,
        }))
      : null;

    // Evaluar con OpenAI si está disponible
    let score = 50;
    let reason = "Evaluación basada en datos disponibles";
    let factors: any = {};

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && openaiKey !== "your_openai_key_here") {
      try {
        const prompt = `Eres un experto analista de riesgo DeFi. Evalúa el riesgo basándote en:

Precio ETH: ${JSON.stringify(priceData)}
TVL: ${tvlData.toLocaleString()} USD
Volumen: ${volumeData ? JSON.stringify(volumeData) : "No disponible"}

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
        score = calculateRiskScore(priceData, tvlData, volumeData).score;
        reason = calculateRiskScore(priceData, tvlData, volumeData).reason;
      }
    } else {
      // Cálculo basado en reglas
      const result = calculateRiskScore(priceData, tvlData, volumeData);
      score = result.score;
      reason = result.reason;
    }

    return {
      score,
      reason,
      factors,
      timestamp: Date.now(),
      data: {
        price: priceData,
        tvl: tvlData,
        volume: volumeData,
      },
    };
  } catch (error: any) {
    throw new Error(`Error en workflow: ${error.message}`);
  }
}

// Función de cálculo basado en reglas (fallback)
function calculateRiskScore(priceData: any, tvlData: number, volumeData: any) {
  let score = 50;
  const reasons: string[] = [];

  if (priceData?.ethereum?.usd) {
    score += 15;
    reasons.push("precio disponible");
  }

  if (tvlData > 1000000000) {
    score += 25;
    reasons.push("TVL muy alto");
  } else if (tvlData > 100000000) {
    score += 15;
    reasons.push("TVL alto");
  } else if (tvlData > 10000000) {
    score += 10;
    reasons.push("TVL moderado");
  } else if (tvlData > 0) {
    score += 5;
    reasons.push("TVL bajo");
  }

  if (volumeData) {
    if (volumeData.volume24h > 1000000000) {
      score += 15;
      reasons.push("volumen alto");
    }
    const priceChange = Math.abs(volumeData.priceChange24h || 0);
    if (priceChange < 2) {
      score += 10;
      reasons.push("precio estable");
    } else if (priceChange > 10) {
      score -= 15;
      reasons.push("alta volatilidad");
    }
  }

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
