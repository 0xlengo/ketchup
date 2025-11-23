import { cre, Runner, type Runtime, prepareReportRequest, getNetwork, type HTTPSendRequester, ok, text, consensusMedianAggregation } from "@chainlink/cre-sdk";
import { encodeFunctionData, zeroAddress, type Address } from "viem";

type Config = {
  schedule: string;
  evm: {
    chainSelectorName: string;
    contractAddress: string;
  };
  openai?: {
    model?: string;
    enabled?: boolean;
  };
};

// ABI del contrato RiskOracle
const RISK_ORACLE_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "score", type: "uint256" },
      { internalType: "string", name: "reason", type: "string" }
    ],
    name: "updateRiskScore",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

// Función para obtener datos de precio
const fetchPriceData = (sendRequester: HTTPSendRequester) => {
  const response = sendRequester
    .sendRequest({ 
      url: "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      method: "GET" 
    })
    .result();

  if (!ok(response)) {
    throw new Error(`Price API failed with status: ${response.statusCode}`);
  }

  return JSON.parse(text(response));
};

// Función para obtener datos de TVL
const fetchTVLData = (sendRequester: HTTPSendRequester) => {
  const response = sendRequester
    .sendRequest({ 
      url: "https://api.llama.fi/tvl/ethereum",
      method: "GET" 
    })
    .result();

  if (!ok(response)) {
    return 0;
  }

  const tvlText = text(response);
  return tvlText ? Number.parseFloat(tvlText) : 0;
};

// Función para obtener datos de volumen de trading
const fetchVolumeData = (sendRequester: HTTPSendRequester) => {
  const response = sendRequester
    .sendRequest({ 
      url: "https://api.coingecko.com/api/v3/coins/ethereum?localization=false&tickers=false&market_data=true",
      method: "GET" 
    })
    .result();

  if (!ok(response)) {
    return null;
  }

  const data = JSON.parse(text(response));
  return {
    priceChange24h: data.market_data?.price_change_percentage_24h || 0,
    volume24h: data.market_data?.total_volume?.usd || 0,
    marketCap: data.market_data?.market_cap?.usd || 0,
  };
};

// Prompt mejorado para evaluación de riesgo con LLM
const createRiskEvaluationPrompt = (
  priceData: any,
  tvlData: number,
  volumeData: any
): string => {
  return `Eres un experto analista de riesgo DeFi. Evalúa el riesgo de un protocolo DeFi basándote en los siguientes datos:

## Datos del Protocolo:

**Precio (ETH/USD):**
${JSON.stringify(priceData, null, 2)}

**TVL (Total Value Locked):**
${tvlData.toLocaleString()} USD

**Datos de Volumen y Mercado:**
${volumeData ? JSON.stringify(volumeData, null, 2) : "No disponible"}

## Criterios de Evaluación:

1. **Estabilidad de Precio (0-30 puntos)**:
   - Precio estable (±1%): 25-30 puntos
   - Pequeña volatilidad (±5%): 15-24 puntos
   - Alta volatilidad (>5%): 0-14 puntos

2. **TVL y Liquidez (0-30 puntos)**:
   - TVL > $1B: 25-30 puntos
   - TVL $100M-$1B: 15-24 puntos
   - TVL < $100M: 0-14 puntos

3. **Volumen de Trading (0-20 puntos)**:
   - Volumen alto y consistente: 15-20 puntos
   - Volumen moderado: 8-14 puntos
   - Volumen bajo: 0-7 puntos

4. **Tendencias de Mercado (0-20 puntos)**:
   - Tendencia positiva estable: 15-20 puntos
   - Tendencia neutra: 8-14 puntos
   - Tendencia negativa: 0-7 puntos

## Instrucciones:

1. Analiza cada criterio y asigna puntos según los datos proporcionados
2. Calcula el score total (0-100)
3. Proporciona una razón concisa (máximo 200 caracteres) explicando los factores principales

## Formato de Respuesta (JSON estricto):

{
  "score": <número entre 0 y 100>,
  "reason": "<razón concisa>",
  "factors": {
    "priceStability": <puntos>,
    "tvlLiquidity": <puntos>,
    "tradingVolume": <puntos>,
    "marketTrend": <puntos>
  }
}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional.`;
};

// Función para evaluar riesgo usando OpenAI
const evaluateRiskWithAI = async (
  runtime: Runtime<Config>,
  priceData: any,
  tvlData: number,
  volumeData: any
): Promise<{ score: number; reason: string }> => {
  const useAI = runtime.config.openai?.enabled !== false;
  
  if (!useAI) {
    runtime.log("AI deshabilitada, usando cálculo basado en reglas");
    return calculateRiskScore(priceData, tvlData, volumeData);
  }

  try {
    const prompt = createRiskEvaluationPrompt(priceData, tvlData, volumeData);
    
    // Hacer request a OpenAI API
    const httpCapability = new cre.capabilities.HTTPClient();
    const model = runtime.config.openai?.model || "gpt-4o-mini";
    
    const openaiResponse = await httpCapability
      .sendRequest(
        runtime,
        (sendRequester: HTTPSendRequester) => {
          const response = sendRequester
            .sendRequest({
              url: "https://api.openai.com/v1/chat/completions",
              method: "POST",
              headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY || ""}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: model,
                messages: [
                  {
                    role: "system",
                    content: "Eres un analista de riesgo DeFi experto. Responde siempre en formato JSON válido."
                  },
                  {
                    role: "user",
                    content: prompt
                  }
                ],
                temperature: 0.3,
                max_tokens: 300,
              }),
            })
            .result();

          if (!ok(response)) {
            throw new Error(`OpenAI API failed with status: ${response.statusCode}`);
          }

          return JSON.parse(text(response));
        },
        consensusMedianAggregation()
      )(runtime.config)
      .result();

    const content = openaiResponse.choices[0].message.content;
    const parsed = JSON.parse(content.trim());
    
    runtime.log(`AI Score: ${parsed.score}, Reason: ${parsed.reason}`);
    
    return {
      score: Math.max(0, Math.min(100, parsed.score)),
      reason: parsed.reason || "Evaluación AI completada",
    };
  } catch (error: any) {
    runtime.log(`Error en evaluación AI: ${error.message}, usando cálculo basado en reglas`);
    return calculateRiskScore(priceData, tvlData, volumeData);
  }
};

// Calcular score de riesgo basado en reglas (fallback)
const calculateRiskScore = (
  priceData: any,
  tvlData: number,
  volumeData: any
): { score: number; reason: string } => {
  let score = 50; // Score base
  const reasons: string[] = [];

  // Evaluar estabilidad de precio
  if (priceData && priceData.ethereum) {
    const price = priceData.ethereum.usd || 0;
    if (price > 0) {
      score += 15;
      reasons.push("precio disponible");
    }
  }

  // Evaluar TVL
  if (tvlData > 1000000000) { // > $1B
    score += 25;
    reasons.push("TVL muy alto");
  } else if (tvlData > 100000000) { // > $100M
    score += 15;
    reasons.push("TVL alto");
  } else if (tvlData > 10000000) { // > $10M
    score += 10;
    reasons.push("TVL moderado");
  } else if (tvlData > 0) {
    score += 5;
    reasons.push("TVL bajo");
  } else {
    score -= 10;
    reasons.push("TVL no disponible");
  }

  // Evaluar volumen si está disponible
  if (volumeData) {
    if (volumeData.volume24h > 1000000000) { // > $1B
      score += 15;
      reasons.push("volumen alto");
    } else if (volumeData.volume24h > 100000000) { // > $100M
      score += 10;
      reasons.push("volumen moderado");
    }

    // Evaluar cambio de precio
    const priceChange = Math.abs(volumeData.priceChange24h || 0);
    if (priceChange < 2) {
      score += 10;
      reasons.push("precio estable");
    } else if (priceChange > 10) {
      score -= 15;
      reasons.push("alta volatilidad");
    }
  }

  // Asegurar que el score esté entre 0 y 100
  score = Math.max(0, Math.min(100, score));

  return {
    score: Math.round(score),
    reason: reasons.join(", ") || "evaluación basada en datos disponibles"
  };
};

const onCronTrigger = async (runtime: Runtime<Config>) => {
  runtime.log("🚀 Iniciando evaluación de riesgo DeFi...");

  const { chainSelectorName, contractAddress } = runtime.config.evm;

  // Obtener datos usando HTTP con consenso
  const httpCapability = new cre.capabilities.HTTPClient();
  
  runtime.log("📊 Obteniendo datos de precio...");
  const priceData = await httpCapability
    .sendRequest(runtime, fetchPriceData, consensusMedianAggregation())(runtime.config)
    .result();

  runtime.log("💰 Obteniendo datos de TVL...");
  const tvlData = await httpCapability
    .sendRequest(runtime, fetchTVLData, consensusMedianAggregation())(runtime.config)
    .result();

  runtime.log("📈 Obteniendo datos de volumen...");
  const volumeData = await httpCapability
    .sendRequest(runtime, fetchVolumeData, consensusMedianAggregation())(runtime.config)
    .result()
    .catch(() => null);

  runtime.log(`✅ Datos obtenidos - Precio: ${JSON.stringify(priceData)}, TVL: ${tvlData.toLocaleString()}`);

  // Evaluar riesgo (con AI si está habilitado)
  runtime.log("🤖 Evaluando riesgo...");
  const { score, reason } = await evaluateRiskWithAI(runtime, priceData, tvlData, volumeData);
  
  runtime.log(`📊 Score calculado: ${score}/100`);
  runtime.log(`📝 Razón: ${reason}`);

  // Preparar escritura al contrato (solo si hay dirección válida)
  if (contractAddress && contractAddress !== "0x0000000000000000000000000000000000000000") {
    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName,
      isTestnet: true,
    });

    if (!network) {
      throw new Error(`Network not found: ${chainSelectorName}`);
    }

    runtime.log("⛓️  Preparando transacción on-chain...");
    const writeData = encodeFunctionData({
      abi: RISK_ORACLE_ABI,
      functionName: "updateRiskScore",
      args: [BigInt(score), reason],
    });

    const report = runtime.report(prepareReportRequest(writeData)).result();
    
    runtime.log(`✅ Report enviado al contrato: ${contractAddress}`);
    runtime.log(`🎯 Score ${score} actualizado en blockchain`);
  } else {
    runtime.log(`⚠️  Contrato no configurado, saltando escritura on-chain`);
  }

  return { score, reason, timestamp: Date.now() };
};

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();

  return [
    cre.handler(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
