import { chmodSync, mkdirSync, statSync, writeFileSync } from "fs";
import log from "loglevel";
import { resolve } from "path";
import { maybe } from "../utils";
import { GitRepository, ObjectId } from "../lib/common";
import {
  GitFileMode,
  IndexEntry,
  indexEntryFor,
  writeIndex,
} from "../lib/store/gitIndex";
import {
  Commit,
  GitObject,
  GitObjectType,
  parseCommit,
  Tree,
  TreeEntry,
} from "../lib/store/object";
import { readObject, readSymRef, readTree } from "../lib/store/objectStore";

export function checkoutHead(repo: GitRepository) {
  const dir = repo.getName;
  const tip = readHead(repo);
  const maybeTree = resolveTree(tip, repo);
  log.debug({ maybeTree });
  const indexEntries = maybe(
    [],
    (tree: Tree) => walkTree([], dir, tree, repo),
    maybeTree
  );
  writeIndex(indexEntries, repo);
}

function walkTree(
  acc: IndexEntry[],
  parent: string,
  tree: Tree,
  repo: GitRepository
) {
  const asIndexEntry = (path: string, sha: Buffer) => {
    const stat = statSync(path);
    return indexEntryFor(path, GitFileMode.Regular, sha, stat, repo);
  };

  const handleEntry = (acc: IndexEntry[], entry: TreeEntry): IndexEntry[] => {
    const { getBlobSha, getMode, getPath } = entry;
    // sudir
    if (getMode.toString() === "40000") {
      const dir = resolve(parent, getPath.toString());
      mkdirSync(dir, { recursive: true });
      const maybeTree = resolveTree(getBlobSha.toString("hex"), repo);
      return maybe(acc, (tree) => walkTree(acc, dir, tree, repo), maybeTree);
    } else {
      const fullPath = resolve(parent, getPath.toString());
      const content = readObject(repo, getBlobSha.toString("hex"));
      return maybe(
        acc,
        (e) => {
          writeFileSync(fullPath, e.getBlobContent);
          const fMode = getMode.toString();
          // TO-DO: check fMode;
          log.debug({ fMode });
          if (fMode === "100755") {
            chmodSync(fullPath, 0o777);
          }
          const indexEntry = asIndexEntry(fullPath, getBlobSha);
          return [indexEntry, ...acc];
        },
        content
      );
    }
  };
  const entries = tree.getEnries;
  // TO-DO; recheck
  return entries.reduce((p, c) => {
    return [...handleEntry(acc, c), ...p];
  }, [] as IndexEntry[]);
}

function resolveTree(sha: ObjectId, repo: GitRepository) {
  const walk = (obj: GitObject) => {
    if (obj.objType === GitObjectType.BTree) {
      return readTree(repo, obj.sha);
    } else if (obj.objType === GitObjectType.BCommmit) {
      const maybeCommit = parseCommit(obj.getBlobContent);
      return maybe(null, (commit) => extractTree(commit, repo), maybeCommit);
    }
    return null;
  };

  const blob = readObject(repo, sha);
  return maybe(null, walk, blob);
}

function extractTree(commit: Commit, repo: GitRepository) {
  const sha = commit.getTree;
  return readTree(repo, sha.toString());
}

function readHead(repo: GitRepository): ObjectId {
  const head = readSymRef("HEAD", repo);
  if (!head) {
    throw "No head";
  } else {
    return head;
  }
}
