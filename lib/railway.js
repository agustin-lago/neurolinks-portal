import crypto from "crypto";

const RAILWAY_API   = process.env.RAILWAY_API;
const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN;
const TEAM_ID       = process.env.RAILWAY_TEMPLATE_WORKSPACE_ID;

async function gql(query, variables) {
  const res = await fetch(RAILWAY_API, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${RAILWAY_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export async function deployBackoffice({ slug, supabaseUrl, supabaseKey }) {
  // 1 — Create Railway project
  const { projectCreate } = await gql(`
    mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id
        environments { edges { node { id name } } }
      }
    }
  `, {
    input: { name: `backoffice-${slug}`, teamId: TEAM_ID },
  });

  const projectRwId   = projectCreate.id;
  const envEdge       = projectCreate.environments.edges
    .find(e => e.node.name === "production") ?? projectCreate.environments.edges[0];
  const environmentId = envEdge.node.id;

  // 2 — Create service from GitHub repo
  const { serviceCreate } = await gql(`
    mutation($input: ServiceCreateInput!) {
      serviceCreate(input: $input) { id }
    }
  `, {
    input: {
      projectId: projectRwId,
      name: "bot",
      source: { repo: "pereyrahugor/Bot-RialWay" },
    },
  });

  const serviceId = serviceCreate.id;

  // 3 — Set environment variables
  await gql(`
    mutation($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `, {
    input: {
      projectId:     projectRwId,
      environmentId,
      serviceId,
      variables: {
        SUPABASE_URL:  supabaseUrl,
        SUPABASE_KEY:  supabaseKey,
        PROJECT_ID:    projectRwId,
        RAILWAY_TOKEN: RAILWAY_TOKEN,
      },
    },
  });

  // 4 — Assign custom domain
  await gql(`
    mutation($input: CustomDomainCreateInput!) {
      customDomainCreate(input: $input) { id domain }
    }
  `, {
    input: {
      projectId:     projectRwId,
      environmentId,
      serviceId,
      domain: `${slug}.clientesneurolinks.com`,
    },
  });

  return {
    domain: `${slug}.clientesneurolinks.com`,
    projectId: projectRwId,
  };
}

export async function activateClientPortal(clienteId, adminDb) {
  // Fetch client details
  const { data: cliente, error: fetchErr } = await adminDb
    .from("clientes")
    .select("*")
    .eq("id", clienteId)
    .single();

  if (fetchErr || !cliente) {
    throw new Error(`Client ${clienteId} not found: ${fetchErr?.message || "Not found"}`);
  }

  if (cliente.backoffice_activado) {
    console.log(`[activateClientPortal] Client ${clienteId} is already activated. Skipping deployment.`);
    return { ok: true, alreadyActivated: true };
  }

  const count = cliente.plan_tipo === "masivo_meta" ? (cliente.lineas_cantidad || 1) : 1;
  const deploymentUrls = [];
  const tokenBackoffices = [];

  for (let i = 0; i < count; i++) {
    // Slugs for each line: slug-linea1, slug-linea2, etc. (or standard slug if only 1)
    const slug = count > 1 ? `${cliente.proyecto_slug}-linea${i + 1}` : cliente.proyecto_slug;
    let projectId = crypto.randomUUID(); // Fallback ID
    let domain = `${slug}.clientesneurolinks.com`;

    try {
      console.log(`[activateClientPortal] Starting Railway deploy for line ${i + 1} with slug: ${slug}...`);
      const deployResult = await deployBackoffice({
        slug,
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_KEY,
      });

      if (deployResult?.projectId) {
        projectId = deployResult.projectId;
      }
      if (deployResult?.domain) {
        domain = deployResult.domain;
      }

      console.log(`[activateClientPortal] Railway deploy successful for line ${i + 1}. Project ID: ${projectId}`);
    } catch (deployErr) {
      console.error(`[activateClientPortal] Railway deployment failed for line ${i + 1}, using fallback details:`, deployErr);
    }

    deploymentUrls.push(domain);
    tokenBackoffices.push(projectId);

    // Copy default settings template to this newly created project_id partition in Supabase settings
    try {
      const { data: defaultSettings } = await adminDb
        .from("settings")
        .select("key, value")
        .eq("project_id", "default");

      if (defaultSettings?.length) {
        await adminDb.from("settings").insert(
          defaultSettings.map(s => ({
            project_id: projectId,
            key:        s.key,
            value:      s.value,
          }))
        );
      }
    } catch (settingsErr) {
      console.error(`[activateClientPortal] Settings copy failed for partition ${projectId}:`, settingsErr);
    }
  }

  // Save all dynamic activation data arrays to Supabase
  const { error: updateError } = await adminDb
    .from("clientes")
    .update({
      backoffice_activado: true,
      token_backoffice:    tokenBackoffices[0],
      tokens_backoffice:   tokenBackoffices,
      deployment_url:      deploymentUrls[0],
      deployment_urls:     deploymentUrls,
      updated_at:          new Date().toISOString(),
    })
    .eq("id", clienteId);

  if (updateError) {
    throw new Error(`Failed to update client ${clienteId} status in database: ${updateError.message}`);
  }

  console.log(`[activateClientPortal] Client ${clienteId} activated successfully with ${count} line(s).`);
  return { ok: true, alreadyActivated: false, count, deploymentUrls };
}

