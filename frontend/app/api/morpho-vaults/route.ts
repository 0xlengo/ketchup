import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

interface Vault {
  id: string;
  name: string;
  address?: string;
  protocol: string;
  tvl?: number;
  apy?: number;
  asset?: string;
  description?: string;
  whitelisted?: boolean;
  curatorAddress?: string;
  hasRedWarning?: boolean;
  hasYellowWarning?: boolean;
}

// Función para obtener vaults desde la API GraphQL de Morpho
async function fetchMorphoVaults(): Promise<Vault[]> {
  const vaults: Vault[] = [];

  try {
    // API GraphQL oficial de Morpho
    const graphqlEndpoint = "https://api.morpho.org/graphql";
    
    // Query GraphQL para obtener vaults V2 de Morpho con métricas básicas
    // Según la documentación: https://docs.morpho.org/tools/offchain/api/morpho-vaults/
    const query = `
      query GetVaultV2s {
        vaultV2s(first: 1000, where: { chainId_in: [1, 8453] }) {
          items {
            address
            symbol
            name
            whitelisted
            totalAssets
            totalAssetsUsd
            totalSupply
            avgApy
            avgNetApy
            asset {
              id
              address
              decimals
            }
            chain {
              id
              network
            }
            warnings {
              type
              level
            }
            curators {
              items {
                addresses {
                  address
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch(graphqlEndpoint, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    // Verificar errores de GraphQL
    if (result.errors) {
      console.error("GraphQL errors:", result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    // Procesar los vaults V2
    if (result.data && result.data.vaultV2s && result.data.vaultV2s.items && Array.isArray(result.data.vaultV2s.items)) {
      result.data.vaultV2s.items.forEach((vault: any) => {
        // Solo agregar vaults que tengan datos válidos
        if (vault.address && vault.name) {
          // Obtener TVL en USD si está disponible
          const tvl = vault.totalAssetsUsd 
            ? Number(vault.totalAssetsUsd) 
            : (vault.totalAssets ? Number(vault.totalAssets) : undefined);
          
          // Obtener APY promedio
          const apy = vault.avgApy 
            ? Number(vault.avgApy) * 100 
            : (vault.avgNetApy ? Number(vault.avgNetApy) * 100 : undefined);
          
          // Obtener curator address
          const curatorAddress = vault.curators?.items?.[0]?.addresses?.[0]?.address;
          
          // Verificar warnings
          const hasRedWarning = vault.warnings?.some((w: any) => w.level === "RED");
          const hasYellowWarning = vault.warnings?.some((w: any) => w.level === "YELLOW");
          
          vaults.push({
            id: vault.address,
            name: vault.name || vault.symbol || `Morpho Vault ${vault.asset?.id || ''}`,
            address: vault.address,
            protocol: "Morpho",
            tvl: tvl,
            apy: apy,
            asset: vault.asset?.id || vault.symbol,
            description: vault.whitelisted 
              ? `${vault.name} - ${vault.chain?.network || 'Ethereum'} - Whitelisted`
              : `${vault.name} - ${vault.chain?.network || 'Ethereum'}`,
            // Datos adicionales para el scoring
            whitelisted: vault.whitelisted,
            curatorAddress: curatorAddress,
            hasRedWarning: hasRedWarning,
            hasYellowWarning: hasYellowWarning,
          });
        }
      });
    } else {
      // Si la estructura es diferente, log para debugging
      console.error("Estructura de respuesta inesperada. Data:", JSON.stringify(result.data).substring(0, 500));
      throw new Error("La respuesta de la API no contiene vaultV2s en el formato esperado");
    }

    if (vaults.length === 0) {
      throw new Error("No se encontraron vaults en la respuesta de la API de Morpho");
    }

    return vaults;
  } catch (error: any) {
    console.error("Error obteniendo vaults de Morpho API:", error.message);
    
    // Re-lanzar el error en lugar de devolver datos de ejemplo
    throw new Error(`Error al obtener vaults de Morpho: ${error.message}`);
  }
}

export async function GET(request: NextRequest) {
  try {
    const vaults = await fetchMorphoVaults();
    
    return NextResponse.json({
      vaults,
      count: vaults.length,
      timestamp: Date.now(),
      source: "Morpho GraphQL API",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message,
        vaults: [],
        count: 0,
        source: "Morpho GraphQL API",
      },
      { status: 500 }
    );
  }
}
