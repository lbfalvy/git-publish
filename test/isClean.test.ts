import fs from "fs/promises";
import path from "path";
import process from "process";
import git from "isomorphic-git";
import { isClean } from "../src/isClean";

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

afterAll(() => fs.rm(dir, { recursive: true }));

test("correctly detects a clean repository", async () => {
  expect(await isClean(cfg)).toBe(true);
});

test("correctly detects a newly added file", async () => {
  await fs.writeFile(path.join(dir, "quz"), "quux");
  expect(await isClean(cfg)).toBe(false);
  await git.add({ ...cfg, filepath: "quz" });
  expect(await isClean(cfg)).toBe(false);
  await git.commit({ ...cfg, message: "added quz" });
  expect(await isClean(cfg)).toBe(true);
});

test("correctly detects a newly deleted file", async () => {
  await fs.rm(path.join(dir, "foo"));
  expect(await isClean(cfg)).toBe(false);
  await git.remove({ ...cfg, filepath: "foo" })
  // await git.add({ ...cfg, filepath: "." });
  expect(await isClean(cfg)).toBe(false);
  await git.commit({ ...cfg, message: "deleted foo" });
  expect(await isClean(cfg)).toBe(true);
});