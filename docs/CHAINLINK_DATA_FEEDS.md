# Chainlink Data Feeds Integration

## 📊 Uso de Chainlink Data Feeds

Este proyecto utiliza **Chainlink Data Feeds** para obtener precios de manera descentralizada y confiable directamente desde la blockchain.

## 🔗 Direcciones de Data Feeds

### Sepolia (Testnet)
- **ETH/USD**: `0x694AA1769357215DE4FAC081bf1f309aDC325306`

### Mainnet
- **ETH/USD**: `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`

## 📝 Configuración

El Data Feed se configura en `workflow/config.json`:

```json
{
  "evm": {
    "dataFeeds": {
      "ethUsd": "0x694AA1769357215DE4FAC081bf1f309aDC325306"
    }
  }
}
```

Si no se especifica, el workflow usa la dirección por defecto según la red.

## 🔧 Cómo Funciona

1. **Lectura On-Chain**: El workflow CRE lee directamente del contrato AggregatorV3Interface de Chainlink
2. **Función `latestRoundData()`**: Obtiene el precio más reciente, timestamp de actualización, y metadata
3. **Función `decimals()`**: Obtiene la precisión del precio (típicamente 8 para pares USD)
4. **Conversión**: El precio se convierte de la representación on-chain a un número legible

## 💡 Ventajas de Usar Chainlink Data Feeds

- ✅ **Descentralizado**: No depende de una única API centralizada
- ✅ **Confiable**: Agregado por múltiples nodos de Chainlink
- ✅ **On-Chain**: Los datos están disponibles directamente en la blockchain
- ✅ **Actualizado**: Los precios se actualizan frecuentemente
- ✅ **Consistente**: Mismo ecosistema que Chainlink CRE

## 📚 Referencias

- [Chainlink Data Feeds Docs](https://docs.chain.link/data-feeds)
- [AggregatorV3Interface](https://docs.chain.link/data-feeds/api-reference/aggregatorv3interface)
- [Data Feeds Addresses](https://docs.chain.link/data-feeds/price-feeds/addresses)

