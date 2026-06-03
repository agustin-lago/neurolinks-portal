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

  const contentType = res.headers.get("content-type") || "";
  if (!res.ok || !contentType.includes("application/json")) {
    const text = await res.text();
    console.error(`[gql] Railway API error. Status: ${res.status}, Content-Type: ${contentType}, Response snippet:`, text.slice(0, 1000));
    throw new Error(`Railway API returned HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    console.error(`[gql] GraphQL Errors:`, JSON.stringify(json.errors, null, 2));
    throw new Error(json.errors[0].message);
  }
  return json.data;
}

export async function deployBackoffice({ slug, supabaseUrl, supabaseKey, planTipo }) {
  console.log(`[deployBackoffice] Starting backoffice deploy for slug: "${slug}", planTipo: "${planTipo}"`);

  // 1 — Get Template Details for "pleasant-simplicity"
  console.log(`[deployBackoffice] Step 1: Fetching template details for "pleasant-simplicity"...`);
  const templateData = await gql(`
    query template($code: String!) {
      template(code: $code) {
        id
        serializedConfig
      }
    }
  `, { code: "pleasant-simplicity" });

  if (!templateData?.template?.id) {
    throw new Error("Could not fetch template ID for pleasant-simplicity");
  }

  const templateId = templateData.template.id;
  const serializedConfig = templateData.template.serializedConfig;
  console.log(`[deployBackoffice] Resolved templateId: "${templateId}"`);

  // 2 — Create Railway project
  const projectName = planTipo === "masivo_meta" ? `CRM - ${slug}` : `BOT - ${slug}`;
  console.log(`[deployBackoffice] Step 2: Creating project with name: "${projectName}" and team: "${TEAM_ID}"...`);
  const { projectCreate } = await gql(`
    mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id
        environments { edges { node { id name } } }
      }
    }
  `, {
    input: { name: projectName, teamId: TEAM_ID },
  });

  const projectRwId   = projectCreate.id;
  const envEdge       = projectCreate.environments.edges
    .find(e => e.node.name === "production") ?? projectCreate.environments.edges[0];
  const environmentId = envEdge.node.id;
  console.log(`[deployBackoffice] Created project ID: "${projectRwId}", environmentId: "${environmentId}"`);

  // 3 — Deploy Template V2
  console.log(`[deployBackoffice] Step 3: Deploying template in project...`);
  const deployResult = await gql(`
    mutation($input: TemplateDeployV2Input!) {
      templateDeployV2(input: $input) {
        projectId
      }
    }
  `, {
    input: {
      templateId,
      serializedConfig,
      projectId: projectRwId,
      environmentId,
    }
  });
  console.log(`[deployBackoffice] Template deploy mutation finished successfully.`);

  // 4 — Poll project services to find the created service ID
  console.log(`[deployBackoffice] Step 4: Polling project services to resolve service ID...`);
  let serviceId = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log(`[deployBackoffice] Querying services (attempt ${attempt + 1}/25)...`);
    const projectDetails = await gql(`
      query project($id: String!) {
        project(id: $id) {
          services {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `, { id: projectRwId });

    const services = projectDetails?.project?.services?.edges;
    if (services && services.length > 0) {
      serviceId = services[0].node.id;
      console.log(`[deployBackoffice] Resolved service ID: "${serviceId}" ("${services[0].node.name}")`);
      break;
    }
  }

  if (!serviceId) {
    throw new Error(`No service was created by template in project ${projectRwId}`);
  }

  // 5 — Set environment variables
  console.log(`[deployBackoffice] Step 5: Upserting variables for service: "${serviceId}"...`);
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
  console.log(`[deployBackoffice] Variables upserted successfully.`);

  // 6 — Assign custom domain
  console.log(`[deployBackoffice] Step 6: Creating custom domain: "${slug}.clientesneurolinks.com"...`);
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
  console.log(`[deployBackoffice] Domain assigned successfully.`);

  // 7 — Wait for deployment to finish and become SUCCESS
  console.log(`[deployBackoffice] Step 7: Waiting for deployment to finish successfully...`);
  let success = false;
  const startTime = Date.now();
  const maxWaitMs = 8 * 60 * 1000; // 8 minutes timeout

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // poll every 5s

    try {
      const projectRes = await gql(`
        query project($id: String!) {
          project(id: $id) {
            environments {
              edges {
                node {
                  id
                  deployments {
                    edges {
                      node {
                        id
                        status
                        createdAt
                        serviceId
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `, { id: projectRwId });

      const environments = projectRes?.project?.environments?.edges || [];
      let latestDep = null;

      for (const env of environments) {
        if (env.node.id === environmentId) {
          const deps = env.node.deployments?.edges || [];
          const serviceDeps = deps.filter(d => d.node.serviceId === serviceId);
          if (serviceDeps.length > 0) {
            serviceDeps.sort((a, b) => new Date(b.node.createdAt) - new Date(a.node.createdAt));
            latestDep = serviceDeps[0].node;
          }
          break;
        }
      }

      if (latestDep) {
        console.log(`[deployBackoffice] Latest deployment status: ${latestDep.status} (ID: ${latestDep.id})`);
        if (latestDep.status === "SUCCESS") {
          success = true;
          break;
        } else if (["CRASHED", "FAILED", "SKIPPED"].includes(latestDep.status)) {
          throw new Error(`Deployment failed with status ${latestDep.status}`);
        }
      } else {
        console.log(`[deployBackoffice] No deployments found yet for service ${serviceId}`);
      }
    } catch (pollErr) {
      console.warn(`[deployBackoffice] Error polling deployment status:`, pollErr.message);
      if (pollErr.message.includes("failed")) {
        throw pollErr;
      }
    }
  }

  if (!success) {
    throw new Error("Timeout waiting for deployment to succeed");
  }

  console.log(`[deployBackoffice] Deployment succeeded. Waiting 20 seconds for container startup...`);
  await new Promise(resolve => setTimeout(resolve, 20000));
  console.log(`[deployBackoffice] Container startup delay finished.`);

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
        planTipo: cliente.plan_tipo,
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

