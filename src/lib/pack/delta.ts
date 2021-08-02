import { isMsbSet } from "../../lib/common";
import { BufferCursor } from "../../utils";

type DeltaHeader = {
  sourceLength: number;
  targetLength: number;
  getOffset: number;
};

export function patch(base: Buffer, delta: Buffer) {
  const { sourceLength, getOffset } = decodeDeltaHeader(delta);
  if (base.length === sourceLength) {
    return run(base, new BufferCursor(delta.slice(getOffset)));
  }
  throw Error("Source length check failed");
}

export function decodeDeltaHeader(delta: Buffer): DeltaHeader {
  const maskMsb = (x: number) => x & 0x7f;
  const next = (
    base: number,
    shift: number,
    byte: number,
    count: number
  ): [number, number] => {
    if (isMsbSet(byte)) {
      const b = delta.readUInt8(count);
      const len = base | (maskMsb(b) << shift);
      return next(len, shift + 7, b, count + 1);
    } else {
      return [base, count];
    }
  };
  const decodeSize = (offset: number) => {
    const byte = delta.readUInt8(offset);
    return next(maskMsb(byte), 7, byte, offset + 1);
  };

  const res1 = decodeSize(0);
  const [sourceBufferSize, offset] = res1;
  const res2 = decodeSize(offset);
  const [targetBufferSize, offset1] = res2;
  return {
    sourceLength: sourceBufferSize,
    targetLength: targetBufferSize,
    getOffset: offset1,
  };
}

function run(source: Buffer, delta: BufferCursor) {
  const cmd = delta.readUInt8();
  return runCommand(cmd, Buffer.alloc(0), source, delta);
}

function runCommand(
  cmd: number,
  acc: Buffer,
  source: Buffer,
  delta: BufferCursor
): Buffer {
  const choose = (opcode: number) => {
    if (isMsbSet(opcode)) {
      return copyCommand(opcode, source, delta);
    } else {
      return insertCommand(opcode, delta);
    }
  };

  const result = choose(cmd);
  const finished = delta.eof();
  const acc1 = Buffer.concat([acc, result]);
  if (finished) {
    return acc1;
  } else {
    const cmd1 = delta.readUInt8();
    return runCommand(cmd1, acc1, source, delta);
  }
}

function insertCommand(n: number, delta: BufferCursor) {
  return delta.slice(n);
}

function copyCommand(opcode: number, source: Buffer, delta: BufferCursor) {
  const copy = (len: number, offset: number) =>
    source.slice(offset, offset + len);
  const [offset, len] = readCopyInstruction(opcode, delta);
  return copy(len, offset);
}

// | Read the copy instructions in @opcode@.
// The @opcode@ byte has the MSB set, the remaining bits will be used to
// identify how many of the remaining bytes need to be read to identify the
// @offset@ and @size@ used to copy from the source into the target buffer.
//
// Example:
// @
//  opcode = 10110000
//
//  Looking at the bits that are set:
//
//           10000000 & 0x80 - MSB is set - this is a copy instruction
//
//           Start at the LSB:
//           00000000 & 0x01 - 1st bit not set
//           00000000 & 0x02 - 2nd bit not set
//           00000000 & 0x04 - 3rd bit not set
//           00000000 & 0x08 - 4th bit not set
//
//           None of the offset bits are set, we don't read any offset value so
//           the offset is 0. This means we copy from the start of the source
//           buffer.
//
//           00010000 & 0x10 - 5th bit is set. We read the next byte
//           00100000 & 0x20 - 6th bit is set. We read the next byte, left
//                    shift it by 8 and add it to the previously read value.
//           00000000 & 0x40 - 7th bit is not set.
//
//           This is the size/length of the source buffer to copy.
// @

const offsetShifts: [number, number][] = [
  [0x01, 0],
  [0x02, 8],
  [0x04, 16],
  [0x08, 24],
];
const lenShifts: [number, number][] = [
  [0x10, 0],
  [0x20, 8],
  [0x40, 16],
];

function readCopyInstruction(opcode: number, delta: BufferCursor) {
  const calculateVal = (off: number, shift: number) => {
    if (shift !== 0) {
      return (x: number) => off | (x << shift);
    } else {
      return (x: number) => x;
    }
  };
  const readIfBitSet = (off: number, [test, shift]: [number, number]) => {
    if ((opcode & test) !== 0) {
      return calculateVal(off, shift)(delta.readUInt8());
    } else {
      return off;
    }
  };
  const offset = offsetShifts.reduce((p, c) => {
    return readIfBitSet(0, c) + p;
  }, 0);
  const len = lenShifts.reduce((p, c) => {
    return readIfBitSet(0, c) + p;
  }, 0);
  return [offset, len];
}
