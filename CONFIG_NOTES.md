# Notas de Configuración

## Archivos de Configuración

### `cre.json`
**Ubicación**: Raíz del proyecto

Este archivo define la conexión entre CRE y los contratos desplegados.

**⚠️ IMPORTANTE**: Reemplaza `address` después del deploy del contrato. El script `scripts/deploy-contract.ts` actualiza esto automáticamente.

### `workflow/config.json`
**Ubicación**: `/workflow/config.json`

Este archivo contiene la configuración del workflow CRE.

**⚠️ IMPORTANTE**: 
- Reemplaza `YOUR_INFURA_KEY` con tu API key de Infura
- Reemplaza la dirección del contrato `RiskOracle` después del deploy
- El script `scripts/deploy-contract.ts` actualiza la dirección automáticamente

### `.env`
**Ubicación**: Raíz del proyecto

Copia `.env.example` a `.env` y completa las variables:
- `INFURA_KEY`: Tu API key de Infura para Sepolia
- `PRIVATE_KEY`: Tu clave privada para desplegar contratos (sin prefijo 0x)
- `OPENAI_API_KEY`: (Opcional) Para futuras funcionalidades de AI

