import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

// Registrar depósito para monitoreo automático
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vaultAddress, userAddress, amount, riskScore, chainId, txHash } = body;

    if (!vaultAddress || !userAddress || !amount) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos" },
        { status: 400 }
      );
    }

    // En producción, esto debería guardarse en una DB (PostgreSQL, MongoDB, etc.)
    // Por ahora guardamos en un archivo JSON o en memoria para el demo
    // El workflow de Chainlink CRE leerá estos datos para monitoreo
    
    const depositRecord = {
      id: `deposit_${Date.now()}_${userAddress.slice(0, 8)}`,
      vaultAddress,
      userAddress,
      amount: parseFloat(amount),
      riskScore: riskScore || 50,
      chainId: chainId || 1,
      txHash: txHash || null,
      timestamp: Date.now(),
      status: 'active', // active, withdrawn, closed
      initialRiskScore: riskScore || 50,
    };

    console.log("Depósito registrado para monitoreo:", depositRecord);

    // TODO: Guardar en base de datos
    // await db.deposits.create(depositRecord);

    return NextResponse.json({
      success: true,
      message: "Depósito registrado para monitoreo automático",
      monitoringId: depositRecord.id,
      deposit: depositRecord,
    });
  } catch (error: any) {
    console.error("Error registrando depósito:", error);
    return NextResponse.json(
      { error: error.message || "Error al registrar depósito" },
      { status: 500 }
    );
  }
}

