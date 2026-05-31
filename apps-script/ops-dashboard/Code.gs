// Leadwell Ops Dashboard — Google Apps Script Web App
// Deploy: Extensions → Apps Script → Deploy → New deployment
//   Type: Web App | Execute as: Me | Who has access: Anyone
//
// After deploying, set Script Properties (Project Settings → Script Properties):
//   LEADWELL_KPI_ID       = ID of "Leadwell KPI Tracker" sheet
//   LEADWELL_DEAL_LOG_ID  = ID of "Leadwell Deal Log" sheet
//   IZAIAH_SHEET_ID       = ID of "Leadwell — Izaiah Dingman" sheet
//   SYLIS_SHEET_ID        = ID of "Leadwell — Sylis Snyder" sheet
//   FADI_SHEET_ID         = ID of "Leadwell — Fadi Lebsir" sheet
//   KEVIN_SHEET_ID        = ID of "Leadwell — Kevin Korona" sheet
//
// Then redeploy (new deployment) and paste the new URL into APPS_SCRIPT_OPS_URL in Vercel.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProps() {
  return PropertiesService.getScriptProperties().getProperties();
}

function safeOpen(id) {
  if (!id) return null;
  try { return SpreadsheetApp.openById(id); } catch (e) { return null; }
}

function num(v) {
  var n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10; // one decimal
}

// Read all rows from a named tab, skip header row 1.
// Returns array of row arrays.
function readTab(ss, tabName) {
  if (!ss) return [];
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  return data.slice(1); // skip header
}

// ─── KPI Tracker aggregation ──────────────────────────────────────────────────
// "Daily Log" columns: Date | Name | Calls Made | Calls Answered | Conversations |
//   Fact Finds | Zooms Booked | Zooms Showed | No-Showed | Show Rate | Deals Closed | Cash Collected
// Indices:           0       1     2             3              4
//   5            6              7              8          9         10             11

function aggregateKpiTracker(kpiId) {
  var ss = safeOpen(kpiId);
  var rows = readTab(ss, "Daily Log");

  var totals = {};   // name → { calls, answered, demosSet, demosShowed, closed, cash }
  var orgCalls = 0, orgAnswered = 0, orgDemos = 0, orgShowed = 0, orgClosed = 0, orgCash = 0;

  rows.forEach(function(r) {
    var name     = String(r[1] || "").trim();
    var calls    = num(r[2]);
    var answered = num(r[3]);
    var demos    = num(r[6]);
    var showed   = num(r[7]);
    var closed   = num(r[10]);
    var cash     = num(r[11]);

    if (!name) return;
    if (!totals[name]) totals[name] = { calls:0, answered:0, demos:0, showed:0, closed:0, cash:0 };
    totals[name].calls    += calls;
    totals[name].answered += answered;
    totals[name].demos    += demos;
    totals[name].showed   += showed;
    totals[name].closed   += closed;
    totals[name].cash     += cash;

    orgCalls    += calls;
    orgAnswered += answered;
    orgDemos    += demos;
    orgShowed   += showed;
    orgClosed   += closed;
    orgCash     += cash;
  });

  var leaderboard = Object.keys(totals).map(function(name) {
    var t = totals[name];
    return {
      name:      name,
      role:      "setter",
      calls:     t.calls,
      demos:     t.demos,
      showed:    t.showed,
      closed:    t.closed,
      cash:      t.cash,
      showRate:  pct(t.showed, t.demos),
      closeRate: pct(t.closed, t.demos),
    };
  });

  // Sort by cash collected desc
  leaderboard.sort(function(a, b) { return b.cash - a.cash; });

  return {
    leaderboard: leaderboard,
    org: {
      totalCalls:  orgCalls,
      totalDemos:  orgDemos,
      totalShowed: orgShowed,
      totalClosed: orgClosed,
      cashCollected: orgCash,
      showRate:    pct(orgShowed, orgDemos),
      closeRate:   pct(orgClosed, orgDemos),
    },
  };
}

// ─── Deal Log aggregation ─────────────────────────────────────────────────────
// "Deal Log" columns: Date | Client Name | Offer | Gross Amount | Processor | Processor Fee |
//   Net After Fees | Lead Source | Setter | Closer | ... | Deal ID
// Indices:          0     1           2       3             4            5
//   6                7              8       9
// Trend: group rows by date label, sum Gross Amount

function aggregateDealLog(dealLogId) {
  var ss = safeOpen(dealLogId);
  var rows = readTab(ss, "Deal Log");

  var totalRevenue = 0;
  var trendMap = {};

  rows.forEach(function(r) {
    var rawDate = r[0];
    var gross   = num(r[3]);
    totalRevenue += gross;

    // Format date label
    var label = "";
    if (rawDate instanceof Date) {
      label = (rawDate.getMonth() + 1) + "/" + rawDate.getDate();
    } else {
      label = String(rawDate).trim();
    }
    if (!label) return;
    trendMap[label] = (trendMap[label] || 0) + gross;
  });

  // Build trend array (last 30 entries, sorted by insertion order)
  var trendKeys = Object.keys(trendMap);
  var trend = trendKeys.slice(-30).map(function(k) {
    return { label: k, revenue: trendMap[k] };
  });

  return { totalRevenue: totalRevenue, trend: trend };
}

// ─── Staff sheet aggregation ──────────────────────────────────────────────────
// Read each setter's personal "Daily Activity" tab and merge into leaderboard.
// Columns: Date | Name | Calls Made | Calls Answered | Demos Set | Demos Showed |
//   Pitched | Closed | Cash Collected
// Indices: 0     1     2             3                4           5
//   6       7       8

function aggregateRepSheet(sheetId, repName, leaderboard) {
  var ss = safeOpen(sheetId);
  var rows = readTab(ss, "Daily Activity");
  if (!rows.length) return;

  var calls = 0, answered = 0, demos = 0, showed = 0, closed = 0, cash = 0;
  rows.forEach(function(r) {
    calls    += num(r[2]);
    answered += num(r[3]);
    demos    += num(r[4]);
    showed   += num(r[5]);
    closed   += num(r[7]);
    cash     += num(r[8]);
  });

  // Merge into leaderboard — find existing entry or add
  var entry = null;
  for (var i = 0; i < leaderboard.length; i++) {
    if (leaderboard[i].name.toLowerCase() === repName.toLowerCase()) {
      entry = leaderboard[i];
      break;
    }
  }
  if (entry) {
    // Prefer individual sheet data (more granular)
    entry.calls    = Math.max(entry.calls, calls);
    entry.demos    = Math.max(entry.demos, demos);
    entry.showed   = Math.max(entry.showed, showed);
    entry.closed   = Math.max(entry.closed, closed);
    entry.cash     = Math.max(entry.cash, cash);
    entry.showRate  = pct(entry.showed, entry.demos);
    entry.closeRate = pct(entry.closed, entry.demos);
  } else {
    leaderboard.push({
      name: repName, role: "setter",
      calls: calls, demos: demos, showed: showed,
      closed: closed, cash: cash,
      showRate: pct(showed, demos),
      closeRate: pct(closed, demos),
    });
  }
}

// ─── Staff directory ──────────────────────────────────────────────────────────
// Read staff from a "Staff" tab in the KPI Tracker sheet (or use hardcoded Leadwell team).

function getStaffList(kpiId) {
  var ss = safeOpen(kpiId);
  if (ss) {
    var sheet = ss.getSheetByName("Staff");
    if (sheet) {
      var rows = sheet.getDataRange().getValues().slice(1);
      return rows.map(function(r) {
        return { id: String(r[0]), name: String(r[1]), role: String(r[2]), status: String(r[3]) === "away" ? "away" : "active" };
      });
    }
  }
  // Fallback — hardcoded Leadwell team
  return [
    { id: "STF-0001", name: "Celest Fernandez", role: "Closer",  status: "active" },
    { id: "STF-0002", name: "Izaiah Dingman",   role: "Setter",  status: "active" },
    { id: "STF-0003", name: "Sylis Snyder",     role: "Setter",  status: "active" },
    { id: "STF-0004", name: "Fadi Lebsir",      role: "Setter",  status: "active" },
    { id: "STF-0005", name: "Kevin Korona",     role: "Setter",  status: "active" },
  ];
}

// ─── doGet ────────────────────────────────────────────────────────────────────

function doGet() {
  var props = getProps();

  var kpiResult  = aggregateKpiTracker(props.LEADWELL_KPI_ID);
  var dealResult = aggregateDealLog(props.LEADWELL_DEAL_LOG_ID);

  // Merge individual rep sheets into leaderboard
  var leaderboard = kpiResult.leaderboard;
  var repMap = {
    "Izaiah Dingman": props.IZAIAH_SHEET_ID,
    "Sylis Snyder":   props.SYLIS_SHEET_ID,
    "Fadi Lebsir":    props.FADI_SHEET_ID,
    "Kevin Korona":   props.KEVIN_SHEET_ID,
  };
  Object.keys(repMap).forEach(function(name) {
    aggregateRepSheet(repMap[name], name, leaderboard);
  });

  // Re-sort leaderboard after merge
  leaderboard.sort(function(a, b) { return b.cash - a.cash; });

  var org = kpiResult.org;
  var payload = {
    updatedAt: new Date().toISOString(),
    kpis: {
      revenue:       dealResult.totalRevenue,
      cashCollected: org.cashCollected,
      totalCalls:    org.totalCalls,
      totalDemos:    org.totalDemos,
      totalClosed:   org.totalClosed,
      showRate:      org.showRate,
      closeRate:     org.closeRate,
      activeSetters: leaderboard.length,
    },
    trend:       dealResult.trend,
    leaderboard: leaderboard,
    staff:       getStaffList(props.LEADWELL_KPI_ID),
  };

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── doPost ───────────────────────────────────────────────────────────────────

function doPost(e) {
  var body  = JSON.parse(e.postData.contents);
  var props = getProps();
  var kpiSS = safeOpen(props.LEADWELL_KPI_ID);

  // PATCH: update staff status in Staff tab of KPI Tracker
  if (body._action === "patch" && body.id && body.status && kpiSS) {
    var staffSheet = kpiSS.getSheetByName("Staff");
    if (staffSheet) {
      var rows = staffSheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(body.id)) {
          staffSheet.getRange(i + 1, 4).setValue(body.status);
          return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Not found" })).setMimeType(ContentService.MimeType.JSON);
  }

  // POST: add new staff member
  if (!kpiSS) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "KPI sheet not configured" })).setMimeType(ContentService.MimeType.JSON);
  }
  var sSheet = kpiSS.getSheetByName("Staff");
  if (!sSheet) {
    // Create Staff tab if it doesn't exist
    kpiSS.insertSheet("Staff").appendRow(["ID", "Name", "Role", "Status"]);
    sSheet = kpiSS.getSheetByName("Staff");
  }
  var allRows = sSheet.getDataRange().getValues().slice(1);
  var maxNum  = 0;
  allRows.forEach(function(r) {
    var m = String(r[0]).match(/STF-(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
  });
  var newId = "STF-" + ("000" + (maxNum + 1)).slice(-4);
  sSheet.appendRow([newId, body.name || "", body.role || "", body.status || "active"]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, id: newId }))
    .setMimeType(ContentService.MimeType.JSON);
}
