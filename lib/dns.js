/**
 * DNS automation helper for Hostinger hPanel DNS API.
 */

/**
 * Creates a CNAME record in Hostinger for the given subdomain (slug).
 * 
 * @param {Object} params
 * @param {string} params.slug The subdomain to create (e.g. "testdev-2")
 * @param {string} params.requiredValue The target value (e.g. "d05up1b0.up.railway.app")
 * @returns {Promise<boolean>} Resolves to true if successfully created, false otherwise.
 */
export async function createCnameRecord({ slug, requiredValue }) {
  const token = process.env.HOSTINGER_API_TOKEN;
  const domain = process.env.HOSTINGER_DOMAIN || "clientesneurolinks.com";

  if (!token || token === "PLACEHOLDER_TOKEN") {
    console.warn(`[DNS] ⚠️ Hostinger API Token is not configured or is placeholder. Skipping CNAME creation for "${slug}.${domain}"`);
    return false;
  }

  const url = `https://developers.hostinger.com/api/dns/v1/zones/${domain}`;
  console.log(`[DNS] Creating CNAME record for "${slug}.${domain}" pointing to "${requiredValue}" via Hostinger API...`);

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        overwrite: false,
        records: [
          {
            type: "CNAME",
            name: slug,
            content: requiredValue,
            ttl: 3600
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Hostinger API returned HTTP ${response.status}: ${errText}`);
    }

    const resJson = await response.json();
    console.log(`[DNS] ✅ CNAME record for "${slug}.${domain}" created successfully. Response:`, resJson);
    return true;
  } catch (error) {
    console.error(`[DNS] ❌ Error creating CNAME record for "${slug}.${domain}":`, error.message);
    return false;
  }
}
