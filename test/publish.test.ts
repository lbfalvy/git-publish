import fs from "fs/promises";
import path from "path";
import process from "process";
import git from "isomorphic-git";
import { publish } from "../src";

const dir = path.join(process.cwd(), "tmp");
const cfg = { fs, dir };

beforeEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir);
  await git.init({ ...cfg });
  await fs.writeFile(path.join(dir, "foo"), "bar");
  await git.setConfig({ ...cfg, path: "user.name", value: "john doe" });
  await git.setConfig({ ...cfg, path: "user.email", value: "john.doe@example.com" });
  await git.add({ ...cfg, filepath: "foo" });
  await git.commit({ ...cfg, message: "initial commit" });
});

test("Can publish an orphan commit to the specified branch", async () => {
  await fs.writeFile(path.join(dir, ".gitignore"), "dist");
  await git.add({ ...cfg, filepath: ".gitignore" });
  await git.commit({ ...cfg, message: "added gitignore" });
  await publish({
    ...cfg,
    generate: async () => {
      await fs.mkdir(path.join(dir, "dist"));
      await fs.writeFile(path.join(dir, "dist", "hello"), "Hello, World!");
    },
    commitMessage: "Sample commit message",
    pubpath: "dist",
    targetBranch: "production"
  });
  const sha = await git.resolveRef({ ...cfg, ref: "production" });
  const { commit } = await git.readCommit({ ...cfg, oid: sha });
  expect(commit.parent).toEqual([]);
  expect(commit.message.trim()).toEqual("Sample commit message");
  const { tree } = await git.readTree({ ...cfg, oid: commit.tree });
  expect(tree).toHaveLength(1)
  expect(tree[0].path).toBe("dist")
})