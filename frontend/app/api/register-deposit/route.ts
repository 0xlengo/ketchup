import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

// Registrar depósito para monitoreo automático
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vaultAddress, userAddress, amount, riskScore, chainId } = body;

    if (!vaultAddress || !userAddress || !amount) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos" },
        { status: 400 }
      );
    }

    // Aquí guardarías en una base de datos para monitoreo
    // Por ahora solo retornamos éxito
    // En producción, esto debería guardarse en una DB (PostgreSQL, MongoDB, etc.)
    
    console.log("Depósito registrado para monitoreo:", {
      vaultAddress,
      userAddress,
      amount,
      riskScore,
      chainId,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      message: "Depósito registrado para monitoreo automático",
      monitoringId: `monitor_${Date.now()}_${userAddress.slice(0, 8)}`,
    });
  } catch (error: any) {
    console.error("Error registrando depósito:", error);
    return NextResponse.json(
      { error: error.message || "Error al registrar depósito" },
      { status: 500 }
    );
  }
}

