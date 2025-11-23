# Visualización de Vaults DeFi - Semáforo de Salud

Este documento explica cómo usar el sistema de semáforos visuales para evaluar la salud de vaults DeFi, especialmente de Morpho.

## 🎯 Características

### 1. **Componente Semáforo (TrafficLight)**
Un componente visual que muestra el estado de salud de un vault usando un semáforo tradicional:
- 🟢 **Verde (70-100)**: Vault seguro, bajo riesgo
- 🟡 **Amarillo (50-69)**: Vault moderado, riesgo medio  
- 🔴 **Rojo (0-49)**: Vault riesgoso, alto riesgo

### 2. **Agregador de Vaults**
Página web completa (`/vaults`) que muestra todos los vaults de Morpho con sus semáforos de salud en tiempo real.

### 3. **Widget Embebible**
Componente reutilizable que se puede integrar en cualquier página o extensión de Chrome.

## 📍 Rutas Disponibles

- **`/`**: Página principal con evaluación general
- **`/vaults`**: Agregador de vaults con semáforos visuales
- **`/api/vault-risk`**: API endpoint para evaluar vaults específicos

## 🚀 Uso del Agregador de Vaults

1. Navega a `http://localhost:3000/vaults` (o tu dominio en producción)
2. Verás una lista de vaults de Morpho con sus semáforos
3. Los vaults se evalúan automáticamente al cargar la página
4. Puedes actualizar manualmente o activar auto-actualización

## 🔧 Uso del Widget Embebible

### En una página React/Next.js:

```tsx
import VaultRiskWidget from "@/app/components/VaultRiskWidget";

// Versión completa
<VaultRiskWidget
  vaultName="Morpho USDC Vault"
  vaultAddress="0x..."
  protocol="Morpho"
  tvl={50000000}
  apy={8.5}
/>

// Versión compacta (para extensiones)
<VaultRiskWidget
  vaultName="Morpho USDC Vault"
  compact={true}
/>
```

### Usando la API directamente:

```typescript
const response = await fetch("/api/vault-risk", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    vaultAddress: "0x...",
    vaultName: "Morpho USDC Vault",
    protocol: "Morpho",
    tvl: 50000000,
    apy: 8.5,
  }),
});

const { score, reason, factors } = await response.json();
```

## 🌐 Integración con Extensión de Chrome

### Estructura básica de extensión:

```
chrome-extension/
  manifest.json
  content-script.js
  popup.html
  popup.js
  styles.css
```

### Ejemplo de `content-script.js`:

```javascript
// Inyectar widget en páginas de Morpho
function injectRiskWidget(vaultData) {
  const widget = document.createElement('div');
  widget.id = 'defi-risk-widget';
  widget.innerHTML = `
    <div style="position: fixed; top: 20px; right: 20px; z-index: 10000;
                background: white; padding: 15px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <div id="risk-score">Cargando...</div>
    </div>
  `;
  document.body.appendChild(widget);

  // Llamar a la API
  fetch('https://tu-dominio.com/api/vault-risk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vaultData)
  })
  .then(res => res.json())
  .then(data => {
    const scoreEl = document.getElementById('risk-score');
    const color = data.score >= 70 ? 'green' : data.score >= 50 ? 'yellow' : 'red';
    scoreEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 20px; height: 20px; border-radius: 50%; background: ${color};"></div>
        <span>Score: ${data.score}/100</span>
      </div>
      <p style="font-size: 12px; margin-top: 5px;">${data.reason}</p>
    `;
  });
}

// Detectar vaults en la página de Morpho
if (window.location.hostname.includes('morpho.org')) {
  // Extraer datos del vault de la página
  const vaultData = extractVaultData(); // Implementar según la estructura de Morpho
  injectRiskWidget(vaultData);
}
```

### Ejemplo de `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "DeFi Risk Oracle",
  "version": "1.0.0",
  "description": "Muestra semáforos de salud para vaults DeFi",
  "permissions": [
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "https://morpho.org/*",
    "https://app.morpho.org/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://morpho.org/*", "https://app.morpho.org/*"],
      "js": ["content-script.js"],
      "css": ["styles.css"]
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icon.png"
  }
}
```

## 📊 Factores de Evaluación

El sistema evalúa vaults basándose en:

1. **TVL del Vault** (0-30 puntos)
   - > $100M: 30 puntos
   - > $10M: 20 puntos
   - > $1M: 10 puntos
   - < $1M: 5 puntos

2. **APY** (0-20 puntos)
   - APY > 50%: -15 puntos (riesgoso)
   - APY 20-50%: 10 puntos
   - APY 5-20%: 15 puntos
   - APY < 5%: 5 puntos

3. **Protocolo** (0-20 puntos)
   - Morpho: 20 puntos
   - Otros protocolos conocidos: 10 puntos

4. **Precio de Mercado** (0-15 puntos)
   - Disponibilidad de datos: 10 puntos

5. **TVL del Ecosistema** (0-15 puntos)
   - > $10B: 15 puntos
   - > $1B: 10 puntos

## 🔄 Integración con API de Morpho

Para obtener la lista real de vaults de Morpho, puedes usar:

1. **API de The Graph** (si Morpho tiene subgraph)
2. **API de Moralis** o **Alchemy** para datos on-chain
3. **API pública de Morpho** (si está disponible)

Ejemplo de integración:

```typescript
// En frontend/app/vaults/page.tsx
async function fetchMorphoVaults() {
  // Opción 1: Usar The Graph
  const query = `
    {
      vaults {
        id
        name
        totalAssets
        apy
      }
    }
  `;
  
  // Opción 2: Leer directamente del contrato
  // Usar viem o ethers para leer datos on-chain
  
  // Por ahora, usar datos de ejemplo
  return MORPHO_VAULTS;
}
```

## 🎨 Personalización

### Colores del Semáforo

Puedes personalizar los colores editando `TrafficLight.tsx`:

```tsx
const status = getStatus();
// Cambiar colores según tus preferencias
```

### Umbrales de Score

Ajusta los umbrales en `TrafficLight.tsx`:

```tsx
const getStatus = () => {
  if (score >= 70) return { color: "green", ... };  // Cambiar umbral
  if (score >= 50) return { color: "yellow", ... };
  return { color: "red", ... };
};
```

## 🚧 Próximos Pasos

1. **Integrar API real de Morpho**: Conectar con The Graph o contratos on-chain
2. **Extensión de Chrome completa**: Desarrollar extensión funcional
3. **Notificaciones**: Alertas cuando el score cambia significativamente
4. **Historial**: Guardar historial de evaluaciones
5. **Comparación**: Comparar múltiples vaults lado a lado
6. **Filtros**: Filtrar vaults por protocolo, TVL, APY, etc.

## 📝 Notas

- Los datos se actualizan en tiempo real desde Chainlink Data Feeds y DeFiLlama
- La evaluación usa OpenAI GPT-4o-mini si está configurado, sino usa cálculo basado en reglas
- El widget es completamente responsive y se adapta a diferentes tamaños de pantalla

