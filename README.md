# DeFi Risk Oracle

MVP para hackathon que utiliza Chainlink CRE (Compute Runtime Environment) para evaluar el riesgo de activos DeFi mediante análisis de datos on-chain y off-chain, combinado con inteligencia artificial.

## 📋 Descripción del Proyecto

DeFi Risk Oracle es un sistema que:
- Obtiene datos de precio y TVL de APIs externas (CoinGecko, Llama.fi) usando consenso distribuido
- Calcula un score de riesgo basado en análisis de datos (0-100)
- Actualiza un smart contract en la blockchain con el score de riesgo y la razón
- Proporciona una interfaz web para consultar y ejecutar evaluaciones

**Nota**: El workflow actual calcula el score usando lógica basada en reglas. Puede ser extendido para usar servicios de AI externos si es necesario.

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

## 📝 Uso

### Simular el Workflow con CRE CLI

Para probar el workflow usando el entorno de pruebas:

```bash
# Desde la raíz del proyecto
cre workflow simulate ./workflow/risk-evaluator.ts
```

O usando el entorno ketchup-workflow:

```bash
# Copiar el workflow a ketchup-workflow para pruebas
cp workflow/risk-evaluator.ts ketchup-workflow/
cre workflow simulate ketchup-workflow
```

### Compilar los Smart Contracts

```bash
npm run compile
```

Los artefactos compilados se generarán en `./artifacts/`.

### Ejecutar Tests (si los hay)

```bash
npm test
```

### Ejecutar el Frontend

1. Iniciar el servidor de desarrollo:
```bash
npm run dev
```

2. Abrir el navegador en `http://localhost:3000`

3. Hacer clic en "Run Risk Check" para ejecutar una evaluación (actualmente devuelve datos mock)

### Build de Producción del Frontend

```bash
npm run build
npm start
```

## 🔧 Configuración

### Workflow Config

El archivo `workflow/config.json` contiene la configuración del workflow. Actualmente incluye un schedule para ejecución periódica.

### Hardhat Config

El archivo `hardhat.config.ts` está configurado para:
- Compilar Solidity 0.8.20
- Usar optimizador con 200 runs
- Red local Hardhat (chainId: 1337)

## 📦 Dependencias Principales

- **@chainlink/cre-sdk**: SDK de Chainlink CRE para workflows
- **viem**: Biblioteca para interactuar con Ethereum (usada por CRE SDK)
- **hardhat**: Framework de desarrollo para Ethereum
- **ethers**: Biblioteca para interactuar con Ethereum
- **next**: Framework React para producción
- **react**: Biblioteca UI

## 🔐 Notas de Seguridad

- El endpoint `/api/run-check` actualmente devuelve datos mock
- Para producción, necesitarás integrar la ejecución real del workflow CRE
- Asegúrate de configurar las variables de entorno necesarias (API keys, private keys, etc.)

## 🚧 Próximos Pasos

1. Integrar la ejecución real del workflow CRE en el endpoint API
2. Conectar el frontend con el smart contract desplegado
3. Agregar autenticación y rate limiting
4. Implementar historial de evaluaciones
5. Agregar más fuentes de datos para el análisis de riesgo

## 📄 Licencia

MIT

