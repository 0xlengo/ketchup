# DeFi Risk Oracle - Flujo del Workflow CRE

## Diagrama de Flujo Visual

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRIGGER: Cron Schedule                        │
│              (Ej: cada 6 horas - "0 */6 * * *")                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Inicio del Workflow CRE                            │
│         runtime.log("🚀 Iniciando evaluación...")               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │   OBTENCIÓN DE DATOS (Paralelo)      │
        └──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Precio ETH  │  │     TVL      │  │   Volumen    │
│  CoinGecko   │  │  Llama.fi    │  │  CoinGecko   │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────────┐
        │   CONSENSO DISTRIBUIDO (CRE)         │
        │   - Múltiples nodos obtienen datos   │
        │   - Agregación por mediana           │
        │   - Mayor confiabilidad              │
        └──────────────────┬───────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │   EVALUACIÓN DE RIESGO              │
        └──────────────────┬───────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
┌──────────────────┐              ┌──────────────────┐
│  Con OpenAI AI   │              │  Reglas Básicas  │
│  (si habilitado) │              │    (fallback)    │
└────────┬─────────┘              └────────┬─────────┘
         │                                  │
         └──────────────┬───────────────────┘
                        │
                        ▼
        ┌──────────────────────────────────────┐
        │   PROMPT MEJORADO PARA LLM           │
        │                                      │
        │   - Análisis de estabilidad precio   │
        │   - Evaluación de TVL y liquidez     │
        │   - Análisis de volumen trading      │
        │   - Tendencias de mercado            │
        │                                      │
        │   Score: 0-100                       │
        │   Reason: explicación concisa        │
        └──────────────────┬───────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │   RESULTADO: { score, reason }       │
        │   Ej: { score: 75, reason: "..." }   │
        └──────────────────┬───────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                      │
        ▼                                      ▼
┌──────────────────┐              ┌──────────────────┐
│ Contrato         │              │  Logs & Return   │
│ Configurado?     │              │  (para frontend)  │
└──────┬───────────┘              └──────────────────┘
       │
       │ Sí
       ▼
┌──────────────────────────────────────┐
│   PREPARAR TRANSACCIÓN ON-CHAIN       │
│   - encodeFunctionData()             │
│   - prepareReportRequest()           │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│   ENVIAR A BLOCKCHAIN (Sepolia)      │
│   - runtime.report()                 │
│   - updateRiskScore(score, reason)   │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│   EVENTO EMITIDO                     │
│   RiskUpdated(score, reason, isRisky)│
└──────────────────┬───────────────────┘
                   │
                   ▼
        ┌──────────────────────────────────────┐
        │   FIN DEL WORKFLOW                    │
        │   Return: { score, reason, timestamp }│
        └──────────────────────────────────────┘
```

## Componentes del Flujo

### 1. Trigger (Cron)
- **Frecuencia**: Configurable en `config.json`
- **Ejemplo**: `"0 */6 * * *"` = cada 6 horas
- **Tipo**: `CronCapability` de CRE

### 2. Obtención de Datos
- **Precio**: CoinGecko API (ETH/USD)
- **TVL**: Llama.fi API (Total Value Locked)
- **Volumen**: CoinGecko API (24h trading volume)
- **Consenso**: Múltiples nodos CRE obtienen datos y se agregan por mediana

### 3. Evaluación de Riesgo

#### Opción A: Con OpenAI (Recomendado)
- **Modelo**: GPT-4o-mini (configurable)
- **Prompt**: Estructurado con criterios específicos
- **Output**: JSON con score (0-100) y razón

#### Opción B: Reglas Básicas (Fallback)
- Cálculo basado en umbrales predefinidos
- Se usa si OpenAI falla o está deshabilitado

### 4. Escritura On-Chain
- **Contrato**: `RiskOracle.sol`
- **Función**: `updateRiskScore(uint256 score, string reason)`
- **Evento**: `RiskUpdated(score, reason, isRisky)`
- **Red**: Sepolia (testnet) o mainnet

### 5. Integración Frontend
- **API Endpoint**: `/api/run-check`
- **WebSocket**: Para actualizaciones en tiempo real (opcional)
- **Display**: Score, razón, timestamp, estado (risky/safe)

## Estados del Sistema

```
┌─────────┐
│  IDLE   │ ← Esperando trigger cron
└────┬────┘
     │
     ▼
┌─────────┐
│FETCHING │ ← Obteniendo datos de APIs
└────┬────┘
     │
     ▼
┌─────────┐
│ANALYZING│ ← Evaluando riesgo (AI o reglas)
└────┬────┘
     │
     ▼
┌─────────┐
│WRITING  │ ← Escribiendo a blockchain
└────┬────┘
     │
     ▼
┌─────────┐
│COMPLETE │ ← Workflow completado
└─────────┘
```

## Manejo de Errores

```
Error en API → Retry con fallback
Error en AI → Usar cálculo basado en reglas
Error en Blockchain → Log error, retornar resultado sin escribir
Error en Red → Timeout y retry
```

## Métricas y Logging

- ✅ Datos obtenidos exitosamente
- 📊 Score calculado
- ⛓️ Transacción enviada
- ⚠️ Warnings y errores
- 🎯 Resultado final

