import fs from "fs";
import log from "loglevel";
import { isMsbSet } from "../../lib/common";
import zlib from "zlib";

export type Packfile =
  | {
      version: string;
      numObjects: number;
      objs: PackefileObject[];
    }
  | "InvalidPackfile";

// No pattern match and enum variant support.
// TO-DO, use `unionize`
export type PackefileObject =
  | {
      objectType: Exclude<
        PackObjectType,
        PackObjectType.OBJ_OFS_DELTA | PackObjectType.OBJ_REF_DELTA
      >;
      size: number;
      ObjectData: Buffer;
    }
  | {
      objectType: PackObjectType.OBJ_OFS_DELTA;
      size: number;
      ObjectData: Buffer;
      ofs: number;
    }
  | {
      objectType: PackObjectType.OBJ_REF_DELTA;
      size: number;
      ObjectData: Buffer;
      baseObj: Buffer;
    };

export enum PackObjectType {
  OBJ_BAD = -1,
  OBJ_NONE = 0,
  OBJ_COMMIT = 1,
  OBJ_TREE = 2,
  OBJ_BLOB = 3,
  OBJ_TAG = 4,
  OBJ_OFS_DELTA = 6,
  OBJ_REF_DELTA = 7,
  OBJ_ANY = 8,
}

export function packRead(path: string) {
  return parsePackFile(fs.readFileSync(path));
}

export function parsePackFile(buf: Buffer): Packfile {
  const magic = buf.slice(0, 4).toString();
  const version = buf.slice(4, 8).readUInt32BE();
  const numObjects = buf.slice(8, 12).readUInt32BE();
  log.debug([magic, version, numObjects]);
  if (magic !== "PACK") {
    return "InvalidPackfile";
  }

  const objs = parsePackObjects(buf.slice(12), numObjects);
  return {
    version: version.toString(),
    numObjects,
    objs,
  };
}

function parsePackObjects(buf: Buffer, numObjects: number): PackefileObject[] {
  const objs = [];
  let offset = 0;
  while (numObjects > 0) {
    const packObjResult = parsePackObject(buf, offset);
    objs.push(packObjResult.obj);
    offset = packObjResult.nextOffset;
    numObjects--;
  }
  return objs;
}

type ZlibResultWithEngine = {
  buffer: Buffer;
  engine: { bytesWritten: number };
};
function parsePackObject(
  buf: Buffer,
  offset: number
): { obj: PackefileObject; nextOffset: number } {
  const startOffset = offset;
  let byte = buf.readUInt8(offset);
  const objectType = (byte >> 4) & 0b111;
  let size = byte & 0b1111;
  let shift = 4;
  offset += 1;
  while (isMsbSet(byte)) {
    byte = buf.readUInt8(offset);
    size |= (byte & 0b01111111) << shift;
    shift += 7;
    offset += 1;
  }

  log.debug("objType:", objectType, " size: ", size, " offset: ", startOffset);

  const obj = {
    objectType,
    size,
  } as PackefileObject;

  if (obj.objectType === PackObjectType.OBJ_OFS_DELTA) {
    let ofsByte = buf.readUInt8(offset);
    offset += 1;
    let shift = 0;
    let ofs = 0;
    while (isMsbSet(ofsByte)) {
      ofs |= (ofsByte & 0b01111111) << shift;
      shift += 7;
      offset += 1;
      ofsByte = buf.readUInt8(offset);
    }
    obj.ofs = ofs;
  } else if (obj.objectType === PackObjectType.OBJ_REF_DELTA) {
    const baseObj = buf.slice(offset, offset + 20);
    // TO-DO: check
    obj.baseObj = baseObj;
    offset += 20;
  }

  const inflateResult = (zlib.inflateSync(buf.slice(offset), {
    info: true,
  }) as unknown) as ZlibResultWithEngine;

  obj.ObjectData = inflateResult.buffer;

  return {
    obj,
    nextOffset: offset + inflateResult.engine.bytesWritten,
  };
}
