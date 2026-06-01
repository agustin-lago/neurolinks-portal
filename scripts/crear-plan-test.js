const fs = require("fs");
const path = require("path");

// Load .env.local file
const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("No se encontró el archivo .env.local. Asegúrate de estar en la raíz del proyecto.");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf-8");
const mpTokenMatch = envContent.match(/MP_ACCESS_TOKEN=(TEST-[^\s]+)/);

if (!mpTokenMatch || !mpTokenMatch[1]) {
  console.error("No se encontró una variable MP_ACCESS_TOKEN que empiece con TEST- en tu .env.local.");
  process.exit(1);
}

const accessToken = mpTokenMatch[1].trim();
console.log(`Usando Access Token de Pruebas: ${accessToken}`);

async function createTestPlan() {
  try {
    const response = await fetch("https://api.mercadopago.com/preapproval_plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        reason: "Suscripción Test - Neurolinks",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: 100, // Monto mínimo superado (debe ser mayor a $15.00)
          currency_id: "ARS",
        },
        back_url: "https://www.google.com", // URL de retorno temporal
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || JSON.stringify(data));
    }

    console.log("\n==================================================");
    console.log("🎉 ¡PLAN DE SUSCRIPCIÓN DE PRUEBA CREADO CON ÉXITO!");
    console.log("==================================================");
    console.log(`ID del Plan:   ${data.id}`);
    console.log(`Nombre:        ${data.reason}`);
    console.log(`Monto:         $${data.auto_recurring.transaction_amount} ARS/mes`);
    console.log(`Checkout Link: ${data.init_point}`);
    console.log("==================================================");
    console.log("\n👉 Puedes usar este ID del Plan en tu variable de preapproval_plan_id.");
  } catch (error) {
    console.error("❌ Error al crear el plan de suscripción:", error.message);
  }
}

createTestPlan();
