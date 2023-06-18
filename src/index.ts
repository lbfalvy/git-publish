import process from "process"
import { isClean } from "./isClean";
// This would be much more readable as a named import, but isogit is huge so tree-shaking is needed
// whenever possible
import {
  add, branch, CallbackFsClient, checkout, commit, currentBranch,
  GitAuth, HttpClient, listBranches, listFiles, PromiseFsClient, push, remove
} from "isomorphic-git";
import { Stats } from "fs";

interface Path {
  join: (...argv: string[]) => string;
}

interface PublishOpts {
  fs: PromiseFsClient;
  path: Path;
  http?: HttpClient;
  targetBranch: string;
  generate: () => Promise<void>;
  pubpath: string | string[];
  dir: string;
  onAuth?: (url: string, auth: GitAuth) => void | GitAuth | Promise<void | GitAuth>;
  commitMessage?: string;
  remote?: string;
}

async function visitAllFiles(
  fs: PromiseFsClient,
  path: Path,
  filepath: string,
  cb: (filepath: string) => void | Promise<void>
): Promise<void> {
  const fsp = fs.promises;
  const stats: Stats = await fsp.stat(filepath);
  if (stats.isDirectory()) {
    const items: string[] = await fsp.readdir(filepath);
    const tasks = items
        .filter(n => n != ".git")
        .map(item => visitAllFiles(fs, path, path.join(filepath, item), cb))
    await Promise.all(tasks);
  } else {
    await cb(filepath);
  }
}

/** Publish a folder to another branch
 * 
 * The target branch will be created if it doesn't exist yet. A single orphan commit will be created
 * which contains just the specified folder and nothing else. The history of the target branch will
 * be destroyed.
 * 
 * If `onAuth` is provided, the target branch will be pushed to the specified remote or origin by
 * default. If your remote allows anonymous writes, `onAuth` can return undefined. If `onAuth` is
 * omitted, no push is attempted.
 * 
 * The function attempts to restore the starting branch before throwing in case of errors.
 */
export async function publish(opts: PublishOpts) {
  // mandatory parameters
  const { fs, path, http, dir, targetBranch, onAuth, pubpath, generate } = opts;
  // default parameters
  const remote = opts.remote ?? "origin";
  const commitMessage = opts.commitMessage ?? `Published`;
  const targetRef = `refs/heads/${targetBranch}`;
  // shared parameters across all git commands
  const cfg = { fs, dir, remote };
  // remember the branch we are publishing from
  const sourceBranch = await currentBranch(cfg);
  const sourceRef = `refs/heads/${sourceBranch}`;
  const isTarget = Array.isArray(pubpath)
    ? (filepath: string) => pubpath.some(p => filepath.startsWith(p))
    : (filepath: string) => filepath.startsWith(pubpath);

  // ensure that the repository is in a sensible state
  if (sourceBranch === undefined) throw new Error("Cannot publish with detached HEAD!");
  if (sourceBranch === targetBranch) throw new Error("Cannot publish to current branch");
  if (!await isClean(cfg)) throw new Error(
    "Repository not clean! For this operation to succeed all changes have to be committed"
  );
  const exists = (await listBranches(cfg)).includes(targetBranch);

  try {
    // create and switch to target branch without touching the working directory
    if (!exists) await branch({ ...cfg, ref: targetRef, force: true, checkout: false });
    await checkout({ ...cfg, ref: targetRef, noCheckout: true });
    // the working directory still reflects the state this function was called in

    // generate published files
    await generate();
    // Commit only and exactly the published files. Due to some strange behaviour on
    // orphan commits, files we don't care about need to be explicitly removed.
    for (const item of await listFiles(cfg)) await remove({ ...cfg, filepath: item });
    const pubFiles: string[] = [];
    await visitAllFiles(fs, path, dir, filepath => {
      if (!filepath.startsWith(dir)) throw new Error("Assertion failure")
      const relPath = filepath.slice(dir.length);
      if (isTarget(relPath)) pubFiles.push(relPath);
    })
    await add({ ...cfg, filepath: pubFiles, force: true });
    await commit({
      ...cfg,
      ref: targetRef,
      message: commitMessage,
      parent: [] // orphan commit
    });
    if (http !== undefined && onAuth !== undefined) await push({
      ...cfg,
      http, 
      ref: targetRef,
      remoteRef: targetRef,
      force: true,
      onAuth
    });
  } finally {
    // move back to source branch even in case of an error
    await checkout({ ...cfg, ref: sourceRef, force: true })
  }
}