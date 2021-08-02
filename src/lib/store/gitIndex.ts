import { readFileSync, Stats, writeFileSync } from "fs";
import log from "loglevel";
import { join, normalize, resolve, sep } from "path";
import { BufferCursor } from "../../utils";
import { GitRepository, shasum } from "../../lib/common";
import { getGitDirectory } from "../../lib/store/objectStore";

export interface Index {
  getIndexEntries: IndexEntry[];
}

/*   
  [4739] λ > stat README.md
    File: "README.md"
    Size: 273          FileType: Regular File
    Mode: (0644/-rw-r--r--)         Uid: (  501/ ssaasen)  Gid: (   20/   staff)
  Device: 1,4   Inode: 8726609    Links: 1
  Access: Thu Feb 28 22:40:02 2013
  Modify: Tue Feb 26 23:03:48 2013
  Change: Tue Feb 26 23:03:48 2013
  
  [4797] λ > git ls-files --debug .mailmap
  .mailmap
    ctime: 1357718951:0
    mtime: 1355693850:0
    dev: 16777220 ino: 2819008
    uid: 501  gid: 20
    size: 49  flags: 0
 */
export interface IndexEntry {
  ctime: number;
  mtime: number;
  device: number;
  inode: number;
  mode: number;
  uid: number;
  gid: number;
  size: number;
  sha: string;
  gitFileMode: GitFileMode;
  path: string;
}

export enum GitFileMode {
  Regular = 8, // 1000
  SymLink = 10, // 1010
  GitLink = 14, // 1110
}

// https://hub.fastgit.org/git/git/blob/master/Documentation/technical/index-format.txt
function encode(entry: IndexEntry) {
  const permissions = (gfm: GitFileMode, fm: number) => {
    if (gfm === GitFileMode.Regular) {
      return fm;
    } else {
      return 0;
    }
  };
  const objType = (gfm: GitFileMode) => gfm;
  const toMode = (gfm: GitFileMode, fm: number) =>
    (objType(gfm) << 12) | permissions(gfm, fm);
  const flags = entry.path.length & 0xfff;

  const bpath = Buffer.from(entry.path);
  // the fixed length + the filename + at least one null char => align by 8
  const length = Math.ceil((62 + bpath.length + 1) / 8) * 8;
  const written = Buffer.alloc(length);
  const writer = new BufferCursor(written);

  writer.writeUInt32BE(entry.ctime);
  writer.seek(writer.tell() + 4);
  writer.writeUInt32BE(entry.mtime);
  writer.seek(writer.tell() + 4);
  writer.writeUInt32BE(entry.device);
  writer.writeUInt32BE(entry.inode);
  writer.writeUInt32BE(toMode(entry.gitFileMode, entry.mode));
  writer.writeUInt32BE(entry.uid);
  writer.writeUInt32BE(entry.gid);
  writer.writeUInt32BE(entry.size);
  writer.write(entry.sha, 20, "hex");
  writer.writeUInt16BE(flags);
  writer.write(entry.path, bpath.length, "utf-8");
  return written;
}

export function indexEntryFor(
  filePath: string,
  gitFileMode: GitFileMode,
  sha: Buffer,
  stat: Stats,
  repo: GitRepository
): IndexEntry {
  const fileName = makeRelativeToRepoRoot(repo.getName, filePath);
  return {
    ctime: Math.floor(stat.ctime.getTime() / 1000), // in seconds
    mtime: Math.floor(stat.mtime.getTime() / 1000), // in seconds
    device: stat.dev,
    inode: stat.ino,
    mode: stat.mode,
    uid: stat.uid,
    gid: stat.gid,
    size: stat.size,
    sha: sha.toString("hex"),
    gitFileMode: gitFileMode,
    path: fileName,
  };
}

export function makeRelativeToRepoRoot(repoPath: string, path: string) {
  const repoName = normalize(repoPath).split(sep).pop();
  const dirs = (p: string) => normalize(p).split(sep);
  const pathArr = dirs(path);
  log.debug({ pathArr });
  const idx = pathArr.findIndex((x) => repoName === x);
  return join(...pathArr.slice(idx + 1));
}

function indexFilePath(repo: GitRepository) {
  return resolve(getGitDirectory(repo), "index");
}

export function writeIndex(entries: IndexEntry[], repo: GitRepository) {
  if (entries.length === 0) return;
  else {
    const fullPath = indexFilePath(repo);
    const content = encodeIndex({ getIndexEntries: entries });
    writeFileSync(fullPath, content);
  }
}

export function encodeIndex(toWrite: Index) {
  const indexEntries = sortIndexEntries(toWrite.getIndexEntries);
  const numEntries = indexEntries.length;
  const header = indexHeader(numEntries);
  const entries = Buffer.concat(indexEntries.map((entry) => encode(entry)));
  const idx = Buffer.concat([header, entries]);

  return Buffer.concat([idx, Buffer.from(shasum(idx), "hex")]);
}

function sortIndexEntries(entries: IndexEntry[]) {
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function indexHeader(num: number) {
  const header = Buffer.alloc(12);
  header.write("DIRC");
  header.writeUInt32BE(2, 4);
  header.writeUInt32BE(num, 8);
  return header;
}

export function readIndex(fullPath: string): IndexEntry[] {
  const readMany = (
    acc: IndexEntry[],
    buf: BufferCursor,
    toRead: number
  ): IndexEntry[] => {
    if (toRead > 0) {
      const entry = readIndexEntry(buf);
      return readMany([...acc, entry], buf, toRead - 1);
    } else {
      return acc;
    }
  };
  const readHeader = (buf: BufferCursor) => {
    const magic = buf.readUInt32BE();
    const version = buf.readUInt32BE();
    const num = buf.readUInt32BE();
    return [magic, version, num];
  };
  const content = new BufferCursor(readFileSync(fullPath));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_magic, _version, num] = readHeader(content);
  return readMany([], content, num);
}

function readIndexEntry(buf: BufferCursor): IndexEntry {
  const toFlags = () => {
    const word = buf.readUInt16BE();
    const pathLength = word & 0xfff;
    const stage = (word >> 12) & 3;
    return [pathLength, stage];
  };

  const ctime = buf.readUInt32BE();
  buf.readUInt32BE();
  const mtime = buf.readUInt32BE();
  buf.readUInt32BE();
  const device = buf.readUInt32BE();
  const inode = buf.readUInt32BE();
  const mode = buf.readUInt32BE();
  const uid = buf.readUInt32BE();
  const gid = buf.readUInt32BE();
  const size = buf.readUInt32BE();
  const sha = buf.slice(20);
  const [pathLength] = toFlags();

  const toPad = 8 - ((pathLength - 2) % 8);
  const objType = mode >> 12;
  const path = buf.slice(pathLength);
  buf.slice(toPad);

  return {
    ctime,
    mtime,
    device,
    inode,
    mode,
    uid,
    gid,
    size,
    sha: sha.toString("hex"),
    gitFileMode: objType,
    path: path.toString(),
  };
}
