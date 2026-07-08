import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "artifacts", "interfreight", "dist", "public");
const target = path.join(root, "public");

if (!fs.existsSync(source)) {
  throw new Error(`Vercel output source was not found: ${source}`);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });
