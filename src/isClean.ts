import { CallbackFsClient, PromiseFsClient, statusMatrix } from "isomorphic-git";

/** Ensure that the repository is clean and switching branches is safe */
export async function isClean(cfg: {
  fs: CallbackFsClient | PromiseFsClient,
  dir: string
}): Promise<boolean> {
  const status = await statusMatrix(cfg);
  // see the statusMatrix docs for the meaning of these values
  const changed = status.filter(([_name, ...stat]) => (
    stat.some(st => st !== 0)
    && stat.some(st => st !== 1)
  ));
  return changed.length === 0;
}