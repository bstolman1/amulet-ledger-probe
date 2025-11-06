/**
 * Fetch ACS data from Canton Network
 * Runs in GitHub Actions with no IP restrictions
 */

import axios from "axios";
import fs from "fs";
import BigNumber from "bignumber.js";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const BASE_URL = process.env.BASE_URL || "https://scan.sv-1.global.canton.network.sync.global/api/scan";

function isTemplate(e, moduleName, entityName) {
  const t = e?.template_id;
  if (!t) return false;
  const parts = t.split(":");
  const entity = parts.pop();
  const module_ = parts.pop();
  return module_ === moduleName && entity === entityName;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeFileName(templateId) {
  return templateId.replace(/[:.]/g, "_");
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
  console.log("📦 Fetching ACS snapshot and exporting per-template files…");

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

  const outputDir = "./acs_full";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

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

      const pageTemplates = new Set();

      for (const e of events) {
        const id = e.contract_id || e.event_id;
        if (id && seen.has(id)) continue;
        seen.add(id);

        const templateId = e.template_id || "unknown";
        const pkg = templateId.split(":")[0] || "unknown";
        perPackage[pkg] ||= { amulet: new BigNumber(0), locked: new BigNumber(0) };
        templatesByPackage[pkg] ||= new Set();
        templatesData[templateId] ||= [];

        templatesByPackage[pkg].add(templateId);
        pageTemplates.add(templateId);

        const { create_arguments } = e;
        templatesData[templateId].push(create_arguments || {});

        if (isTemplate(e, "Splice.Amulet", "Amulet")) {
          const amount = new BigNumber(create_arguments?.amount?.initialAmount ?? "0");
          amuletTotal = amuletTotal.plus(amount);
          perPackage[pkg].amulet = perPackage[pkg].amulet.plus(amount);
        } else if (isTemplate(e, "Splice.Amulet", "LockedAmulet")) {
          const amount = new BigNumber(create_arguments?.amulet?.amount?.initialAmount ?? "0");
          lockedTotal = lockedTotal.plus(amount);
          perPackage[pkg].locked = perPackage[pkg].locked.plus(amount);
        }
      }

      allEvents.push(...events);

      // Safe console output (works in all environments)
      if (process.stdout.clearLine && process.stdout.cursorTo) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(
          `📄 Page ${page} | Amulet: ${amuletTotal.toFixed(4)} | Locked: ${lockedTotal.toFixed(4)}`
        );
      } else {
        console.log(`📄 Page ${page} | Amulet: ${amuletTotal.toFixed(4)} | Locked: ${lockedTotal.toFixed(4)}`);
      }

      console.log(`\n   Templates on this page:`);
      for (const t of pageTemplates) console.log(`      • ${t}`);

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

      const match = msg.match(/range\s*\((\d+)\s*to\s*(\d+)\)/i);
      if (match) {
        const minRange = parseInt(match[1]);
        const maxRange = parseInt(match[2]);
        console.log(`📘 Detected snapshot range: ${minRange}–${maxRange}`);
        after = minRange;
        console.log(`🔁 Restarting from offset ${after}…`);
        continue;
      }
      throw err;
    }
  }

  console.log(`\n✅ Fetched ${allEvents.length.toLocaleString()} ACS entries.`);

  // 🧾 Write per-template JSON files
  for (const [templateId, data] of Object.entries(templatesData)) {
    const fileName = `${outputDir}/${safeFileName(templateId)}.json`;
    fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
  }
  console.log(`📂 Exported ${Object.keys(templatesData).length} template files to ${outputDir}/`);

  // 📊 Package summaries
  console.log("\n📊 Per-package totals:");
  for (const [pkg, vals] of Object.entries(perPackage)) {
    console.log(
      `  ${pkg.slice(0, 12)}…  Amulet: ${vals.amulet.toFixed(10)} | Locked: ${vals.locked.toFixed(10)}`
    );
  }

  const canonicalPkgEntry = Object.entries(perPackage).sort(
    (a, b) => b[1].amulet.minus(a[1].amulet)
  )[0];
  const canonicalPkg = canonicalPkgEntry ? canonicalPkgEntry[0] : "unknown";

  const canonicalTemplates = templatesByPackage[canonicalPkg]
    ? Array.from(templatesByPackage[canonicalPkg])
    : [];

  console.log(`\n📦 Canonical package detected: ${canonicalPkg}`);
  console.log(`📜 Templates found in canonical package (${canonicalPkg}):`);
  for (const t of canonicalTemplates) console.log(`   • ${t}`);

  return { allEvents, amuletTotal, lockedTotal, canonicalPkg, canonicalTemplates };
}

async function run() {
  try {
    const migration_id = await detectLatestMigration(BASE_URL);
    const record_time = await fetchSnapshotTimestamp(BASE_URL, migration_id);
    const { allEvents, amuletTotal, lockedTotal, canonicalPkg, canonicalTemplates } =
      await fetchAllACS(BASE_URL, migration_id, record_time);

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
      entry_count: allEvents.length,
    };

    fs.writeFileSync("circulating-supply-single-sv.json", JSON.stringify(summary, null, 2));
    console.log("💾 Saved summary to circulating-supply-single-sv.json");
  } catch (err) {
    console.error("❌ Fatal error:", err.message);
    if (err.response) console.error("Response:", err.response.data);
    process.exit(1);
  }
}

run();
