const fs = require("fs");
const path = require("path");

async function checkPayment() {
  const accessToken = "APP_USR-3488743890857659-060211-3241bccefaf5b257229f1505d38c1ea6-3404523654";
  const preapprovalId = "913485a59fad45afa4a4bb77c9649aa8";
  
  console.log(`Checking subscription ID ${preapprovalId} using token...`);
  
  try {
    const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });
    
    const data = await res.json();
    console.log("\n=============================================");
    console.log("📊 API RESPONSE FOR PAYMENT");
    console.log("=============================================");
    console.log(JSON.stringify(data, null, 2));
    console.log("=============================================");
  } catch (err) {
    console.error("Error fetching payment:", err);
  }
}

checkPayment();
