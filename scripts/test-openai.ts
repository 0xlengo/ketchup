import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

async function testOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey === "your_openai_key_here") {
    console.error("❌ OPENAI_API_KEY no está configurada en .env");
    console.log("\nPor favor, agrega tu API key de OpenAI en el archivo .env:");
    console.log("OPENAI_API_KEY=sk-tu-clave-aqui");
    process.exit(1);
  }

  console.log("🔑 API Key encontrada (primeros 10 caracteres):", apiKey.substring(0, 10) + "...");
  console.log("🧪 Probando conexión con OpenAI...\n");

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: "Unknown error" } }));
      throw new Error(`Error ${response.status}: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    console.log("✅ Conexión exitosa con OpenAI!");
    console.log(`📊 Modelos disponibles: ${data.data.length}`);
    console.log("\nAlgunos modelos disponibles:");
    data.data.slice(0, 5).forEach((model: any) => {
      console.log(`  - ${model.id}`);
    });

    // Probar un chat simple
    console.log("\n🧪 Probando chat completion...");
    const chatResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: "Responde solo con 'OK' si puedes leer este mensaje."
          }
        ],
        max_tokens: 10,
      }),
    });

    if (!chatResponse.ok) {
      const errorData = await chatResponse.json().catch(() => ({ error: { message: "Unknown error" } }));
      throw new Error(`Error en chat: ${errorData.error?.message || chatResponse.statusText}`);
    }

    const chatData = await chatResponse.json();
    console.log("✅ Chat completion funcionando!");
    console.log(`💬 Respuesta: ${chatData.choices[0].message.content}`);

    console.log("\n🎉 ¡Todo funciona correctamente! Tu API key de OpenAI está configurada y funcionando.");

  } catch (error: any) {
    console.error("❌ Error al conectar con OpenAI:");
    console.error(error.message);
    
    if (error.message.includes("401") || error.message.includes("Unauthorized")) {
      console.error("\n⚠️  Tu API key parece ser inválida o ha expirado.");
      console.error("   Verifica que la clave en .env sea correcta.");
    } else if (error.message.includes("429")) {
      console.error("\n⚠️  Has excedido el límite de rate limit.");
      console.error("   Espera unos minutos e intenta de nuevo.");
    } else {
      console.error("\n⚠️  Verifica tu conexión a internet y que la API key sea válida.");
    }
    
    process.exit(1);
  }
}

testOpenAI();

