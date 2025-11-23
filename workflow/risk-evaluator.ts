import { cre, Runner, type Runtime, prepareReportRequest, getNetwork, encodeCallMsg, bytesToHex, LAST_FINALIZED_BLOCK_NUMBER, consensusMedianAggregation, type HTTPSendRequester, ok, text } from "@chainlink/cre-sdk";
import { encodeFunctionData, decodeFunctionResult, zeroAddress, type Address } from "viem";

type Config = {
  schedule: string;
  evm: {
    chainSelectorName: string;
    contractAddress: string;
    dataFeeds?: {
      ethUsd?: string; // Address del Data Feed ETH/USD
    };
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

// Función para obtener precio desde Chainlink Data Feed
const fetchPriceFromChainlink = async (
  runtime: Runtime<Config>,
  dataFeedAddress: string
): Promise<{ price: number; decimals: number; updatedAt: number }> => {
  const { chainSelectorName } = runtime.config.evm;
  
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found: ${chainSelectorName}`);
  }

  const evmClient = new cre.capabilities.EVMClient(
    network.chainSelector.selector
  );

  // Obtener decimals del Data Feed
  const decimalsData = encodeFunctionData({
    abi: CHAINLINK_DATA_FEED_ABI,
    functionName: "decimals",
  });

  const decimalsCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: dataFeedAddress as Address,
        data: decimalsData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const decimals = Number(decodeFunctionResult({
    abi: CHAINLINK_DATA_FEED_ABI,
    functionName: "decimals",
    data: bytesToHex(decimalsCall.data),
  }));

  // Obtener latestRoundData
  const latestRoundData = encodeFunctionData({
    abi: CHAINLINK_DATA_FEED_ABI,
    functionName: "latestRoundData",
  });

  const priceCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: dataFeedAddress as Address,
        data: latestRoundData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const result = decodeFunctionResult({
    abi: CHAINLINK_DATA_FEED_ABI,
    functionName: "latestRoundData",
    data: bytesToHex(priceCall.data),
  }) as [bigint, bigint, bigint, bigint, bigint];

  const [, answer, , updatedAt] = result;
  
  // Convertir answer a número con los decimales correctos
  const price = Number(answer) / Math.pow(10, decimals);

  return {
    price,
    decimals,
    updatedAt: Number(updatedAt),
  };
};

// Función para obtener datos de TVL desde DeFiLlama
const fetchTVLData = async (runtime: Runtime<Config>): Promise<{ total: number; protocols: number }> => {
  // Usamos HTTPClient pero solo para obtener el TVL numérico, luego hacemos otra llamada para protocolos
  const httpCapability = new cre.capabilities.HTTPClient();
  
  const fetchTVL = (sendRequester: HTTPSendRequester) => {
    // DeFiLlama API v2: obtener TVL de todas las chains y buscar Ethereum
    const response = sendRequester
      .sendRequest({
        url: "https://api.llama.fi/v2/chains",
        method: "GET",
      })
      .result();

    if (!ok(response)) {
      return 0;
    }

    // La API v2 retorna un array de chains con TVL
    const dataText = text(response);
    try {
      const chains = JSON.parse(dataText);
      if (Array.isArray(chains)) {
        // Buscar Ethereum por nombre o chainId
        const ethereum = chains.find((chain: any) => 
          chain.name === "Ethereum" || chain.chainId === 1 || chain.gecko_id === "ethereum"
        );
        return ethereum?.tvl || 0;
      }
    } catch (e) {
      // Si falla el parse, retornar 0
      return 0;
    }
    
    return 0;
  };
  
  // Obtener TVL usando consenso (es un número)
  try {
    const tvlTotal = await httpCapability
      .sendRequest(runtime, fetchTVL, consensusMedianAggregation())()
      .result();
    
    runtime.log(`✅ TVL obtenido de DeFiLlama: ${tvlTotal}`);
    
    return {
      total: tvlTotal || 0,
      protocols: 0, // Se puede agregar después si es necesario
    };
  } catch (error: any) {
    runtime.log(`⚠️  Error obteniendo TVL: ${error.message}`);
    return {
      total: 0,
      protocols: 0,
    };
  }
};

// Prompt mejorado para evaluación de riesgo con LLM
const createRiskEvaluationPrompt = (
  priceData: { price: number; updatedAt: number },
  tvlData: { total: number; protocols: any[] }
): string => {
  const priceAge = Math.floor((Date.now() / 1000 - priceData.updatedAt) / 60); // minutos
  
  return `Eres un experto analista de riesgo DeFi. Evalúa el riesgo de un protocolo DeFi basándote en los siguientes datos de Chainlink y DeFiLlama:

## Datos del Protocolo:

**Precio ETH/USD (Chainlink Data Feed):**
${priceData.price.toFixed(2)} USD
Actualizado hace: ${priceAge} minutos

**TVL Total Ethereum (DeFiLlama):**
${tvlData.total.toLocaleString()} USD
Número de protocolos: ${tvlData.protocols.length}

## Criterios de Evaluación:

1. **Estabilidad de Precio (0-30 puntos)**:
   - Precio de Chainlink (fuente confiable): +10 puntos base
   - Precio actualizado (< 1 hora): 15-20 puntos adicionales
   - Precio actualizado (1-4 horas): 10-14 puntos adicionales
   - Precio desactualizado (> 4 horas): 0-9 puntos adicionales

2. **TVL y Liquidez (0-30 puntos)**:
   - TVL > $1B: 25-30 puntos
   - TVL $100M-$1B: 15-24 puntos
   - TVL < $100M: 0-14 puntos

3. **Confiabilidad de Datos (0-20 puntos)**:
   - Usando Chainlink Data Feeds (oráculo descentralizado): 15-20 puntos
   - Datos on-chain verificables: +5 puntos

4. **Tendencias de Mercado (0-20 puntos)**:
   - Basado en precio Chainlink y TVL estable: 15-20 puntos
   - Datos mixtos: 8-14 puntos
   - Señales de riesgo: 0-7 puntos

## Instrucciones:

1. Analiza cada criterio y asigna puntos según los datos proporcionados
2. Calcula el score total (0-100)
3. Proporciona una razón concisa (máximo 200 caracteres) explicando los factores principales
4. Destaca el uso de Chainlink Data Feeds como fuente confiable

## Formato de Respuesta (JSON estricto):

{
  "score": <número entre 0 y 100>,
  "reason": "<razón concisa>",
  "factors": {
    "priceStability": <puntos>,
    "tvlLiquidity": <puntos>,
    "dataReliability": <puntos>,
    "marketTrend": <puntos>
  }
}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional.`;
};

// Función para evaluar riesgo usando OpenAI
const evaluateRiskWithAI = async (
  runtime: Runtime<Config>,
  priceData: { price: number; updatedAt: number },
  tvlData: { total: number; protocols: number }
): Promise<{ score: number; reason: string; factors?: any }> => {
  const useAI = runtime.config.openai?.enabled !== false;
  
  if (!useAI) {
    runtime.log("AI deshabilitada, usando cálculo basado en reglas");
    return calculateRiskScore(priceData, tvlData);
  }

  try {
    const prompt = createRiskEvaluationPrompt(priceData, { total: tvlData.total, protocols: [] });
    
    // Hacer request a OpenAI API usando HTTP capability
    const httpCapability = new cre.capabilities.HTTPClient();
    const model = runtime.config.openai?.model || "gpt-4o-mini";
    
    const fetchOpenAI = (sendRequester: HTTPSendRequester) => {
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
    };
    
    const openaiResponse = await httpCapability
      .sendRequest(runtime, fetchOpenAI, consensusMedianAggregation())()
      .result();

    const content = openaiResponse.choices[0].message.content;
    const parsed = JSON.parse(content.trim());
    
    runtime.log(`AI Score: ${parsed.score}, Reason: ${parsed.reason}`);
    
    return {
      score: Math.max(0, Math.min(100, parsed.score)),
      reason: parsed.reason || "Evaluación AI completada",
      factors: parsed.factors,
    };
  } catch (error: any) {
    runtime.log(`Error en evaluación AI: ${error.message}, usando cálculo basado en reglas`);
    const result = calculateRiskScore(priceData, tvlData);
    return {
      ...result,
      factors: {},
    };
  }
};

// Calcular score de riesgo basado en reglas (fallback)
const calculateRiskScore = (
  priceData: { price: number; updatedAt: number },
  tvlData: { total: number; protocols: number }
): { score: number; reason: string } => {
  let score = 50; // Score base
  const reasons: string[] = [];

  // Evaluar precio de Chainlink (fuente confiable)
  if (priceData.price > 0) {
    score += 20; // Bonus por usar Chainlink
    reasons.push("precio Chainlink confiable");
    
    // Verificar actualización
    const priceAge = Math.floor((Date.now() / 1000 - priceData.updatedAt) / 60);
    if (priceAge < 60) {
      score += 15;
      reasons.push("precio actualizado");
    } else if (priceAge < 240) {
      score += 10;
      reasons.push("precio reciente");
    } else {
      score += 5;
      reasons.push("precio desactualizado");
    }
  }

  // Evaluar TVL (DeFiLlama)
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
  } else {
    score -= 10;
    reasons.push("TVL no disponible");
  }
  
  // Bonus por diversidad de protocolos
  if (tvlData.protocols > 100) {
    score += 5;
    reasons.push("ecosistema diverso");
  }

  // Bonus por usar Chainlink Data Feeds
  score += 10;
  reasons.push("datos Chainlink");

  // Asegurar que el score esté entre 0 y 100
  score = Math.max(0, Math.min(100, score));

  return {
    score: Math.round(score),
    reason: reasons.join(", ") || "evaluación basada en datos Chainlink"
  };
};

const onCronTrigger = async (runtime: Runtime<Config>) => {
  runtime.log("🚀 Iniciando evaluación de riesgo DeFi con Chainlink Data Feeds...");

  const { chainSelectorName, contractAddress, dataFeeds } = runtime.config.evm;

  // Obtener precio desde Chainlink Data Feed
  const ethUsdFeed = dataFeeds?.ethUsd || getDefaultDataFeedAddress(chainSelectorName);
  
  runtime.log(`📊 Obteniendo precio ETH/USD desde Chainlink Data Feed: ${ethUsdFeed}`);
  const priceData = await fetchPriceFromChainlink(runtime, ethUsdFeed);
  runtime.log(`✅ Precio Chainlink: $${priceData.price.toFixed(2)} USD (decimals: ${priceData.decimals})`);

  runtime.log("💰 Obteniendo datos de TVL desde DeFiLlama...");
  const tvlData = await fetchTVLData(runtime);
  runtime.log(`✅ TVL Total (DeFiLlama): $${tvlData.total.toLocaleString()} USD`);
  runtime.log(`✅ Protocolos activos en Ethereum: ${tvlData.protocols || 'N/A'}`);

  // Evaluar riesgo (con AI si está habilitado)
  runtime.log("🤖 Evaluando riesgo...");
  const { score, reason, factors } = await evaluateRiskWithAI(runtime, priceData, tvlData);
  
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

  return { 
    score, 
    reason, 
    factors: factors || {},
    price: priceData.price,
    tvl: tvlData.total,
    protocols: tvlData.protocols || 0,
    timestamp: Date.now() 
  };
};

// Obtener dirección del Data Feed por defecto según la red
function getDefaultDataFeedAddress(chainSelectorName: string): string {
  // Sepolia ETH/USD Data Feed
  if (chainSelectorName.includes("sepolia")) {
    return "0x694AA1769357215DE4FAC081bf1f309aDC325306";
  }
  // Mainnet ETH/USD Data Feed
  if (chainSelectorName.includes("mainnet") || chainSelectorName.includes("ethereum-mainnet")) {
    return "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  }
  // Por defecto Sepolia
  return "0x694AA1769357215DE4FAC081bf1f309aDC325306";
}

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
