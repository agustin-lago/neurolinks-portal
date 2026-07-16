import crypto from "crypto";
import { createCnameRecord, createDnsRecords } from "./dns.js";

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

export async function deployBackoffice({ slug, planTipo, proyectoNombre, existingProjectId, onProjectCreated }) {
  console.log(`[deployBackoffice] Starting backoffice deploy for slug: "${slug}", planTipo: "${planTipo}", existingProjectId: "${existingProjectId || "none"}"`);

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

  // 2 — Resolve or Create Railway project
  const defaultName = planTipo === "masivo_meta" ? `CRM - ${slug}` : `BOT - ${slug}`;
  const projectName = proyectoNombre || defaultName;
  let projectRwId = null;
  let environmentId = null;

  // 2.1 — Try to check if existingProjectId is valid on Railway
  if (existingProjectId) {
    try {
      console.log(`[deployBackoffice] Verifying if existing project ID "${existingProjectId}" is valid on Railway...`);
      const projectRes = await gql(`
        query project($id: String!) {
          project(id: $id) {
            id
            environments {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        }
      `, { id: existingProjectId });

      if (projectRes?.project?.id) {
        projectRwId = projectRes.project.id;
        const envEdge = projectRes.project.environments?.edges?.find(e => e.node.name === "production") 
          ?? projectRes.project.environments?.edges?.[0];
        environmentId = envEdge?.node?.id;
        console.log(`[deployBackoffice] Verified existing project ID: "${projectRwId}". Reusing...`);
      }
    } catch (err) {
      console.warn(`[deployBackoffice] Project ID "${existingProjectId}" not found on Railway:`, err.message);
    }
  }

  // 2.1.5 — If not resolved by ID, try to find the project by name in the workspace to prevent duplicate creations on timeouts
  if (!projectRwId) {
    try {
      console.log(`[deployBackoffice] Searching for existing project with name "${projectName}" in workspace to prevent duplicate creations...`);
      const listRes = await gql(`
        query projects($workspaceId: String) {
          projects(workspaceId: $workspaceId) {
            edges {
              node {
                id
                name
                environments {
                  edges {
                    node {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        }
      `, { workspaceId: TEAM_ID });

      const projects = listRes?.projects?.edges || [];
      const matched = projects.find(p => p.node.name === projectName);
      if (matched) {
        projectRwId = matched.node.id;
        const envEdge = matched.node.environments?.edges?.find(e => e.node.name === "production") 
          ?? matched.node.environments?.edges?.[0];
        environmentId = envEdge?.node?.id;
        console.log(`[deployBackoffice] Found existing project by name: "${projectName}" (ID: "${projectRwId}"). Reusing...`);
      }
    } catch (searchErr) {
      console.warn(`[deployBackoffice] Failed to search existing projects by name:`, searchErr.message);
    }
  }

  // 2.2 — If still not resolved, create a new project
  if (!projectRwId) {
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

    projectRwId   = projectCreate.id;
    const envEdge       = projectCreate.environments.edges
      .find(e => e.node.name === "production") ?? projectCreate.environments.edges[0];
    environmentId = envEdge.node.id;
    console.log(`[deployBackoffice] Created new project ID: "${projectRwId}", environmentId: "${environmentId}"`);
  }

  if (onProjectCreated && projectRwId) {
    try {
      await onProjectCreated(projectRwId);
    } catch (cbErr) {
      console.error(`[deployBackoffice] Error en callback onProjectCreated:`, cbErr.message);
    }
  }

  // 3 — Check if template services are already deployed in this project
  console.log(`[deployBackoffice] Checking if template services are already deployed...`);
  let serviceId = null;
  try {
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

    const services = projectDetails?.project?.services?.edges || [];
    if (services.length > 0) {
      serviceId = services[0].node.id;
      console.log(`[deployBackoffice] Services already present. Reusing service ID: "${serviceId}" ("${services[0].node.name}")`);
    }
  } catch (srvErr) {
    console.warn(`[deployBackoffice] Failed to query existing services:`, srvErr.message);
  }

  // If services don't exist yet, deploy the template and poll
  if (!serviceId) {
    console.log(`[deployBackoffice] Step 3: Deploying template in project...`);
    try {
      await gql(`
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
    } catch (deployErr) {
      deployErr.projectId = projectRwId;
      throw deployErr;
    }

    // 4 — Poll project services to find the created service ID
    console.log(`[deployBackoffice] Step 4: Polling project services to resolve service ID...`);
    try {
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

        const servicesList = projectDetails?.project?.services?.edges;
        if (servicesList && servicesList.length > 0) {
          serviceId = servicesList[0].node.id;
          console.log(`[deployBackoffice] Resolved service ID: "${serviceId}" ("${servicesList[0].node.name}")`);
          break;
        }
      }
    } catch (pollSrvErr) {
      pollSrvErr.projectId = projectRwId;
      throw pollSrvErr;
    }
  }

  if (!serviceId) {
    const srvErr = new Error(`No service was created by template in project ${projectRwId}`);
    srvErr.projectId = projectRwId;
    throw srvErr;
  }

  // 5 — Wait for deployment to finish and become SUCCESS
  console.log(`[deployBackoffice] Step 5: Waiting for deployment to finish successfully...`);
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
        pollErr.projectId = projectRwId;
        throw pollErr;
      }
    }
  }

  if (!success) {
    const toutErr = new Error("Timeout waiting for deployment to succeed");
    toutErr.projectId = projectRwId;
    throw toutErr;
  }

  // 6 — Assign custom domain (Moved after successful deployment)
  console.log(`[deployBackoffice] Step 6: Creating custom domain: "${slug}.clientesneurolinks.com"...`);
  let domainCreated = false;
  try {
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
    domainCreated = true;
  } catch (domErr) {
    if (domErr.message.includes("already") || domErr.message.includes("exists") || domErr.message.includes("taken")) {
      console.log(`[deployBackoffice] Domain is already assigned or taken. Proceeding...`);
      domainCreated = true;
    } else {
      console.warn(`[deployBackoffice] Domain assignment warning:`, domErr.message);
    }
  }

  let railwayPublicUrl = null;

  // 6.1 — Query CNAME validation requiredValue & TXT token and automate DNS registration
  try {
    console.log(`[deployBackoffice] Step 6.1: Querying domains (service and custom)...`);
    const domRes = await gql(`
      query domains($projectId: String!, $environmentId: String!, $serviceId: String!) {
        domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
          serviceDomains {
            domain
          }
          customDomains {
            domain
            status {
              verificationDnsHost
              verificationToken
              dnsRecords {
                recordType
                fqdn
                requiredValue
              }
            }
          }
        }
      }
    `, {
      projectId: projectRwId,
      environmentId,
      serviceId
    });

    const serviceDomains = domRes?.domains?.serviceDomains || [];
    if (serviceDomains.length > 0) {
      railwayPublicUrl = serviceDomains[0].domain;
      console.log(`[deployBackoffice] Found service domain (public URL): "${railwayPublicUrl}"`);
    }

    if (domainCreated) {
      const customDomains = domRes?.domains?.customDomains || [];
      const targetDomain = `${slug}.clientesneurolinks.com`;
      const domainInfo = customDomains.find(d => d.domain === targetDomain);

      if (domainInfo) {
        const dnsRecords = domainInfo.status?.dnsRecords || [];
        const baseDomain = process.env.HOSTINGER_DOMAIN || "clientesneurolinks.com";
        const recordsToRegister = [];

        // Add CNAME records
        for (const record of dnsRecords) {
          if (record.recordType === "DNS_RECORD_TYPE_CNAME" && record.requiredValue && record.fqdn) {
            const name = record.fqdn.replace(new RegExp(`\\.?${baseDomain}\\.?$`), "").replace(/\.$/, "");
            recordsToRegister.push({
              name,
              type: "CNAME",
              content: record.requiredValue
            });
            if (!railwayPublicUrl) {
              railwayPublicUrl = record.requiredValue; // Fallback to validation CNAME if no service domain
            }
          }
        }

        // Add TXT verification records
        const verificationHost = domainInfo.status?.verificationDnsHost;
        const verificationToken = domainInfo.status?.verificationToken;
        if (verificationHost && verificationToken) {
          const name = verificationHost.replace(new RegExp(`\\.?${baseDomain}\\.?$`), "").replace(/\.$/, "");
          recordsToRegister.push({
            name,
            type: "TXT",
            content: verificationToken
          });
        }

        if (recordsToRegister.length > 0) {
          console.log(`[deployBackoffice] Mapped DNS records to register in Hostinger:`, JSON.stringify(recordsToRegister));
          createDnsRecords(recordsToRegister)
            .then(success => {
              if (success) {
                console.log(`[deployBackoffice] Automated DNS creation completed successfully for all records.`);
              } else {
                console.warn(`[deployBackoffice] Automated DNS creation did not succeed (check logs above).`);
              }
            })
            .catch(dnsErr => {
              console.error(`[deployBackoffice] Unhandled error during automated DNS creation:`, dnsErr);
            });
        } else {
          console.warn(`[deployBackoffice] No valid CNAME or TXT verification records found in domain status.`);
        }
      } else {
        console.warn(`[deployBackoffice] Custom domain "${targetDomain}" not found in project custom domains response.`);
      }
    }
  } catch (queryErr) {
    console.warn(`[deployBackoffice] Failed to query domains or register DNS:`, queryErr.message);
  }

  // Expose final captured URL
  console.log(`[deployBackoffice] Final captured Railway public URL: "${railwayPublicUrl}"`);

  console.log(`[deployBackoffice] Deployment succeeded. Waiting 20 seconds for container startup...`);
  await new Promise(resolve => setTimeout(resolve, 20000));
  console.log(`[deployBackoffice] Container startup delay finished.`);

  return {
    domain: `${slug}.clientesneurolinks.com`,
    projectId: projectRwId,
    railwayPublicUrl: railwayPublicUrl || null,
  };
}

export async function activateClientPortal(clienteId, adminDb) {
  // 1. Try to acquire the deployment lock atomically
  const { data: lockAcquired, error: lockErr } = await adminDb
    .from("suscripciones_proyectos")
    .update({ deploy_in_progress: true })
    .eq("id", clienteId)
    .eq("deploy_in_progress", false) // Only update if not already deploying
    .select("id, plan_tipo, lineas_cantidad, deployment_urls, tokens_backoffice, backoffice_activado, proyecto_slug, proyecto_nombre, plan, abono, cliente_id, clientes ( auth_user_id, vendedor_id )");

  if (lockErr) {
    console.error(`[activateClientPortal] Error acquiring lock for client ${clienteId}:`, lockErr.message);
    throw lockErr;
  }

  if (!lockAcquired || lockAcquired.length === 0) {
    console.log(`[activateClientPortal] Deployment already in progress for client ${clienteId}. Aborting duplicate call.`);
    return { ok: true, alreadyActivated: false, ignored: true };
  }

  const cliente = lockAcquired[0];

  const count = cliente.plan_tipo === "masivo_meta" ? (cliente.lineas_cantidad || 1) : 1;
  const tokenBackoffices = cliente.tokens_backoffice || [];
  const deployedCount = tokenBackoffices.filter(id => id && id !== 'none').length;

  if (cliente.backoffice_activado && deployedCount === count) {
    console.log(`[activateClientPortal] Client ${clienteId} is already fully activated with ${deployedCount}/${count} lines. Releasing lock and skipping deployment.`);
    await adminDb.from("suscripciones_proyectos").update({ deploy_in_progress: false }).eq("id", clienteId);
    return { ok: true, alreadyActivated: true };
  }

  let allSucceeded = true;
  let firstDeployError = null;

  try {
    const deploymentUrls = cliente.deployment_urls || [];
    const railwayPublicUrls = [];

    for (let i = 0; i < count; i++) {
      // Slugs for each line: slug-linea1, slug-linea2, etc. (or standard slug if only 1)
      const slug = count > 1 ? `${cliente.proyecto_slug}-linea${i + 1}` : cliente.proyecto_slug;
      
      // Check if we already have an associated project ID for this line index
      const existingProjectId = tokenBackoffices[i];
      let projectId = existingProjectId || null;
      let domain = deploymentUrls[i] || `${slug}.clientesneurolinks.com`;
      let railwayPublicUrl = null;

      // Skip deployment if it is already deployed and cliente.backoffice_activado is true (healthy running project)
      if (existingProjectId && cliente.backoffice_activado) {
        console.log(`[activateClientPortal] Line ${i + 1} already activated with ID: ${existingProjectId}. Skipping deploy.`);
        let existingPublicUrl = null;
        if (cliente.railway_public_url) {
          try {
            const parsed = JSON.parse(cliente.railway_public_url);
            existingPublicUrl = Array.isArray(parsed) ? parsed[i] : parsed;
          } catch (_) {
            existingPublicUrl = i === 0 ? cliente.railway_public_url : null;
          }
        }
        railwayPublicUrls[i] = existingPublicUrl;

        // OBSOLETE: We no longer sync with proyectos_railway.
        // It relies on tokens_backoffice array.
        continue;
      }

      try {
        console.log(`[activateClientPortal] Starting Railway deploy for line ${i + 1}/${count} with slug: ${slug}, existing ID: ${existingProjectId || "none"}...`);
        const deployResult = await deployBackoffice({
          slug,
          planTipo: cliente.plan_tipo,
          proyectoNombre: cliente.proyecto_nombre,
          existingProjectId,
          onProjectCreated: async (newProjectId) => {
            console.log(`[activateClientPortal] Callback onProjectCreated disparado para ID: ${newProjectId}. Vinculando instantáneamente...`);
            tokenBackoffices[i] = newProjectId;
            
            try {
              await adminDb
                .from("suscripciones_proyectos")
                .update({
                  token_backoffice: tokenBackoffices[0],
                  tokens_backoffice: tokenBackoffices,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", clienteId);
              // OBSOLETE: We no longer insert into proyectos_railway here.
              console.log(`[activateClientPortal] Vinculación instantánea completada en Supabase para la suscripción ${clienteId}`);
            } catch (instErr) {
              console.error(`[activateClientPortal] Error al realizar vinculación instantánea:`, instErr.message);
            }
          }
        });

        if (deployResult?.projectId) {
          projectId = deployResult.projectId;
        }
        if (deployResult?.domain) {
          domain = deployResult.domain;
        }
        if (deployResult?.railwayPublicUrl) {
          railwayPublicUrl = deployResult.railwayPublicUrl;
        }

        console.log(`[activateClientPortal] Railway deploy successful for line ${i + 1}. Project ID: ${projectId}, Public URL: ${railwayPublicUrl}`);
      } catch (deployErr) {
        console.error(`[activateClientPortal] Railway deployment failed for line ${i + 1}, using fallback details:`, deployErr);
        allSucceeded = false;
        if (!firstDeployError) firstDeployError = deployErr;
        if (deployErr.projectId) {
          projectId = deployErr.projectId; // Capture actual created project ID
        }
      }

      // Update arrays in memory
      tokenBackoffices[i] = projectId;
      deploymentUrls[i] = domain;
      railwayPublicUrls[i] = railwayPublicUrl;

      // Persist real ID and domain association to Supabase IMMEDIATELY (even on partial failures)
      try {
        const publicUrlData = count > 1 ? JSON.stringify(railwayPublicUrls) : (railwayPublicUrls[0] || null);

        await adminDb
          .from("suscripciones_proyectos")
          .update({
            token_backoffice:  tokenBackoffices[0],
            tokens_backoffice: tokenBackoffices,
            deployment_url:    deploymentUrls[0],
            deployment_urls:   deploymentUrls,
            railway_public_url: publicUrlData,
            updated_at:        new Date().toISOString(),
          })
          .eq("id", clienteId);
      } catch (dbSaveErr) {
        console.error(`[activateClientPortal] Failed to save intermediate deployment IDs:`, dbSaveErr);
      }

      // OBSOLETE: Link project to client in proyectos_railway
      // Relies purely on tokens_backoffice array now.

      // Copy default settings template to this newly created project_id partition in Supabase settings
      if (projectId) {
        try {
          // Check if settings already exist for this project ID
          const { count: settingsCount } = await adminDb
            .from("settings")
            .select("key", { count: "exact", head: true })
            .eq("project_id", projectId);

          if (settingsCount === 0) {
            // Get client auth details (email and plain password metadata)
            let adminUserVal = null;
            let adminPassVal = null;
            if (cliente.auth_user_id) {
              try {
                console.log(`[activateClientPortal] Fetching auth profile details for user ID: ${cliente.auth_user_id}...`);
                const { data: { user }, error: authUserErr } = await adminDb.auth.admin.getUserById(cliente.auth_user_id);
                if (!authUserErr && user) {
                  adminUserVal = user.email;
                  adminPassVal = user.user_metadata?.plain_password;
                  console.log(`[activateClientPortal] Resolved auth credentials for settings. User: "${adminUserVal}", Pass: "${adminPassVal ? "****" : "none"}"`);
                } else if (authUserErr) {
                  console.warn(`[activateClientPortal] Failed to resolve auth user by admin API:`, authUserErr.message);
                }
              } catch (authErr) {
                console.error(`[activateClientPortal] Error calling admin getUserById:`, authErr);
              }
            }

            const { data: defaultSettings } = await adminDb
              .from("settings")
              .select("key, value")
              .eq("project_id", "default");

            if (defaultSettings?.length) {
              await adminDb.from("settings").insert(
                defaultSettings.map(s => {
                  let val = s.value;
                  if (s.key === "ADMIN_USER" && adminUserVal) val = adminUserVal;
                  if (s.key === "ADMIN_PASS" && adminPassVal) val = adminPassVal;
                  return {
                    project_id: projectId,
                    key:        s.key,
                    value:      val,
                  };
                })
              );
              console.log(`[activateClientPortal] Successfully copied default settings to project partition: "${projectId}"`);
            }
          } else {
            console.log(`[activateClientPortal] Settings partition already populated for project ID: "${projectId}". Ensuring ADMIN credentials are up to date.`);
            // Get client auth details (email and plain password metadata)
            let adminUserVal = null;
            let adminPassVal = null;
            if (cliente.auth_user_id) {
              try {
                console.log(`[activateClientPortal] Fetching auth profile details for user ID: ${cliente.auth_user_id} (existing settings)...`);
                const { data: { user }, error: authUserErr } = await adminDb.auth.admin.getUserById(cliente.auth_user_id);
                if (!authUserErr && user) {
                  adminUserVal = user.email;
                  adminPassVal = user.user_metadata?.plain_password;
                  console.log(`[activateClientPortal] Resolved auth credentials for existing settings. User: "${adminUserVal}", Pass: "${adminPassVal ? "****" : "none"}"`);
                }
              } catch (authErr) {
                console.error(`[activateClientPortal] Error calling admin getUserById for existing settings:`, authErr);
              }
            }

            if (adminUserVal || adminPassVal) {
              if (adminUserVal) {
                await adminDb
                  .from("settings")
                  .upsert({ project_id: projectId, key: "ADMIN_USER", value: adminUserVal });
              }
              if (adminPassVal) {
                await adminDb
                  .from("settings")
                  .upsert({ project_id: projectId, key: "ADMIN_PASS", value: adminPassVal });
              }
              console.log(`[activateClientPortal] Updated ADMIN credentials in existing settings partition for project ID: "${projectId}"`);
            }
          }
        } catch (settingsErr) {
          console.error(`[activateClientPortal] Settings copy failed for partition ${projectId}:`, settingsErr);
        }
      } else {
        console.log(`[activateClientPortal] No valid projectId resolved. Skipping settings partition copy.`);
      }
    }

    if (!allSucceeded) {
      console.warn(`[activateClientPortal] Client ${clienteId} deployment completed with errors. Status left as backoffice_activado=false to allow retries.`);
      throw firstDeployError || new Error("One or more line deployments failed.");
    }

    // Save final activation success status to Supabase
    const { error: updateError } = await adminDb
      .from("suscripciones_proyectos")
      .update({
        backoffice_activado: true,
        activated_at:        new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      })
      .eq("id", clienteId);

    if (updateError) {
      throw new Error(`Failed to update client ${clienteId} status in database: ${updateError.message}`);
    }

    console.log(`[activateClientPortal] Client ${clienteId} activated successfully with ${count} line(s).`);

    // Recalcular suscripciones activas del plan
    if (cliente.clientes?.vendedor_id) {
      await recalculatePlanSubscriptions(
        cliente.clientes.vendedor_id,
        cliente.plan_tipo,
        cliente.lineas_cantidad,
        adminDb
      );
    }

    return { ok: true, alreadyActivated: false, count, deploymentUrls };

  } finally {
    // Release the deployment lock under all circumstances (success or failure)
    try {
      await adminDb
        .from("suscripciones_proyectos")
        .update({ deploy_in_progress: false })
        .eq("id", clienteId);
      console.log(`[activateClientPortal] Released deployment lock for client ${clienteId}`);
    } catch (lockReleaseErr) {
      console.error(`[activateClientPortal] Failed to release deployment lock:`, lockReleaseErr.message);
    }
  }
}

export async function deleteRailwayProject(projectId) {
  console.log(`[deleteRailwayProject] Requesting deletion of Railway project: ${projectId}`);
  try {
    const data = await gql(`
      mutation projectDelete($id: String!) {
        projectDelete(id: $id)
      }
    `, { id: projectId });
    console.log(`[deleteRailwayProject] Result for ${projectId}:`, data);
    return data?.projectDelete === true || data?.projectDelete === null || true;
  } catch (err) {
    console.error(`[deleteRailwayProject] Failed to delete project ${projectId}:`, err.message);
    throw err;
  }
}

export async function recalculatePlanSubscriptions(vendedorId, planTipo, lineasCantidad, adminDb) {
  try {
    console.log(`[recalculatePlanSubscriptions] Recalculating active subs for seller: ${vendedorId}, planTipo: ${planTipo}, lineasCantidad: ${lineasCantidad}`);

    // 1. Obtener el token de acceso del vendedor y el ID del plan de Mercado Pago
    // Usamos el join implícito de Supabase mp_vendedores(access_token)
    const { data: planData, error: planErr } = await adminDb
      .from("mp_planes")
      .select("mp_plan_id, mp_vendedores(access_token)")
      .eq("vendedor_id", vendedorId)
      .eq("plan_tipo", planTipo)
      .eq("lineas_cantidad", lineasCantidad)
      .single();

    if (planErr || !planData) {
      console.warn(`[recalculatePlanSubscriptions] Could not fetch mp_plan_id from DB:`, planErr?.message || "Plan not found.");
      // Fallback local
      return await recalculatePlanSubscriptionsLocal(vendedorId, planTipo, lineasCantidad, adminDb);
    }

    const mpPlanId = planData.mp_plan_id;
    const accessToken = planData.mp_vendedores?.access_token;

    if (!mpPlanId || !accessToken) {
      console.warn(`[recalculatePlanSubscriptions] Missing mpPlanId or seller access_token. Falling back to local count.`);
      return await recalculatePlanSubscriptionsLocal(vendedorId, planTipo, lineasCantidad, adminDb);
    }

    // 2. Consultar la API de Mercado Pago
    console.log(`[recalculatePlanSubscriptions] Querying Mercado Pago API for plan ID ${mpPlanId}...`);
    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/search?preapproval_plan_id=${mpPlanId}&status=authorized`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (mpRes.ok) {
      const mpJson = await mpRes.json();
      const activeCount = mpJson.paging?.total ?? 0;
      console.log(`[recalculatePlanSubscriptions] Mercado Pago API reported ${activeCount} active subscriptions.`);

      // 3. Actualizar la tabla mp_planes con el conteo de la API
      const { error: updateErr } = await adminDb
        .from("mp_planes")
        .update({ suscripciones_activas: activeCount })
        .eq("vendedor_id", vendedorId)
        .eq("plan_tipo", planTipo)
        .eq("lineas_cantidad", lineasCantidad);

      if (updateErr) throw updateErr;
      console.log(`[recalculatePlanSubscriptions] Successfully updated mp_planes via API.`);
    } else {
      const errText = await mpRes.text();
      console.warn(`[recalculatePlanSubscriptions] Mercado Pago API returned status ${mpRes.status}: ${errText}. Falling back to local count.`);
      return await recalculatePlanSubscriptionsLocal(vendedorId, planTipo, lineasCantidad, adminDb);
    }
  } catch (err) {
    console.error(`[recalculatePlanSubscriptions] Error in recalculatePlanSubscriptions:`, err.message);
    // Intentar fallback local ante cualquier error
    await recalculatePlanSubscriptionsLocal(vendedorId, planTipo, lineasCantidad, adminDb).catch(console.error);
  }
}

// Función helper de fallback local (conteo en DB)
async function recalculatePlanSubscriptionsLocal(vendedorId, planTipo, lineasCantidad, adminDb) {
  console.log(`[recalculatePlanSubscriptionsLocal] Running fallback database-only count...`);
  const { count, error: countErr } = await adminDb
    .from("suscripciones_proyectos")
    .select("id, clientes!inner(vendedor_id)", { count: "exact", head: true })
    .eq("clientes.vendedor_id", vendedorId)
    .eq("plan_tipo", planTipo)
    .eq("lineas_cantidad", lineasCantidad)
    .eq("backoffice_activado", true)
    .eq("is_deleted", false);

  if (countErr) throw countErr;

  const { error: updateErr } = await adminDb
    .from("mp_planes")
    .update({ suscripciones_activas: count || 0 })
    .eq("vendedor_id", vendedorId)
    .eq("plan_tipo", planTipo)
    .eq("lineas_cantidad", lineasCantidad);

  if (updateErr) throw updateErr;
  console.log(`[recalculatePlanSubscriptionsLocal] Successfully updated mp_planes via fallback count: ${count}`);
}

export async function getRailwayProjectNames(projectIds) {
  if (!projectIds || projectIds.length === 0) return [];
  try {
    const promises = projectIds.map(async (id) => {
      if (!id) return null;
      try {
        const res = await gql(`
          query project($id: String!) {
            project(id: $id) {
              id
              name
            }
          }
        `, { id });
        return res?.project;
      } catch (err) {
        return null;
      }
    });
    
    const results = await Promise.all(promises);
    return results.filter(Boolean);
  } catch (error) {
    console.error("[getRailwayProjectNames] Error fetching railway project names:", error);
    return [];
  }
}

