import { NextRequest, NextResponse } from "next/server";
import { evaluateVaultRisk, type VaultRiskRequest } from "./evaluate";

export async function POST(request: NextRequest) {
  try {
    const body: VaultRiskRequest = await request.json();
    const result = await evaluateVaultRisk(body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message,
        score: null,
        reason: "Error al evaluar el vault",
      },
      { status: 500 }
    );
  }
}
