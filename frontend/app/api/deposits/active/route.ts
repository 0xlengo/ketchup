import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

// Endpoint para obtener depósitos activos para el monitoreo de Chainlink CRE
// En producción, esto debería leer de una base de datos
export async function GET(request: NextRequest) {
  try {
    // TODO: Leer de base de datos
    // const deposits = await db.deposits.findMany({
    //   where: { status: 'active' }
    // });

    // Por ahora retornamos un array vacío
    // En producción, esto debería retornar los depósitos activos desde la DB
    const deposits: any[] = [];

    return NextResponse.json({
      deposits,
      count: deposits.length,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error("Error obteniendo depósitos activos:", error);
    return NextResponse.json(
      { error: error.message || "Error al obtener depósitos activos", deposits: [] },
      { status: 500 }
    );
  }
}

