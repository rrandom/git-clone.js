import crypto from "crypto";
import fs from "fs";
import { addZero } from "../utils";
export interface GitRepository {
  getName: string;
}

export function pktLine(msg: string): string {
  return `${addZero(toHex(msg.length + 4), 4)}${msg}`;
}

export const flushPkt = "0000";

export function gitProtoRequest(host: string, repo: string) {
  return pktLine("git-upload-pack /" + repo + "\0host=" + host + "\0");
}

export const toHex = (x: number) => x.toString(16);

export const isMsbSet = (x: number) => (x & 0x80) != 0;

export function fromChunks(buf: Buffer | null) {
  if (buf) {
    return buf.toString();
  }
}

export function shasum(buf: Buffer) {
  return crypto.createHash("sha1").update(buf).digest("hex");
}

export function createDirectoryIfMissing(path: string) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true });
  }
}

export type ObjectId = string;

export interface Ref {
  getObjId: string;
  getRefName: string;
}
