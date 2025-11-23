import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

interface Vault {
  id: string;
  name: string;
  address?: string;
  protocol: string;
  tvl?: number;
  apy?: number;
  asset?: string;
  description?: string;
}

// Función para extraer vaults de una URL de Morpho
async function extractVaultsFromMorpho(url: string): Promise<Vault[]> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Error al obtener la página: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const vaults: Vault[] = [];

    // Intentar extraer datos de diferentes formas posibles
    // Morpho puede tener los datos en scripts JSON embebidos
    const scripts = $('script[type="application/json"]');
    
    scripts.each((_, element) => {
      try {
        const jsonData = JSON.parse($(element).html() || '{}');
        // Buscar datos de vaults en el JSON
        if (jsonData.vaults || jsonData.markets || jsonData.pools) {
          const vaultData = jsonData.vaults || jsonData.markets || jsonData.pools;
          if (Array.isArray(vaultData)) {
            vaultData.forEach((v: any, index: number) => {
              vaults.push({
                id: v.id || v.address || `vault-${index}`,
                name: v.name || v.symbol || `Vault ${index + 1}`,
                address: v.address || v.id,
                protocol: "Morpho",
                tvl: v.tvl || v.totalAssets || v.totalValueLocked || undefined,
                apy: v.apy || v.apr || v.yield || undefined,
                asset: v.asset || v.underlyingAsset || v.token || undefined,
                description: v.description || undefined,
              });
            });
          }
        }
      } catch (e) {
        // Ignorar scripts que no son JSON válido
      }
    });

    // Si no encontramos datos en JSON, intentar extraer del HTML
    if (vaults.length === 0) {
      // Buscar elementos que puedan contener información de vaults
      $('[data-vault], [data-market], [data-pool], .vault-card, .market-card').each((_, element) => {
        const $el = $(element);
        const name = $el.find('[data-name], .name, h3, h4').first().text().trim();
        const apyText = $el.find('[data-apy], .apy, [data-yield]').first().text().trim();
        const tvlText = $el.find('[data-tvl], .tvl, [data-total-assets]').first().text().trim();
        
        if (name) {
          const apy = parseFloat(apyText.replace(/[^0-9.]/g, '')) || undefined;
          const tvl = parseFloat(tvlText.replace(/[^0-9.]/g, '')) || undefined;
          
          vaults.push({
            id: `vault-${vaults.length}`,
            name,
            protocol: "Morpho",
            tvl,
            apy,
          });
        }
      });
    }

    // Si aún no encontramos nada, intentar usar la API de Morpho directamente
    if (vaults.length === 0) {
      try {
        // Intentar usar la API de Morpho si está disponible
        const apiUrl = url.replace('/earn', '/api/vaults').replace('/ethereum/earn', '/api/v1/ethereum/vaults');
        const apiResponse = await fetch(apiUrl, {
          headers: {
            'Accept': 'application/json',
          },
          cache: 'no-store',
        });

        if (apiResponse.ok) {
          const apiData = await apiResponse.json();
          if (Array.isArray(apiData)) {
            apiData.forEach((v: any, index: number) => {
              vaults.push({
                id: v.id || v.address || `vault-${index}`,
                name: v.name || v.symbol || `Vault ${index + 1}`,
                address: v.address || v.id,
                protocol: "Morpho",
                tvl: v.tvl || v.totalAssets || v.totalValueLocked || undefined,
                apy: v.apy || v.apr || v.yield || undefined,
                asset: v.asset || v.underlyingAsset || v.token || undefined,
              });
            });
          } else if (apiData.vaults || apiData.markets) {
            const vaultData = apiData.vaults || apiData.markets;
            if (Array.isArray(vaultData)) {
              vaultData.forEach((v: any, index: number) => {
                vaults.push({
                  id: v.id || v.address || `vault-${index}`,
                  name: v.name || v.symbol || `Vault ${index + 1}`,
                  address: v.address || v.id,
                  protocol: "Morpho",
                  tvl: v.tvl || v.totalAssets || v.totalValueLocked || undefined,
                  apy: v.apy || v.apr || v.yield || undefined,
                  asset: v.asset || v.underlyingAsset || v.token || undefined,
                });
              });
            }
          }
        }
      } catch (e) {
        console.error("Error intentando API de Morpho:", e);
      }
    }

    // Si no encontramos vaults, lanzar error en lugar de usar datos de ejemplo
    if (vaults.length === 0) {
      throw new Error("No se pudieron extraer vaults de la URL proporcionada. Por favor, usa la API de Morpho directamente.");
    }

    return vaults;
  } catch (error: any) {
    console.error("Error extrayendo vaults:", error.message);
    throw error;
  }
}

// Función para analizar un vault individual
async function analyzeVault(vault: Vault) {
  try {
    // Importar la función de evaluación directamente
    const { evaluateVaultRisk } = await import('../vault-risk/evaluate');
    
    // Crear un request simulado para la función de evaluación
    const vaultRiskRequest = {
      vaultAddress: vault.address,
      vaultName: vault.name,
      protocol: vault.protocol,
      tvl: vault.tvl,
      apy: vault.apy,
      chainId: 1, // Ethereum por defecto
      whitelisted: vault.description?.includes("Whitelisted") || false,
    };

    // Llamar directamente a la función de evaluación
    const result = await evaluateVaultRisk(vaultRiskRequest);
    
    return {
      vault,
      risk: result,
    };
  } catch (error: any) {
    return {
      vault,
      risk: {
        error: error.message,
        score: null,
        reason: "Error al analizar el vault",
      },
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: "URL es requerida" },
        { status: 400 }
      );
    }

    // Validar que sea una URL de Morpho
    if (!url.includes('morpho.org')) {
      return NextResponse.json(
        { error: "La URL debe ser de Morpho (morpho.org)" },
        { status: 400 }
      );
    }

    // Extraer vaults de la URL
    const vaults = await extractVaultsFromMorpho(url);

    if (vaults.length === 0) {
      return NextResponse.json(
        { 
          error: "No se pudieron extraer vaults de la URL proporcionada",
          vaults: [],
          analyzed: []
        },
        { status: 404 }
      );
    }

    // Analizar cada vault
    const analyzed = await Promise.all(
      vaults.map(vault => analyzeVault(vault))
    );

    return NextResponse.json({
      url,
      vaultsFound: vaults.length,
      vaults,
      analyzed,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message,
        vaults: [],
        analyzed: [],
      },
      { status: 500 }
    );
  }
}

