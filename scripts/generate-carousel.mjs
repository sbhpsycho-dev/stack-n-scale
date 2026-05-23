import { chromium } from "playwright";
import { mkdirSync } from "fs";

mkdirSync("scripts/carousel-output", { recursive: true });

const slides = [
  {
    name: "01-cover",
    html: `
    <div style="width:1080px;height:1350px;background:#0a0a0a;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px;font-family:Georgia,serif;text-align:center;position:relative;box-sizing:border-box;">
      <div style="position:absolute;top:0;left:0;right:0;height:4px;background:#c8902a;"></div>
      <p style="margin:0 0 24px;font-size:16px;letter-spacing:6px;text-transform:uppercase;color:#c8902a;">Stack N Scale Enterprises</p>
      <h1 style="margin:0 0 32px;font-size:72px;font-weight:400;color:#f5f0e8;line-height:1.15;">We built the whole system with AI.</h1>
      <p style="margin:0 0 64px;font-size:24px;color:#6a5a40;line-height:1.8;">From dashboard to Discord —<br>here's everything that's live.</p>
      <div style="display:flex;align-items:center;gap:12px;color:#c8902a;">
        <div style="width:32px;height:1px;background:#c8902a;"></div>
        <p style="margin:0;font-size:15px;letter-spacing:4px;text-transform:uppercase;">Swipe to see it all</p>
        <div style="width:32px;height:1px;background:#c8902a;"></div>
      </div>
      <div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:#c8902a;"></div>
    </div>`,
  },
  {
    name: "02-dashboard",
    html: `
    <div style="width:1080px;height:1350px;background:#0a0a0a;display:flex;flex-direction:column;justify-content:center;padding:80px 90px;font-family:Georgia,serif;box-sizing:border-box;position:relative;">
      <div style="position:absolute;top:0;left:0;right:0;height:4px;background:#c8902a;"></div>
      <p style="margin:0 0 8px;font-size:120px;font-weight:400;color:#1a1400;line-height:1;position:absolute;top:60px;right:80px;">01</p>
      <p style="margin:0 0 16px;font-size:14px;letter-spacing:5px;text-transform:uppercase;color:#c8902a;">The Dashboard</p>
      <h2 style="margin:0 0 40px;font-size:52px;font-weight:400;color:#f5f0e8;line-height:1.2;">Custom admin dashboard — live, private, and client-ready.</h2>
      <div style="display:flex;flex-direction:column;gap:20px;">
        <div style="display:flex;align-items:flex-start;gap:20px;padding:24px;background:#111;border-left:3px solid #c8902a;">
          <p style="margin:0;font-size:20px;color:#a09070;line-height:1.7;">Live KPIs: cash collected, MRR, pipeline funnel, ad metrics, and a full rep leaderboard — all in one view.</p>
        </div>
        <div style="display:flex;align-items:flex-start;gap:20px;padding:24px;background:#111;border-left:3px solid #c8902a;">
          <p style="margin:0;font-size:20px;color:#a09070;line-height:1.7;">Per-client dashboards with password-protected login. Every client sees their data only. Nobody else's.</p>
        </div>
        <div style="display:flex;align-items:flex-start;gap:20px;padding:24px;background:#111;border-left:3px solid #c8902a;">
          <p style="margin:0;font-size:20px;color:#a09070;line-height:1.7;">Built on Next.js + Vercel. Syncs daily via cron job. Always current, zero maintenance.</p>
        </div>
      </div>
      <div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:#c8902a;"></div>
    </div>`,
  },
  {
    name: "03-onboarding",
    html: `
    <div style="width:1080px;height:1350px;background:#0a0a0a;display:flex;flex-direction:column;justify-content:center;padding:80px 90px;font-family:Georgia,serif;box-sizing:border-box;position:relative;">
      <div style="position:absolute;top:0;left:0;right:0;height:4px;background:#c8902a;"></div>
      <p style="margin:0 0 8px;font-size:120px;font-weight:400;color:#1a1400;line-height:1;position:absolute;top:60px;right:80px;">02</p>
      <p style="margin:0 0 16px;font-size:14px;letter-spacing:5px;text-transform:uppercase;color:#c8902a;">The Onboarding System</p>
      <h2 style="margin:0 0 48px;font-size:52px;font-weight:400;color:#f5f0e8;line-height:1.2;">Fully automated. End to end.</h2>
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${["Intake form with all client goals & background", "ID verification — signature canvas + secure file upload", "Auto-logged to Google Sheets on every submission", "Files stored privately in Vercel Blob — never exposed", "Client status tracked in real time via Upstash Redis"].map((step, i) => `
        <div style="display:flex;align-items:center;gap:24px;padding:22px 0;border-bottom:1px solid #1e1e1e;">
          <span style="font-size:14px;color:#c8902a;letter-spacing:2px;min-width:32px;">0${i + 1}</span>
          <p style="margin:0;font-size:20px;color:#a09070;">${step}</p>
        </div>`).join("")}
      </div>
      <div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:#c8902a;"></div>
    </div>`,
  },
  {
    name: "04-email",
    html: `
    <div style="width:1080px;height:1350px;background:#0a0a0a;display:flex;flex-direction:column;justify-content:center;padding:80px 90px;font-family:Georgia,serif;box-sizing:border-box;position:relative;">
      <div style="position:absolute;top:0;left:0;right:0;height:4px;background:#c8902a;"></div>
      <p style="margin:0 0 8px;font-size:120px;font-weight:400;color:#1a1400;line-height:1;position:absolute;top:60px;right:80px;">03</p>
      <p style="margin:0 0 16px;font-size:14px;letter-spacing:5px;text-transform:uppercase;color:#c8902a;">The Email Engine</p>
      <h2 style="margin:0 0 16px;font-size:52px;font-weight:400;color:#f5f0e8;line-height:1.2;">Zero manual emails. Ever.</h2>
      <p style="margin:0 0 48px;font-size:22px;color:#6a5a40;line-height:1.7;">Make.com automation fires at every stage of the client journey.</p>
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${[["Form received", "Client gets confirmation the moment they submit."],["ID verified", "Instant notification once docs are uploaded."],["Approved", "Welcome email with next steps triggers on approval."],["Discord invite", "Unique OAuth link delivered automatically — no copy-paste."]].map(([title, desc]) => `
        <div style="padding:24px 28px;background:#111;border:1px solid #1e1e1e;display:flex;align-items:center;gap:24px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#c8902a;flex-shrink:0;"></div>
          <div>
            <p style="margin:0 0 4px;font-size:18px;color:#c8902a;letter-spacing:1px;">${title}</p>
            <p style="margin:0;font-size:18px;color:#6a5a40;">${desc}</p>
          </div>
        </div>`).join("")}
      </div>
      <div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:#c8902a;"></div>
    </div>`,
  },
  {
    name: "05-discord",
    html: `
    <div style="width:1080px;height:1350px;background:#0a0a0a;display:flex;flex-direction:column;justify-content:center;padding:80px 90px;font-family:Georgia,serif;box-sizing:border-box;position:relative;">
      <div style="position:absolute;top:0;left:0;right:0;height:4px;background:#c8902a;"></div>
      <p style="margin:0 0 8px;font-size:120px;font-weight:400;color:#1a1400;line-height:1;position:absolute;top:60px;right:80px;">04</p>
      <p style="margin:0 0 16px;font-size:14px;letter-spacing:5px;text-transform:uppercase;color:#c8902a;">The Discord Bot</p>
      <h2 style="margin:0 0 16px;font-size:52px;font-weight:400;color:#f5f0e8;line-height:1.2;">Nobody touches anything.</h2>
      <p style="margin:0 0 48px;font-size:22px;color:#6a5a40;line-height:1.7;">The moment a client submits their form, the bot goes to work.</p>
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${["Creates a private Discord channel — client name, correct permissions.", "Generates a unique OAuth link tied to that client's email.", "Fires the invite email automatically via Make.com.", "Client joins → gets added to their private channel. Done.", "Internal staff channels locked. Clients only see what they should."].map((step, i) => `
        <div style="display:flex;align-items:flex-start;gap:24px;padding:22px 0;border-bottom:1px solid #1a1a1a;">
          <span style="font-size:13px;color:#c8902a;letter-spacing:2px;min-width:32px;padding-top:3px;">→</span>
          <p style="margin:0;font-size:20px;color:#a09070;line-height:1.6;">${step}</p>
        </div>`).join("")}
      </div>
      <div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:#c8902a;"></div>
    </div>`,
  },
  {
    name: "06-infrastructure",
    html: `
    <div style="width:1080px;height:1350px;background:#0a0a0a;display:flex;flex-direction:column;justify-content:center;padding:80px 90px;font-family:Georgia,serif;box-sizing:border-box;position:relative;">
      <div style="position:absolute;top:0;left:0;right:0;height:4px;background:#c8902a;"></div>
      <p style="margin:0 0 8px;font-size:120px;font-weight:400;color:#1a1400;line-height:1;position:absolute;top:60px;right:80px;">05</p>
      <p style="margin:0 0 16px;font-size:14px;letter-spacing:5px;text-transform:uppercase;color:#c8902a;">The Infrastructure</p>
      <h2 style="margin:0 0 48px;font-size:52px;font-weight:400;color:#f5f0e8;line-height:1.2;">Built to scale. Runs itself.</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        ${[["Vercel", "Hosting, cron jobs, edge functions"],["Upstash Redis", "All client state — onboarding, OAuth tokens, Discord IDs"],["Vercel Blob", "Private file storage — ID photos never exposed"],["Google Drive", "Client folders auto-created via service account"],["Discord Bot API", "Private channels, OAuth, permission management"],["Make.com", "Email automation — no code, no servers"]].map(([name, desc]) => `
        <div style="padding:24px;background:#111;border:1px solid #1e1e1e;">
          <p style="margin:0 0 8px;font-size:16px;color:#c8902a;letter-spacing:2px;">${name}</p>
          <p style="margin:0;font-size:16px;color:#4a4030;line-height:1.5;">${desc}</p>
        </div>`).join("")}
      </div>
      <p style="margin:40px 0 0;font-size:18px;color:#3a3a3a;font-style:italic;">Claude AI agents used throughout — architecture, security review, API integration, debugging, shipping.</p>
      <div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:#c8902a;"></div>
    </div>`,
  },
  {
    name: "07-closing",
    html: `
    <div style="width:1080px;height:1350px;background:#0a0a0a;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px;font-family:Georgia,serif;text-align:center;position:relative;box-sizing:border-box;">
      <div style="position:absolute;top:0;left:0;right:0;height:4px;background:#c8902a;"></div>
      <div style="width:48px;height:1px;background:#c8902a;margin:0 auto 48px;"></div>
      <h2 style="margin:0 0 32px;font-size:56px;font-weight:400;color:#f5f0e8;line-height:1.4;">Stack N Scale is live.<br>Clients are onboarding.<br>The system runs itself.</h2>
      <div style="width:48px;height:1px;background:#c8902a;margin:48px auto;"></div>
      <p style="margin:0;font-size:16px;letter-spacing:6px;text-transform:uppercase;color:#c8902a;">Stack N Scale Enterprises</p>
      <div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:#c8902a;"></div>
    </div>`,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1080, height: 1350 });

for (const slide of slides) {
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;">${slide.html}</body></html>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `scripts/carousel-output/${slide.name}.png`, clip: { x: 0, y: 0, width: 1080, height: 1350 } });
  console.log(`✅ ${slide.name}.png`);
}

await browser.close();
console.log("\n📁 All slides saved to scripts/carousel-output/");
