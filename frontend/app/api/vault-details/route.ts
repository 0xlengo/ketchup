import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

// Función para obtener detalles completos de un vault desde la API de Morpho
async function fetchVaultDetails(vaultAddress: string, chainId: number = 1) {
  try {
    const graphqlEndpoint = "https://api.morpho.org/graphql";
    
    // Query para obtener detalles completos del vault incluyendo:
    // - TVL actual y histórico
    // - Número de depositantes
    // - Curator information
    // - APY histórico
    // - Estado del vault
    const query = `
      query GetVaultDetails($address: String!, $chainId: Int!) {
        vaultV2(address: $address, chainId: $chainId) {
          address
          symbol
          name
          whitelisted
          asset {
            id
            address
            decimals
          }
          chain {
            id
            network
          }
          state {
            totalAssets
            totalSupply
            apy
            timestamp
          }
          curator {
            id
            address
          }
        }
        vaultV2Snapshots(
          first: 24
          where: { vaultV2: { address: $address, chainId: $chainId } }
          orderBy: timestamp
          orderDirection: desc
        ) {
          items {
            totalAssets
            totalSupply
            apy
            timestamp
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
      body: JSON.stringify({
        query,
        variables: {
          address: vaultAddress,
          chainId: chainId,
        },
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      console.error("GraphQL errors:", result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
  } catch (error: any) {
    console.error("Error obteniendo detalles del vault:", error.message);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vaultAddress, chainId } = body;

    if (!vaultAddress) {
      return NextResponse.json(
        { error: "vaultAddress es requerido" },
        { status: 400 }
      );
    }

    const details = await fetchVaultDetails(vaultAddress, chainId || 1);
    
    if (!details) {
      return NextResponse.json(
        { error: "No se pudieron obtener los detalles del vault" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      details,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message,
        details: null,
      },
      { status: 500 }
    );
  }
}

