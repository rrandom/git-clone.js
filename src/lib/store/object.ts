import { ObjectId } from "../../lib/common";

export enum GitObjectType {
  BTree = "tree",
  BCommmit = "commit",
  BTag = "tag",
  BBlob = "blob",
}

export interface GitObject {
  getBlobContent: Buffer;
  objType: GitObjectType;
  sha: ObjectId;
}

export interface Tree {
  getObjectId: ObjectId;
  getEnries: TreeEntry[];
}

export interface TreeEntry {
  getMode: Buffer;
  getPath: Buffer;
  getBlobSha: Buffer;
}

type Identity = {
  getPersonName: Buffer;
  getPersonEmail: Buffer;
};

export interface Commit {
  getTree: Buffer;
  getParents: Buffer[];
  getSha: Buffer;
  getAuthor: Identity;
  getCommiter: Identity;
  getMessage: Buffer;
}

export function toCommit() {
  // TO-DO
}

export function parseObject(sha: ObjectId, obj: Buffer): GitObject {
  // object-type SP size \NUL object-content
  const spaceIdx = obj.indexOf(" ");
  const sizeIndex = obj.indexOf("\0");
  return {
    sha,
    objType: obj.slice(0, spaceIdx).toString() as GitObjectType,
    getBlobContent: obj.slice(sizeIndex + 1),
  };
}

export function parseTree(sha: ObjectId, input: Buffer): Tree {
  let cursor = 0;
  // mode SP path NUL sha1
  const treeEntryParser = (input: Buffer): TreeEntry => {
    const modeEnd = input.indexOf(" ", cursor);
    if (modeEnd === -1) {
      throw "bad modend";
    }
    const pathEnd = input.indexOf("\0", cursor);
    if (pathEnd === -1) {
      throw "bad pathEnd";
    }
    const shaEnd = pathEnd + 20 + 1;
    const entry = {
      getMode: input.slice(cursor, modeEnd),
      getPath: input.slice(modeEnd + 1, pathEnd),
      getBlobSha: input.slice(pathEnd + 1, shaEnd),
    };
    cursor = shaEnd;
    return entry;
  };
  const entries = [];
  while (cursor < input.length) {
    const entry = treeEntryParser(input);
    entries.push(entry);
  }
  return {
    getObjectId: sha,
    getEnries: entries,
  };
}

export function parseCommit(input: Buffer): Commit {
  const parsePerson = (input: Buffer): Identity => {
    const nameSep = input.indexOf("<");
    const emailSep = input.indexOf(">");
    return {
      getPersonName: input.slice(0, nameSep),
      getPersonEmail: input.slice(nameSep + 1, emailSep),
    };
  };
  const headSepPos = input.indexOf("\n\n");
  const message = input.slice(headSepPos + 2);
  const rawHead = input.slice(0, headSepPos);
  let cursor = 0;
  const result = {
    getMessage: message,
    getParents: [] as Buffer[],
  } as Commit;
  while (cursor < rawHead.length) {
    let lineEnd = rawHead.indexOf("\n", cursor);
    if (lineEnd === -1) {
      lineEnd = rawHead.length;
    }
    const line = input.slice(cursor, lineEnd);
    cursor = lineEnd + 1;
    const space = line.indexOf(" ");
    if (space === -1) {
      throw "bad space";
    }
    const key = line.slice(0, space).toString();
    const value = line.slice(space + 1);
    if (key === "tree") {
      result.getTree = value;
    } else if (key === "parent") {
      result.getParents.push(value);
    } else if (key === "author" || key === "committer") {
      result[key === "author" ? "getAuthor" : "getCommiter"] = parsePerson(
        value
      );
    }
  }

  return result;
}
