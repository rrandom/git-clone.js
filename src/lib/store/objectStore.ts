import fs from "fs";
import log from "loglevel";
import path from "path";
import {
  createDirectoryIfMissing,
  GitRepository,
  ObjectId,
  Ref,
  shasum,
} from "../../lib/common";
import { patch } from "../../lib/pack/delta";
import {
  PackefileObject,
  Packfile,
  PackObjectType,
  packRead,
} from "../../lib/pack/packfile";
import { GitObjectType, parseObject, parseTree } from "../store/object";
import { maybe, partition } from "../../utils";
import zlib from "zlib";

function encodeObject(objectType: GitObjectType, content: Buffer) {
  function headerForBlob(objType: Buffer) {
    return Buffer.from(`${objType} ${content.length.toString()}\0`);
  }
  const header = headerForBlob(Buffer.from(objectType));
  const blob = Buffer.concat([header, content]);
  const sha1 = shasum(blob);
  return [sha1, blob] as const;
}

export function pathForObject(
  repoName: string,
  sha1: string
): [string, string] {
  if (sha1.length === 40) {
    return [
      path.resolve(repoName, ".git", "objects", sha1.slice(0, 2)),
      sha1.slice(2),
    ];
  }
  return ["", ""];
}

export function writeObject(
  repo: GitRepository,
  objectType: GitObjectType,
  content: Buffer
) {
  const [sha1, blob] = encodeObject(objectType, content);
  const [dirName, fileName] = pathForObject(repo.getName, sha1);
  const filePath = path.resolve(dirName, fileName);
  createDirectoryIfMissing(dirName);
  fs.writeFileSync(filePath, zlib.deflateSync(blob));
  return filePath;
}

function toObjectId(p: PackObjectType, base: Buffer) {
  if (p === PackObjectType.OBJ_REF_DELTA) {
    return base.toString("hex");
  }
  return null;
}

export function unpackPackfile(packfile: Packfile, repo: GitRepository) {
  const writeObjects = (objs: PackefileObject[]): PackefileObject[] => {
    if (objs.length === 0) return [];
    else {
      const [first, ...rest] = objs;
      if (first.objectType === PackObjectType.OBJ_REF_DELTA) {
        return [first, ...writeObjects(rest)];
      } else {
        // TO-DO: handle PackObjectType.OBJ_OFS_DELTA
        writeObject(repo, tt(first.objectType), first.ObjectData);
        return writeObjects(rest);
      }
    }
  };
  const tt = (t: PackObjectType) => {
    switch (t) {
      case PackObjectType.OBJ_COMMIT:
        return GitObjectType.BCommmit;
      case PackObjectType.OBJ_TREE:
        return GitObjectType.BTree;
      case PackObjectType.OBJ_BLOB:
        return GitObjectType.BBlob;
      case PackObjectType.OBJ_TAG:
        return GitObjectType.BTag;
      default:
        throw "Unexpected blob type";
    }
  };

  const writeDelta = (p: PackefileObject) => {
    if (p.objectType === PackObjectType.OBJ_REF_DELTA) {
      const sha = toObjectId(p.objectType, p.baseObj);
      const base = sha ? readObject(repo, sha) : null;
      if (base) {
        const target = patch(base.getBlobContent, p.ObjectData);
        writeObject(repo, base.objType, target);
      }
    } else {
      // TO-DO: handle PackObjectType.OBJ_OFS_DELTA
      log.debug(p.objectType);
      throw "Don't expect a resolved object here";
    }
  };

  if (packfile === "InvalidPackfile") {
    throw "Attempting to unpack an invalid packfile";
  }
  const { objs } = packfile;
  const unresolved = writeObjects(objs);
  unresolved.forEach((p) => {
    writeDelta(p);
  });
}

function createRefs(refs: Ref[], repo: GitRepository) {
  const simpleRefName = (buf: string) => buf.split("/").reverse().shift();
  const isPeeledTag = (ref: Ref) => ref.getRefName.slice(-3) === "^{}";
  const isTag = (ref: Ref) =>
    !isPeeledTag(ref) && ref.getRefName.startsWith("refs/tags");
  const writeRefs = (refSpace: string, refs: Ref[]) => {
    refs.forEach((ref) => {
      createRef(
        refSpace + "/" + simpleRefName(ref.getRefName),
        ref.getObjId,
        repo
      );
    });
  };
  const [tags, branches] = partition(
    refs.filter((r) => !isPeeledTag(r)),
    (r: Ref) => isTag(r)
  );
  writeRefs("refs/remotes/origin", branches);
  writeRefs("refs/tags", tags);
}

export function getGitDirectory(repo: GitRepository) {
  return path.resolve(repo.getName, ".git");
}

export function createRef(ref: string, sha: string, repo: GitRepository) {
  const name = path.basename(ref);
  const dirName = path.dirname(ref);
  const dir = path.resolve(getGitDirectory(repo), dirName);
  createDirectoryIfMissing(dir);
  fs.writeFileSync(path.resolve(dir, name), sha + "\n");
}

export function updateHead(refs: Ref[], repo: GitRepository) {
  const findHead = (refs: Ref[]) =>
    refs.find((ref) => ref.getRefName === "HEAD");
  const findRef = (refs: Ref[], sha: string) =>
    refs.find((ref) => ref.getRefName !== "HEAD" && sha === ref.getObjId);

  if (refs.length === 0) {
    throw Error("Unexpected invalid packfile");
  }

  const maybeHead = findHead(refs);

  if (maybeHead) {
    const sha1 = maybeHead.getObjId;
    const ref = maybe(
      "refs/heads/master",
      (x) => x.getRefName,
      findRef(refs, sha1)
    );

    createRef(ref, sha1, repo);
    createSymRef("HEAD", ref, repo);
  }
}

function createSymRef(symName: string, ref: string, repo: GitRepository) {
  fs.writeFileSync(
    path.resolve(getGitDirectory(repo), symName),
    "ref: " + ref + "\n"
  );
}

export function pathForPack(repo: GitRepository) {
  return path.resolve(getGitDirectory(repo), "objects", "pack");
}

export function readObject(repo: GitRepository, sha: ObjectId) {
  const [dirName, fileName] = pathForObject(repo.getName, sha);
  const fullPath = path.resolve(dirName, fileName);
  const exists = fs.existsSync(fullPath);
  if (exists) {
    const bs = fs.readFileSync(fullPath);
    return parseObject(sha, zlib.inflateSync(bs));
  }
  return null;
}

export function createGitRepositoryFromPackfile(
  packFile: string,
  refs: Ref[],
  repo: GitRepository
) {
  const pack = packRead(packFile);
  unpackPackfile(pack, repo);
  createRefs(refs, repo);
  updateHead(refs, repo);
}

export function readSymRef(name: string, repo: GitRepository) {
  const gitDir = getGitDirectory(repo);
  const ref = fs.readFileSync(path.resolve(gitDir, name), "utf-8");
  const unwrappedRef = ref.split(":").pop()?.trim();
  if (!unwrappedRef) return null;
  const obj = fs
    .readFileSync(path.resolve(gitDir, unwrappedRef), "utf-8")
    .trim();
  return obj;
}

export function readTree(repo: GitRepository, sha: ObjectId) {
  const treeBlob = readObject(repo, sha);
  if (treeBlob) {
    return parseTree(sha, treeBlob.getBlobContent);
  }
  return null;
}
