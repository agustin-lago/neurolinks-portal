const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const envPath = path.join(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");

const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\s]+)/)[1].trim();
const supabaseKey = envContent.match(/SUPABASE_KEY=([^\s]+)/)[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkActivation() {
  const { data: clients, error } = await supabase
    .from("clientes")
    .select("id, nombre, backoffice_activado, updated_at, plan, lineas_cantidad, deployment_url")
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error querying Supabase:", error);
    return;
  }

  console.log("\n=============================================");
  console.log("📊 ÚLTIMOS CLIENTES REGISTRADOS EN SUPABASE");
  console.log("=============================================");
  clients.forEach(c => {
    console.log(`ID:         ${c.id}`);
    console.log(`Nombre:     ${c.nombre || "Sin nombre"}`);
    console.log(`Activado:   ${c.backoffice_activado ? "✅ SÍ" : "❌ NO"}`);
    console.log(`Plan:       ${c.plan || "Sin plan"}`);
    console.log(`Líneas:     ${c.lineas_cantidad}`);
    console.log(`Dominio:    ${c.deployment_url || "Ninguno"}`);
    console.log(`Actualizado:${c.updated_at}`);
    console.log("---------------------------------------------");
  });
}

checkActivation();
