/**
 * One-time script to re-process all uploaded Status Report Excel files.
 */
import ExcelJS from "./node_modules/.pnpm/exceljs@4.4.0/node_modules/exceljs/dist/es5/exceljs.nodejs.js";
import pg from "./node_modules/.pnpm/pg@8.22.0/node_modules/pg/lib/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "artifacts/api-server/uploads");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function companyFromFilename(filename) {
  const match = filename.match(/Status Report\s*-\s*(.+?)\.xlsx?$/i);
  return match?.[1]?.trim() ?? null;
}

function cellStr(val) {
  if (val === null || val === undefined) return undefined;
  if (typeof val === "object" && "richText" in val)
    return val.richText.map(rt => rt.text).join("").trim() || undefined;
  if (val instanceof Date) return val.toISOString().split("T")[0];
  const s = String(val).trim();
  return s || undefined;
}

/** Detect column offset (1 or 2) for IFS Ref in a header row */
function detectColOffset(vals) {
  for (let i = 1; i <= 3; i++) {
    if (cellStr(vals[i])?.toLowerCase() === "ifs ref") return i;
  }
  return null;
}

/** True if a row is a section title (merged — most cells identical) */
function isSectionTitle(vals) {
  const cells = vals.slice(1).map(v => cellStr(v)).filter(Boolean);
  if (cells.length < 2) return false;
  return cells.every(c => c === cells[0]);
}

let autoIdx = 1;
function autoIfsRef(companyName) {
  return `AUTO-${companyName.replace(/\s+/g, "-").toUpperCase()}-${String(autoIdx++).padStart(4, "0")}`;
}

async function upsertShipment(client, record) {
  const existing = await client.query(
    "SELECT id FROM shipments WHERE ifs_ref = $1 LIMIT 1",
    [record.ifsRef]
  );
  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE shipments SET mra_ref=$1, container_no=$2, shipper=$3, consignee=$4,
       cargo_description=$5, invoice_no=$6, pod=$7, entry=$8,
       final_port_destination=$9, status=$10, company_name=$11, last_updated=NOW()
       WHERE id=$12`,
      [record.mraRef||null, record.containerNo||null, record.shipper||null,
       record.consignee||null, record.cargoDescription||null, record.invoiceNo||null,
       record.pod||null, record.entry||null, record.finalPortDestination||null,
       record.status, record.companyName, existing.rows[0].id]
    );
    return "updated";
  }
  await client.query(
    `INSERT INTO shipments (ifs_ref, mra_ref, container_no, shipper, consignee,
     cargo_description, invoice_no, pod, entry, final_port_destination, status, company_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [record.ifsRef, record.mraRef||null, record.containerNo||null,
     record.shipper||null, record.consignee||null, record.cargoDescription||null,
     record.invoiceNo||null, record.pod||null, record.entry||null,
     record.finalPortDestination||null, record.status, record.companyName]
  );
  return "new";
}

async function processFile(client, filePath, companyName) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) return { totalRows: 0, newRecords: 0, updatedRecords: 0, failed: 0 };

  let totalRows = 0, newRecords = 0, updatedRecords = 0, failed = 0;
  let colOffset = null; // column index where IFS Ref lives

  for (let r = 1; r <= ws.rowCount; r++) {
    const vals = ws.getRow(r).values;
    if (!vals || vals.length <= 1) { colOffset = null; continue; }

    // Section title row (merged cells) → end current data section
    if (isSectionTitle(vals)) { colOffset = null; continue; }

    // Header row → detect column offset, start data section
    const detected = detectColOffset(vals);
    if (detected !== null) { colOffset = detected; continue; }

    // Not in a data section
    if (colOffset === null) continue;

    // Check if there's any real data in this row
    const o = colOffset;
    const ifsRef   = cellStr(vals[o]);
    const mraRef   = cellStr(vals[o + 1]);
    const shipper  = cellStr(vals[o + 2]);
    const consignee = cellStr(vals[o + 3]);
    const containerNo = cellStr(vals[o + 4]);
    const cargoDesc = cellStr(vals[o + 5]);
    const invoiceNo = cellStr(vals[o + 6]);
    const pod       = cellStr(vals[o + 7]);
    const entry     = cellStr(vals[o + 8]);
    const fpd       = cellStr(vals[o + 9]);
    const status    = cellStr(vals[o + 10]);

    // Skip rows with no useful data at all
    const hasData = [ifsRef, mraRef, shipper, consignee, containerNo, cargoDesc].some(Boolean);
    if (!hasData) continue;

    // Use IFS Ref if present, else auto-generate
    const finalIfsRef = ifsRef ?? autoIfsRef(companyName);

    totalRows++;
    try {
      const result = await upsertShipment(client, {
        ifsRef: finalIfsRef,
        mraRef, shipper, consignee, containerNo,
        cargoDescription: cargoDesc,
        invoiceNo, pod, entry,
        finalPortDestination: fpd,
        status: status ?? "In Transit",
        companyName,
      });
      await client.query(
        "INSERT INTO companies (company_name) VALUES ($1) ON CONFLICT DO NOTHING",
        [companyName]
      );
      if (result === "new") newRecords++; else updatedRecords++;
    } catch (err) {
      failed++;
      console.error(`  [${companyName}] Row ${r} failed: ${err.message}`);
    }
  }
  return { totalRows, newRecords, updatedRecords, failed };
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("Clearing old shipment data...");
    await client.query("DELETE FROM shipments");
    await client.query("DELETE FROM companies");
    console.log("Cleared.\n");

    const allFiles = fs.readdirSync(uploadsDir).filter(f => /\.xlsx?$/.test(f));
    // Deduplicate by original name (strip timestamp prefix), keep latest
    const seen = new Map();
    for (const f of allFiles.sort()) {
      seen.set(f.replace(/^\d+-/, ""), f);
    }

    const files = [...seen.values()];
    console.log(`Processing ${files.length} unique files...\n`);

    let totalRows = 0, totalNew = 0, totalUpdated = 0, skipped = 0;

    for (const filename of files) {
      const company = companyFromFilename(filename);
      if (!company) { skipped++; console.log(`SKIP: ${filename}`); continue; }
      const stats = await processFile(client, path.join(uploadsDir, filename), company);
      totalRows += stats.totalRows;
      totalNew += stats.newRecords;
      totalUpdated += stats.updatedRecords;
      const note = stats.totalRows === 0 ? " (no active shipments)" : ` (${stats.newRecords} new, ${stats.updatedRecords} updated${stats.failed ? `, ${stats.failed} failed` : ""})`;
      console.log(`✓ ${company}: ${stats.totalRows} rows${note}`);
    }

    console.log(`\nDone. ${totalRows} shipments — ${totalNew} new, ${totalUpdated} updated. ${skipped} skipped.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
