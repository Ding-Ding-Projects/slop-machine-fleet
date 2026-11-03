import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

function within(root, target) {
  const relative = path.relative(root, target);
  return (
    relative !== "" &&
    !relative.startsWith(".." + path.sep) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}
export async function readContainedFile(root, file, maxBytes) {
  const base = path.resolve(root),
    target = path.resolve(file);
  if (!within(base, target)) throw Error("Source escapes documentation root");
  let current = base;
  for (const part of path.relative(base, target).split(path.sep)) {
    current = path.join(current, part);
    const entry = await fs.lstat(current);
    if (entry.isSymbolicLink())
      throw Error("Documentation symlinks are not supported");
  }
  const [realRoot, realTarget] = await Promise.all([
    fs.realpath(base),
    fs.realpath(target),
  ]);
  if (!within(realRoot, realTarget))
    throw Error("Source escapes documentation root");
  const handle = await fs.open(realTarget, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile())
      throw Error("Documentation source must be a regular file");
    if (stat.size > maxBytes)
      throw Error("Documentation source exceeds size limit");
    const bytes = await handle.readFile();
    if (bytes.length > maxBytes)
      throw Error("Documentation source exceeds size limit");
    const after = await handle.stat();
    if (stat.size !== after.size || stat.mtimeMs !== after.mtimeMs)
      throw Error("Documentation source changed during reading");
    return bytes;
  } finally {
    await handle.close();
  }
}

// The replaced directory is preserved outside public output, never recursively deleted.
export async function replaceGenerated(app, stage) {
  const base = path.resolve(app),
    publicRoot = path.join(base, "public"),
    target = path.join(publicRoot, "generated");
  if (
    path.dirname(path.resolve(stage)) !== base ||
    !path.basename(stage).startsWith(".generated-stage-")
  )
    throw Error("Invalid staging ownership");
  for (const dir of [base, publicRoot, stage]) {
    const stat = await fs.lstat(dir);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw Error("Generated paths must be real directories");
  }
  const existing = await fs.lstat(target).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing && (existing.isSymbolicLink() || !existing.isDirectory()))
    throw Error("Generated output must be a real directory");
  const retired = path.join(base, ".generated-retired-" + crypto.randomUUID());
  if (existing) await fs.rename(target, retired);
  try {
    await fs.rename(stage, target);
  } catch (error) {
    if (existing) await fs.rename(retired, target);
    throw error;
  }
  return existing ? retired : null;
}
