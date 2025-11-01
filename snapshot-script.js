/**
 * ✅ Full ACS Exporter + Live Template Telemetry (Supabase-ready, 10-decimal safe)
 * ✔ No exclusions — exports ALL templates, raw create_arguments per template
 * ✔ Live console: per-page template counts + key numeric field sums (only if present)
 * ✔ Exact math (BigNumber): Amulet, LockedAmulet, and per-template numeric fields
 * ✔ Per-template JSON files with metadata in ./acs_full/
 * ✔ Overall summary (circulating-supply-single-sv.json)
 * ✔ Per-template telemetry (circulating-supply-single-sv.templates.json)
 */
const axios = require("axios");
const fs = require("fs");
const BigNumber = require("bignumber.js");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const BASE_URL = "https://scan.sv-1.global.canton.network.sync.global/api/scan";

// ---------- Helpers ----------
function isTemplate(e, moduleName, entityName) {
  const t = e?.template_id;
  if (!t) return false;
  const parts = t.split(":");
  const entity = parts.pop();
  const module_ = parts.pop();
  return module_ === moduleName && entity === entityName;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeFileName(templateId) {
  return templateId.replace(/[:.]/g, "_");
}

const SHOW_FIELDS = ["initialAmount", "voteWeight", "stake", "tokens", "weight", "value"];
const STATUS_KEYS = ["status", "state", "phase", "result"];
const DECIMAL_RE = /^[+-]?\d+(\.\d+)?$/;

function analyzeArgs(args, agg) {
  if (!args || typeof args !== "object") return;

  const candidates = [
    args?.amount?.initialAmount,
    args?.amulet?.amount?.initialAmount,
    args?.stake?.initialAmount,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && DECIMAL_RE.test(c)) {
      addField(agg, "initialAmount", new BigNumber(c));
    }
  }

  const stack = [args];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;

    for (const [k, v] of Object.entries(cur)) {
      if (STATUS_KEYS.includes(k) && typeof v === "string" && v.length) {
        agg.status ||= {};
        agg.status[v] = (agg.status[v] || 0) + 1;
      }

      if (typeof v === "string" && DECIMAL_RE.test(v) && v.includes(".")) {
        if (!/id|hash|cid|guid|index/i.test(k)) {
          addField(agg, k, new BigNumber(v));
        }
      }

      if (v && typeof v === "object") stack.push(v);
    }
  }
}

function addField(agg, fieldName, bnVal) {
  if (!bnVal || !bnVal.isFinite()) return;
  agg.fields ||= {};
  const prev = agg.fields[fieldName];
  agg.fields[fieldName] = prev ? prev.plus(bnVal) : new BigNumber(bnVal);
}

async function detectLatestMigration(baseUrl) {
  console.log("🔎 Probing for latest valid migration ID...");
  let id = 1;
  let latest = null;
  while (true) {
    try {
      const res = await axios.get(`${baseUrl}/v0/state/acs/snapshot-timestamp`, {
        params: { before: new Date().toISOString(), migration_id: id },
      });
      if (res.data?.record_time) {
        latest = id;
        id++;
      } else break;
    } catch {
      break;
    }
  }
  if (!latest) throw new Error("No valid migration found.");
  console.log(`📘 Using latest migration_id: ${latest}`);
  return latest;
}

async function fetchSnapshotTimestamp(baseUrl, migration_id) {
  const res = await axios.get(`${baseUrl}/v0/state/acs/snapshot-timestamp`, {
    params: { before: new Date().toISOString(), migration_id },
  });

  let record_time = res.data.record_time;
  console.log(`📅 Initial snapshot timestamp: ${record_time}`);

  const verify = await axios.get(`${baseUrl}/v0/state/acs/snapshot-timestamp`, {
    params: { before: record_time, migration_id },
  });
  if (verify.data?.record_time && verify.data.record_time !== record_time) {
    record_time = verify.data.record_time;
    console.log(`🔁 Updated to verified snapshot: ${record_time}`);
  }
  return record_time;
}

async function fetchAllACS(baseUrl, migration_id, record_time) {
  console.log("📦 Fetching ACS snapshot, exporting per template + live telemetry…");

  const outputDir = "./acs_full";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const allEvents = [];
  let after = 0;
  const pageSize = 1000;
  let page = 1;
  const seen = new Set();

  let amuletTotal = new BigNumber(0);
  let lockedTotal = new BigNumber(0);

  const perPackage = {};
  const templatesByPackage = {};
  const templatesData = {};
  const templateStats = {};

  while (true) {
    try {
      const res = await axios.post(
        `${baseUrl}/v0/state/acs`,
        {
          migration_id,
          record_time,
          page_size: pageSize,
          after,
          daml_value_encoding: "compact_json",
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const events = res.data.created_events || [];
      const rangeTo = res.data.range?.to;
      if (!events.length) {
        console.log("\n✅ No more events — finished.");
        break;
      }

      const pageTemplates = new Map();

      for (const e of events) {
        const id = e.contract_id || e.event_id;
        if (id && seen.has(id)) continue;
        seen.add(id);

        const templateId = e.template_id || "unknown";
        const pkg = templateId.split(":")[0] || "unknown";
        const args = e.create_arguments || {};

        perPackage[pkg] ||= { amulet: new BigNumber(0), locked: new BigNumber(0) };
        templatesByPackage[pkg] ||= new Set();
        templatesByPackage[pkg].add(templateId);

        templatesData[templateId] ||= [];
        templateStats[templateId] ||= { count: 0 };

        templatesData[templateId].push(args);
        templateStats[templateId].count += 1;
        pageTemplates.set(templateId, {
          count: (pageTemplates.get(templateId)?.count || 0) + 1,
        });

        analyzeArgs(args, templateStats[templateId]);

        if (isTemplate(e, "Splice.Amulet", "Amulet")) {
          const val = args?.amount?.initialAmount ?? "0";
          if (typeof val === "string" && DECIMAL_RE.test(val)) {
            const bn = new BigNumber(val);
            amuletTotal = amuletTotal.plus(bn);
            perPackage[pkg].amulet = perPackage[pkg].amulet.plus(bn);
          }
        } else if (isTemplate(e, "Splice.Amulet", "LockedAmulet")) {
          const val = args?.amulet?.amount?.initialAmount ?? "0";
          if (typeof val === "string" && DECIMAL_RE.test(val)) {
            const bn = new BigNumber(val);
            lockedTotal = lockedTotal.plus(bn);
            perPackage[pkg].locked = perPackage[pkg].locked.plus(bn);
          }
        }
      }

      allEvents.push(...events);

      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(
        `📄 Page ${page} | Amulet: ${amuletTotal.toFixed(4)} | Locked: ${lockedTotal.toFixed(4)}`
      );

      console.log(`\n   🧩 Template summary on this page:`);

      for (const [tid, { count }] of pageTemplates.entries()) {
        const stats = templateStats[tid] || {};
        let fieldLabel = "";
        let fieldVal = "";

        if (stats.fields) {
          for (const key of SHOW_FIELDS) {
            if (stats.fields[key]) {
              fieldLabel = key;
              fieldVal = stats.fields[key].toFixed(10);
              break;
            }
          }
        }

        if (fieldLabel) {
          console.log(`      • ${tid} ${".".repeat(Math.max(1, 45 - tid.length))} ${String(count).padStart(5)}  (Σ ${fieldLabel}: ${fieldVal})`);
        } else {
          console.log(`      • ${tid} ${".".repeat(Math.max(1, 45 - tid.length))} ${String(count).padStart(5)}`);
        }

        if (stats.status) {
          const compact = Object.entries(stats.status)
            .slice(0, 4)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ");
          if (compact) console.log(`         ↳ status: ${compact}${Object.keys(stats.status).length > 4 ? ", ..." : ""}`);
        }
      }

      if (events.length < pageSize) {
        console.log("\n✅ Last page reached.");
        break;
      }

      after = rangeTo ?? after + events.length;
      page++;
      await sleep(100);
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      console.error(`\n⚠️ Page ${page} failed: ${msg}`);

      const match = msg?.match?.(/range\s*\((\d+)\s*to\s*(\d+)\)/i);
      if (match) {
        const minRange = parseInt(match[1]);
        console.log(`📘 Detected snapshot range start: ${minRange}`);
        after = minRange;
        console.log(`🔁 Restarting from offset ${after}…`);
        continue;
      }
      throw err;
    }
  }

  console.log(`\n✅ Fetched ${allEvents.length.toLocaleString()} ACS entries.`);

  const canonicalPkgEntry = Object.entries(perPackage).sort(
    (a, b) => b[1].amulet.minus(a[1].amulet)
  )[0];
  const canonicalPkg = canonicalPkgEntry ? canonicalPkgEntry[0] : "unknown";
  const canonicalTemplates = templatesByPackage[canonicalPkg] ? Array.from(templatesByPackage[canonicalPkg]) : [];

  console.log(`\n📦 Canonical package detected: ${canonicalPkg}`);
  console.log(`📜 Templates in canonical package:`);
  for (const t of canonicalTemplates) console.log(`   • ${t}`);

  for (const [templateId, data] of Object.entries(templatesData)) {
    const fileName = `./acs_full/${safeFileName(templateId)}.json`;
    const header = {
      metadata: {
        template_id: templateId,
        canonical_package: canonicalPkg,
        migration_id,
        record_time,
        timestamp: new Date().toISOString(),
        entry_count: data.length,
      },
      data,
    };
    fs.writeFileSync(fileName, JSON.stringify(header, null, 2));
  }
  console.log(`📂 Exported ${Object.keys(templatesData).length} template files to ./acs_full/`);

  return {
    amuletTotal,
    lockedTotal,
    canonicalPkg,
    canonicalTemplates,
    templateStats,
    entryCount: allEvents.length,
  };
}

async function run() {
  try {
    const migration_id = await detectLatestMigration(BASE_URL);
    const record_time = await fetchSnapshotTimestamp(BASE_URL, migration_id);

    const {
      amuletTotal,
      lockedTotal,
      canonicalPkg,
      canonicalTemplates,
      templateStats,
      entryCount,
    } = await fetchAllACS(BASE_URL, migration_id, record_time);

    const circulating = amuletTotal.minus(lockedTotal);

    console.log("\n\n🌍 Circulating Supply Summary:");
    console.log("-------------------------------------------");
    console.log(`💎 Total Amulet:        ${amuletTotal.toFixed(10)}`);
    console.log(`🔒 Total LockedAmulet:  ${lockedTotal.toFixed(10)}`);
    console.log("-------------------------------------------");
    console.log(`🌐 Circulating Supply:  ${circulating.toFixed(10)}`);
    console.log(`📦 Canonical Package:   ${canonicalPkg}`);
    console.log(`📘 Migration ID:        ${migration_id}`);
    console.log(`⏰ Record Time (UTC):   ${record_time}`);
    console.log("-------------------------------------------");

    const summary = {
      timestamp: new Date().toISOString(),
      migration_id,
      record_time,
      sv_url: BASE_URL,
      canonical_package: canonicalPkg,
      canonical_templates: canonicalTemplates,
      totals: {
        amulet: amuletTotal.toFixed(10),
        locked: lockedTotal.toFixed(10),
        circulating: circulating.toFixed(10),
      },
      entry_count: entryCount,
    };
    fs.writeFileSync("circulating-supply-single-sv.json", JSON.stringify(summary, null, 2));
    console.log("💾 Saved: circulating-supply-single-sv.json");

    const telemetry = {};
    for (const [tid, stat] of Object.entries(templateStats)) {
      const out = { count: stat.count };
      if (stat.fields) {
        out.fields = {};
        for (const [fname, fBN] of Object.entries(stat.fields)) {
          if (BigNumber.isBigNumber(fBN)) out.fields[fname] = fBN.toFixed(10);
        }
      }
      if (stat.status) out.status = stat.status;
      telemetry[tid] = out;
    }
    fs.writeFileSync(
      "circulating-supply-single-sv.templates.json",
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          migration_id,
          record_time,
          canonical_package: canonicalPkg,
          templates: telemetry,
        },
        null,
        2
      )
    );
    console.log("💾 Saved: circulating-supply-single-sv.templates.json");
  } catch (err) {
    console.error("❌ Fatal error:", err.message);
    if (err.response) console.error("Response:", err.response.data);
    process.exit(1);
  }
}

run();
