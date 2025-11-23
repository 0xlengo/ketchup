export async function POST() {
  return Response.json({
    score: Math.floor(Math.random() * 100),
    reason: "Mock response: real CRE integration coming soon"
  });
}

