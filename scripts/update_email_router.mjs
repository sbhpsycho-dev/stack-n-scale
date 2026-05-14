const TOKEN = "8b0d2a1a-a0ab-49c9-818e-ba1d0ad7d32a";
const SCENARIO_ID = 4869898;

const FOOTER = `<tr><td style="padding:24px 48px;border-top:1px solid #1e1e1e;text-align:center;"><p style="margin:0 0 8px;font-size:11px;color:#3a3a3a;letter-spacing:1px;">STACK N SCALE ENTERPRISES &nbsp;&middot;&nbsp; PRIVATE MEMBER CORRESPONDENCE</p><a href="https://www.skool.com/elysium-sales-academy-7811/about?ref=69ad8597e9144b38b0ac045df7b96c3e" style="color:#c8902a;text-decoration:none;font-size:11px;letter-spacing:1px;font-family:'Georgia',serif;">stacknscale.com</a></td></tr>`;
const WRAP_OPEN = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#0a0a0a;font-family:'Georgia',serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#111111;border:1px solid #1e1e1e;border-radius:4px;">`;
const WRAP_CLOSE = `</table></td></tr></table></body></html>\r\n`;

function header(title) {
  return `<tr><td style="padding:40px 48px 32px;border-bottom:1px solid #1e1e1e;text-align:center;"><p style="margin:0 0 8px;font-size:11px;letter-spacing:4px;color:#c8902a;text-transform:uppercase;">Stack N Scale Enterprises</p><h1 style="margin:0;font-size:28px;font-weight:400;color:#f5f0e8;letter-spacing:1px;">${title}</h1></td></tr>`;
}

function bodyOpen() {
  return `<tr><td style="padding:40px 48px;"><p style="margin:0 0 24px;font-size:16px;color:#c8b89a;line-height:1.8;">Dear {{1.name}},</p>`;
}

function bodyClose() {
  return `<p style="margin:0 0 4px;font-size:14px;color:#c8b89a;">Warm regards,</p><p style="margin:0;font-size:14px;color:#c8902a;letter-spacing:1px;">Stack N Scale Enterprises</p></td></tr>`;
}

function ctaButton(href, label) {
  return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 36px;"><a href="${href}" style="display:inline-block;background:#c8902a;color:#0a0a0a;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;padding:16px 40px;border-radius:2px;font-weight:600;">${label} &rarr;</a></td></tr></table>`;
}

const DISCORD_HTML = WRAP_OPEN + header("Discord.") + bodyOpen()
  + `<p style="margin:0 0 20px;font-size:15px;color:#a09070;line-height:1.9;">Your onboarding is complete. You're now cleared to join your private Discord channel and the Stack N Scale student community.</p>`
  + `<p style="margin:0 0 32px;font-size:15px;color:#a09070;line-height:1.9;">Click below to connect your Discord account and gain immediate access:</p>`
  + ctaButton("{{1.discordOAuthUrl}}", "Connect Discord")
  + `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;"><tr><td style="padding:20px 24px;background:#0f0f0f;border:1px solid #1e1e1e;border-radius:4px;"><p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;color:#c8902a;text-transform:uppercase;">Your Resources</p><p style="margin:0 0 12px;font-size:13px;color:#a09070;line-height:1.8;">Your personal client folder is ready in Google Drive.</p><a href="{{1.driveFolderUrl}}" style="display:inline-block;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c8902a;text-decoration:none;">View Your Folder &rarr;</a></td></tr></table>`
  + bodyClose() + FOOTER + WRAP_CLOSE;

const FORM_RECEIVED_HTML = WRAP_OPEN + header("Received.") + bodyOpen()
  + `<p style="margin:0 0 20px;font-size:15px;color:#a09070;line-height:1.9;">Your onboarding questionnaire has been received and saved. Thank you for taking the time to complete it.</p>`
  + `<p style="margin:0 0 20px;font-size:15px;color:#a09070;line-height:1.9;">If you haven't already, please complete your identity verification to finalize your access.</p>`
  + `<p style="margin:0 0 36px;font-size:15px;color:#a09070;line-height:1.9;">Our team will be in touch shortly.</p>`
  + bodyClose() + FOOTER + WRAP_CLOSE;

const ID_RECEIVED_HTML = WRAP_OPEN + header("Under Review.") + bodyOpen()
  + `<p style="margin:0 0 20px;font-size:15px;color:#a09070;line-height:1.9;">Your identity verification documents have been received and are now under review.</p>`
  + `<p style="margin:0 0 20px;font-size:15px;color:#a09070;line-height:1.9;">Once verified, you'll receive your Discord channel link to access the Stack N Scale community.</p>`
  + `<p style="margin:0 0 36px;font-size:15px;color:#a09070;line-height:1.9;">If you have any questions in the meantime, our team is available.</p>`
  + bodyClose() + FOOTER + WRAP_CLOSE;

const ID_VERIFICATION_REQUEST_HTML = WRAP_OPEN + header("Identity Verification.") + bodyOpen()
  + `<p style="margin:0 0 20px;font-size:15px;color:#a09070;line-height:1.9;">Welcome to Stack N Scale Enterprises. Your payment has been confirmed and your account is ready.</p>`
  + `<p style="margin:0 0 20px;font-size:15px;color:#a09070;line-height:1.9;">To complete your onboarding and unlock your private Discord channel, please submit your identity verification documents using the button below.</p>`
  + `<p style="margin:0 0 32px;font-size:15px;color:#a09070;line-height:1.9;">The process takes under two minutes &mdash; you'll need a government-issued photo ID and a selfie holding it.</p>`
  + ctaButton("{{1.idVerificationUrl}}", "Complete Verification")
  + bodyClose() + FOOTER + WRAP_CLOSE;

const EMAIL_EXPECT = [
  {"name":"to","spec":{"name":"value","type":"email","label":"Recipient email address","required":true,"validate":true},"type":"array","label":"To","required":true},
  {"name":"subject","type":"text","label":"Subject"},
  {"name":"bodyType","type":"select","label":"Body type","required":true,"validate":{"enum":["rawHtml","collection"]}},
  {"name":"attachments","spec":{"name":"value","spec":[{"name":"filename","type":"filename","label":"File name","required":true,"semantic":"file:name"},{"name":"data","type":"buffer","label":"Data","required":true,"semantic":"file:data"}],"type":"collection","label":"Attachment"},"type":"array","label":"Attachments"},
  {"name":"from","type":"select","label":"From"},
  {"name":"cc","spec":{"name":"value","type":"email","label":"Recipient email address"},"type":"array","label":"CC recipients"},
  {"name":"bcc","spec":{"name":"value","type":"email","label":"Recipient email address"},"type":"array","label":"BCC recipients"},
  {"name":"emailHeaders","spec":{"name":"value","spec":[{"name":"key","type":"text","label":"Key","required":true},{"name":"value","type":"text","label":"Value"}],"type":"collection","label":"Email header"},"type":"array","label":"Additional email headers"},
  {"name":"content","type":"text","label":"Content"}
];

const BASE_RESTORE_EXPECT = {
  cc:{"mode":"chose"}, to:{"mode":"chose","items":[null]}, bcc:{"mode":"chose"},
  from:{"mode":"chose"}, bodyType:{"label":"Raw HTML"},
  attachments:{"mode":"chose"}, emailHeaders:{"mode":"chose"}
};

function emailModule(id, filterName, filterValue, html, subject, connId, connLabel, designerPos) {
  return {
    id, module: "google-email:sendAnEmail", version: 4,
    filter: { name: filterName, conditions: [[{ a: "{{1.type}}", b: filterValue, o: "text:equal" }]] },
    mapper: { to: ["{{1.to}}"], content: html, subject, bodyType: "rawHtml" },
    metadata: {
      expect: EMAIL_EXPECT,
      restore: {
        expect: BASE_RESTORE_EXPECT,
        parameters: { __IMTCONN__: { data: { scoped: "true", connection: "google-email" }, label: connLabel } }
      },
      designer: designerPos,
      parameters: [{ name: "__IMTCONN__", type: "account:google-email", label: "Connection", required: true }]
    },
    parameters: { __IMTCONN__: connId }
  };
}

const blueprint = {
  flow: [
    {
      id: 1, mapper: {}, module: "gateway:CustomWebHook", version: 1,
      metadata: {
        restore: { parameters: { hook: { data: { editable: "true" }, label: "SNS Email Hook" } } },
        designer: { x: -228, y: 0 },
        interface: [
          { name: "type", type: "text" },
          { name: "to", type: "text" },
          { name: "name", type: "text" },
          { name: "discordOAuthUrl", type: "text" },
          { name: "driveFolderUrl", type: "text" },
          { name: "idVerificationUrl", type: "text" }
        ],
        parameters: [
          { name: "hook", type: "hook:gateway-webhook", label: "Webhook", required: true },
          { name: "maxResults", type: "number", label: "Maximum number of results" }
        ]
      },
      parameters: { hook: 2220417, maxResults: 1 }
    },
    {
      id: 2, mapper: null, module: "builtin:BasicRouter", version: 1,
      metadata: { designer: { x: 112, y: 0 } },
      routes: [
        { flow: [emailModule(3, "Discord Link", "discord_link", DISCORD_HTML, "Your Stack N Scale Discord Channel is Ready", 8574969, "SNS Discord link (evan@stacknscale.co)", { x: 342, y: -186 })] },
        { flow: [emailModule(4, "Form Received", "form_received", FORM_RECEIVED_HTML, "We Received Your Onboarding Form — Stack N Scale Enterprises", 8575284, "form received ", { x: 419, y: 69 })] },
        { flow: [emailModule(5, "ID Received", "id_received", ID_RECEIVED_HTML, "ID Verification Received — Stack N Scale Enterprises", 8575300, "id received ", { x: 100, y: 277 })] },
        { flow: [emailModule(6, "ID Verification Request", "id_verification_request", ID_VERIFICATION_REQUEST_HTML, "Action Required: Complete Your Identity Verification — Stack N Scale", 8575300, "id verification request", { x: -200, y: 420 })] }
      ]
    }
  ],
  name: "SNS — Email Router",
  metadata: {
    instant: true,
    version: 1,
    designer: {
      orphans: [],
      samples: {
        "1": {
          to: "caelum123567@outlook.com",
          name: "Test Client",
          type: "id_verification_request",
          idVerificationUrl: "https://stack-n-scale.vercel.app/onboarding/id-submit?email=test%40test.com&name=Test+Client"
        }
      }
    },
    scenario: {
      dlq: false, slots: null, dataloss: false, maxErrors: 3,
      autoCommit: true, roundtrips: 1, sequential: false,
      confidential: false, freshVariables: false, autoCommitTriggerLast: true
    }
  }
};

const body = JSON.stringify({ blueprint: JSON.stringify(blueprint) });

const resp = await fetch(`https://us2.make.com/api/v2/scenarios/${SCENARIO_ID}`, {
  method: "PATCH",
  headers: {
    "Authorization": `Token ${TOKEN}`,
    "Content-Type": "application/json"
  },
  body
});

const text = await resp.text();
if (resp.ok) {
  console.log("SUCCESS — scenario updated");
  const result = JSON.parse(text);
  console.log("Scenario ID:", result.scenario?.id);
  console.log("Name:", result.scenario?.name);
} else {
  console.log("ERROR", resp.status, text.slice(0, 1000));
}
