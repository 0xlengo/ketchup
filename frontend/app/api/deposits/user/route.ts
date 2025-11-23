import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

// Endpoint para obtener depósitos activos de un usuario específico
// En producción, esto debería leer de una base de datos
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress');

    if (!userAddress) {
      return NextResponse.json(
        { error: "userAddress es requerido" },
        { status: 400 }
      );
    }

    // TODO: Leer de base de datos
    // const deposits = await db.deposits.findMany({
    //   where: { 
    //     userAddress: userAddress.toLowerCase(),
    //     status: 'active' 
    //   }
    // });

    // Por ahora retornamos un array vacío
    // En producción, esto debería retornar los depósitos activos del usuario desde la DB
    const deposits: any[] = [];

    return NextResponse.json({
      deposits,
      count: deposits.length,
      userAddress,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error("Error obteniendo depósitos del usuario:", error);
    return NextResponse.json(
      { error: error.message || "Error al obtener depósitos", deposits: [] },
      { status: 500 }
    );
  }
}

