# DeFi Risk Oracle

MVP para hackathon que utiliza Chainlink CRE (Compute Runtime Environment) para evaluar el riesgo de activos DeFi mediante análisis de datos on-chain y off-chain, combinado con inteligencia artificial.

## 📋 Descripción del Proyecto

DeFi Risk Oracle es un sistema que:
- **Obtiene precios desde Chainlink Data Feeds** (oráculos descentralizados on-chain)
- **Obtiene datos de TVL desde DeFiLlama** (API confiable de datos DeFi)
- Utiliza OpenAI GPT-4o-mini para analizar y evaluar el riesgo (0-100)
- Actualiza un smart contract en la blockchain con el score de riesgo y la razón
- Proporciona una interfaz web en tiempo real para consultar y ejecutar evaluaciones

**🔗 Integración Completa**: Usa Chainlink CRE para ejecución, Chainlink Data Feeds para precios, y DeFiLlama para datos de TVL, garantizando datos confiables y actualizados.

## 🏗️ Estructura del Proyecto

```
/ketchup
  /contracts          # Smart contracts Solidity
    RiskOracle.sol
  /workflow           # Chainlink CRE workflows
    risk-evaluator.ts
    config.json
  /frontend           # Next.js frontend
    /app
      page.tsx
      api/run-check/route.ts
  /test               # Tests unitarios
    RiskOracle.test.ts
  /docs               # Documentación
    WORKFLOW_FLOW.md  # Diagrama de flujo visual
  /ketchup-workflow   # Entorno de pruebas CRE CLI (no modificar)
  hardhat.config.ts
  package.json
  README.md
```

## 🚀 Instalación

1. Instalar dependencias del proyecto principal:
```bash
npm install
```

2. Instalar dependencias del frontend:
```bash
cd frontend
npm install
cd ..
```

3. Instalar dependencias del workflow (si usas ketchup-workflow para pruebas):
```bash
cd ketchup-workflow
bun install
cd ..
```

## 🔧 Configuración

### Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto basado en `.env.example`:

```bash
cp .env.example .env
```

Luego edita `.env` y agrega tus claves:
- `INFURA_KEY`: Tu API key de Infura para Sepolia (obtén una en https://infura.io)
- `PRIVATE_KEY`: Tu clave privada para desplegar contratos (sin prefijo 0x)
- `OPENAI_API_KEY`: Tu API key de OpenAI para evaluación de riesgo (obtén una en https://platform.openai.com)

**⚠️ Importante**: 
- Reemplaza los valores placeholder (`your_infura_key_here`, `your_private_key_here`) con valores reales
- Si no configuras `INFURA_KEY`, Hardhat usará un RPC público de Sepolia (puede ser más lento)
- Si no configuras `PRIVATE_KEY`, no podrás desplegar contratos
- Si no configuras `OPENAI_API_KEY`, el sistema usará cálculo basado en reglas

## 📝 Uso

### Ejecutar Tests

```bash
npm test
```

Los tests cubren:
- Deployment del contrato
- Actualización de risk score
- Eventos emitidos
- Función `isRisky()`
- Casos límite

### Compilar los Smart Contracts

```bash
npm run compile
```

Los artefactos compilados se generarán en `./artifacts/`.

### Ejecutar el Frontend

1. Iniciar el servidor de desarrollo:
```bash
npm run dev
```

2. Abrir el navegador en `http://localhost:3000`

3. Hacer clic en "🚀 Ejecutar Evaluación de Riesgo" para ejecutar una evaluación en tiempo real

El frontend:
- Obtiene datos en tiempo real de CoinGecko y Llama.fi
- Usa OpenAI para evaluación (si está configurado)
- Muestra score, razón, factores y datos utilizados
- Interfaz visual con colores según el nivel de riesgo

### Simular el Workflow con CRE CLI

Para probar el workflow usando el entorno de pruebas:

```bash
# Desde la raíz del proyecto
cre workflow simulate ./workflow
```

O usando el script:

```bash
./workflow/test-simulation.sh
```

### Deploy Contract

1. Asegúrate de tener configurado `.env` con `INFURA_KEY` y `PRIVATE_KEY`

2. Compila el contrato:
```bash
npm run compile
```

3. Despliega el contrato en Sepolia:
```bash
npx hardhat run scripts/deploy-contract.ts --network sepolia
```

El script automáticamente:
- Despliega el contrato `RiskOracle`
- Actualiza `cre.json` con la nueva dirección
- Actualiza `workflow/config.json` con la nueva dirección
- Genera el ABI en `contracts/RiskOracle.json`

### Deploy Workflow

Una vez que el contrato esté desplegado y los archivos de configuración actualizados:

```bash
cre workflow deploy ./workflow/risk-evaluator.ts \
  --config ./workflow/config.json \
  --cre-config ./cre.json
```

O usando el script:

```bash
./workflow/deploy-workflow.sh
```

## 🧪 Testing & Deployment

### Testing the Workflow (Simulation)

Para simular el workflow localmente antes de desplegarlo:

```bash
cre workflow simulate ./workflow/risk-evaluator.ts \
  --config ./workflow/config.json \
  --cre-config ./cre.json
```

O usando el script de simulación:

```bash
./workflow/test-simulation.sh
```

### Probar Conexión OpenAI

```bash
npm run test:openai
```

Este script verifica que tu API key de OpenAI esté configurada y funcionando.

## 📊 Flujo del Workflow

Ver el diagrama completo en [`docs/WORKFLOW_FLOW.md`](./docs/WORKFLOW_FLOW.md)

### Resumen del Flujo:

1. **Trigger**: Cron schedule ejecuta el workflow periódicamente
2. **Obtención de Datos**:
   - **Precio**: **Chainlink Data Feed** (lectura on-chain directa) - ETH/USD
   - **TVL**: Llama.fi API con consenso distribuido CRE
3. **Evaluación**: OpenAI GPT-4o-mini analiza los datos y genera score (0-100)
4. **On-Chain**: Escribe el resultado al contrato `RiskOracle` en Sepolia
5. **Frontend**: Muestra resultados en tiempo real con interfaz visual

### 🔗 Integración Chainlink Completa

- **Chainlink CRE**: Para ejecución del workflow
- **Chainlink Data Feeds**: Para precios confiables on-chain
- **Consenso Distribuido**: Múltiples nodos para mayor confiabilidad

Ver más detalles en [`docs/CHAINLINK_DATA_FEEDS.md`](./docs/CHAINLINK_DATA_FEEDS.md)

## 📦 Dependencias Principales

- **@chainlink/cre-sdk**: SDK de Chainlink CRE para workflows
- **viem**: Biblioteca para interactuar con Ethereum (usada por CRE SDK)
- **hardhat**: Framework de desarrollo para Ethereum (v3)
- **ethers**: Biblioteca para interactuar con Ethereum
- **next**: Framework React para producción
- **react**: Biblioteca UI
- **openai**: Para evaluación de riesgo con AI

## 🎨 Características del Frontend

- ✅ Interfaz moderna y responsive
- ✅ Evaluación en tiempo real
- ✅ Visualización de score con colores (verde/amarillo/rojo)
- ✅ Muestra factores de evaluación
- ✅ Datos utilizados en la evaluación
- ✅ Timestamp de la evaluación
- ✅ Estados de carga y error

## 🔐 Notas de Seguridad

- El endpoint `/api/run-check` ejecuta una simulación del workflow
- Para producción, integra con el workflow CRE desplegado
- Asegúrate de configurar las variables de entorno necesarias
- Nunca commitees el archivo `.env` con claves reales

## 💼 Casos de Uso y Valor

Este proyecto es útil para:

- **Protocolos DeFi**: Mostrar score de riesgo para generar confianza
- **Wallets**: Alertar usuarios sobre protocolos riesgosos
- **Plataformas de Lending**: Decidir ratios de colateral automáticamente
- **Agregadores**: Ranking de protocolos por seguridad
- **Seguros DeFi**: Pricing dinámico basado en riesgo
- **DAOs**: Evaluar protocolos antes de invertir

Ver documentación detallada:
- [`docs/USE_CASES.md`](./docs/USE_CASES.md) - Casos de uso detallados
- [`docs/BUSINESS_VALUE.md`](./docs/BUSINESS_VALUE.md) - Valor de negocio y monetización

## 🚧 Próximos Pasos

1. ✅ Tests unitarios completos
2. ✅ Diagrama de flujo visual
3. ✅ Prompts mejorados para LLM
4. ✅ Integración frontend en tiempo real
5. ✅ Integración con Chainlink Data Feeds
6. ⏳ Integrar con workflow CRE desplegado (en lugar de simulación)
7. ⏳ Agregar WebSocket para actualizaciones en tiempo real
8. ⏳ Historial de evaluaciones
9. ⏳ Alertas cuando el score cambia significativamente
10. ⏳ Evaluación de múltiples protocolos simultáneamente

## 📄 Licencia

MIT
