import * as fs from "fs";
import * as path from "path";
import { parseTML } from "./parser2";
import { TMLDocument, TMLClass, TMLAttribute, TMLReference, TMLType } from "../TMLTools/metamodel";

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkifyUnderscored(text: string, classSet: Set<string>): string {
  // Replace occurrences of _Identifier with links to #Identifier if it exists, else red span
  return text.replace(/\b_([A-Za-z_]\w*)\b/g, (m, p1) => {
    const name = p1;
    if (classSet.has(name)) {
      return `<a href="#${encodeURIComponent(name)}" class="xref">${escapeHTML(name)}</a>`;
    } else {
      return `<span class="missing">${escapeHTML(name)}</span>`;
    }
  });
}

function typeToHTML(type: string | TMLType, classSet: Set<string>): string {
  if (typeof type !== "string") {
    // enum inline: values joined by |
    const values = (type.values || []).map(escapeHTML).join(" | ");
    return values;
  }
  const name = type;
  if (classSet.has(name)) {
    return `<a href="#${encodeURIComponent(name)}" class="xref">${escapeHTML(name)}</a>`;
  }
  // scalar types or missing class
  const scalars = new Set(["String", "Integer", "Real", "Image", "Boolean", "Markdown", "URL", "JSON"]);
  if (scalars.has(name)) return escapeHTML(name);
  return `<span class="missing">${escapeHTML(name)}</span>`;
}

function multiplicityToText(min: number, max: number | "*"): string {
  if (min === 1 && max === 1) return "";
  return ` [${min}..${max}]`;
}

function classSummaryTitle(cls: TMLClass): string {
  const parts: string[] = ["<b>" + escapeHTML(cls.name) + "</b>"];
  if (cls.superClass) parts.push(`<span class="extends"> &gt; ${escapeHTML(cls.superClass)}</span>`);
  return parts.join("");
}

function renderClass(cls: TMLClass, classSet: Set<string>): string {
  const id = encodeURIComponent(cls.name);
  const hasDoc = !!cls.description;
  const docHTML = hasDoc ? linkifyUnderscored(escapeHTML(cls.description!), classSet).replace(/\n/g, "<br>") : "";

  const rows: string[] = [];
  for (const a of cls.attributes) {
    const t = typeToHTML(a.type, classSet);
    rows.push(`<li class="member attr">- ${escapeHTML(a.derived ? "/" + a.name : a.name)}: ${t}${multiplicityToText(a.multiplicity.min, a.multiplicity.max)}</li>`);
  }
  for (const r of cls.references) {
    const t = typeToHTML(r.target, classSet);
    const ord = r.ordered ? "{ordered}" : "";
    const opp = r.opposite ? ` opposite of ${escapeHTML(r.opposite)}` : "";
    rows.push(`<li class="member ref">- ${escapeHTML(r.derived ? "/" + r.name : r.name)}: ${t}${multiplicityToText(r.multiplicity.min, r.multiplicity.max)}${ord}${opp}</li>`);
  }
  for (const op of cls.operations) {
    rows.push(`<li class="member op">- ${escapeHTML(op.name)}()</li>`);
  }

  return `
  <section class="class" id="${id}">
    <details open>
      <summary>
        ${classSummaryTitle(cls)}
        ${hasDoc ? `<span class="doc-badge" tabindex="0">ⓘ<span class="popup">${docHTML}</span></span>` : ""}
      </summary>
      <ul class="members">${rows.join("")}</ul>
    </details>
  </section>`;
}

function renderHTML(doc: TMLDocument, title: string): string {
  const classSet = new Set(doc.classes.map((c) => c.name));
  const classesSorted = [...doc.classes].sort((a, b) => a.name.localeCompare(b.name));
  const sidebar = classesSorted.map((c) => `<li><a href="#${encodeURIComponent(c.name)}">${escapeHTML(c.name)}</a></li>`).join("");
  const content = doc.classes.map((c) => renderClass(c, classSet)).join("\n\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHTML(title)}</title>
  <style>
    :root {
      --bg: #0f172a;
      --panel: #111827;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --link: #38bdf8;
      --accent: #22c55e;
      --danger: #ef4444;
      --border: #1f2937;
    }
    html, body { height: 100%; margin: 0; background: var(--bg); color: var(--text); font-family: Inter, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
    .container { display: grid; grid-template-columns: 260px 1fr; height: 100vh; }
    .sidebar { background: var(--panel); border-right: 1px solid var(--border); padding: 16px; overflow: auto; }
    .sidebar h2 { margin: 0 0 8px 0; font-size: 16px; color: var(--muted); }
    .sidebar ul { list-style: none; margin: 0; padding: 0; }
    .sidebar li { margin: 4px 0; }
    .sidebar a { color: var(--link); text-decoration: none; }
    .sidebar a:hover { text-decoration: underline; }
    .content { padding: 16px; overflow: auto; }
    .class { margin: 8px 0 16px; border: 1px solid var(--border); border-radius: 8px; background: #0b1220; }
    details > summary { cursor: pointer; list-style: none; padding: 10px 12px; font-size: 16px; }
    details > summary::-webkit-details-marker { display: none; }
    details[open] > summary { border-bottom: 1px solid var(--border); }
    b { font-weight: 700; }
    .extends { color: var(--muted); margin-left: 6px; }
    .members { list-style: none; margin: 0; padding: 8px 14px 14px 18px; }
    .member { margin: 4px 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .xref { color: var(--accent); text-decoration: none; }
    .xref:hover { text-decoration: underline; }
    .missing { color: var(--danger); font-weight: 600; }
    .doc-badge { position: relative; display: inline-block; margin-left: 8px; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 0 6px; font-size: 12px; line-height: 18px; }
    .doc-badge .popup { display: none; position: absolute; z-index: 10; top: 22px; left: 0; min-width: 260px; max-width: 520px; background: #111827; color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .doc-badge:hover .popup, .doc-badge:focus .popup { display: block; }
    .doc-badge .popup a { color: var(--link); }
  </style>
</head>
<body>
  <div class="container">
    <aside class="sidebar">
      <h2>Classes</h2>
      <ul>${sidebar}</ul>
    </aside>
    <main class="content">
      ${content}
    </main>
  </div>
</body>
</html>`;
}

function main() {
  const inputPath = process.argv[2];
  const outputPathArg = process.argv[3];
  if (!inputPath) {
    console.error("Usage: ts-node tml/tml2html.ts <input.tml> [output.html]");
    process.exit(1);
  }
  const src = fs.readFileSync(path.resolve(inputPath), "utf8");
  const doc = parseTML(src);
  const title = path.basename(inputPath);
  const html = renderHTML(doc, title);
  const outputPath = outputPathArg ? path.resolve(outputPathArg) : path.resolve(inputPath.replace(/\.tml$/i, "") + ".html");
  fs.writeFileSync(outputPath, html, "utf8");
  console.log(`Generated: ${outputPath}`);
}

if (require.main === module) {
  main();
}
