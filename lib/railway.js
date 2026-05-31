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
