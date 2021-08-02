import log from "loglevel";

export function setLogLevel(level?: log.LogLevelDesc) {
  level = level ?? (process.env.LOGLEVEL as never);
  if (level) {
    log.setLevel(level);
  }
}

export function partition<T>(
  arr: T[],
  predicate: (value: T, index: number, arr: T[]) => boolean
) {
  const left: T[] = [];
  const right: T[] = [];
  arr.forEach((v, i, array) => {
    if (predicate(v, i, array)) {
      left.push(v);
    } else {
      right.push(v);
    }
  });

  return [left, right];
}

export function maybe<T, V>(
  defaultV: V,
  action: (x: T) => V,
  input: T | null | undefined | 0
) {
  if (!input) return defaultV;
  else return action(input);
}

export class BufferCursor {
  buffer: Buffer;
  pos: number;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.pos = 0;
  }

  eof() {
    return this.pos >= this.buffer.length;
  }

  tell() {
    return this.pos;
  }

  slice(n: number) {
    const r = this.buffer.slice(this.pos, this.pos + n);
    this.pos += n;
    return r;
  }

  readUInt8() {
    const r = this.buffer.readUInt8(this.pos);
    this.pos += 1;
    return r;
  }

  seek(n: number) {
    this.pos = n;
  }

  write(value: string, length: number, enc?: BufferEncoding) {
    const r = this.buffer.write(value, this.pos, length, enc);
    this.pos += length;
    return r;
  }

  writeUInt32BE(value: number) {
    const r = this.buffer.writeUInt32BE(value, this.pos);
    this.pos += 4;
    return r;
  }

  readUInt32BE() {
    const r = this.buffer.readUInt32BE(this.pos);
    this.pos += 4;
    return r;
  }

  readUInt16BE() {
    const r = this.buffer.readUInt16BE(this.pos);
    this.pos += 2;
    return r;
  }

  writeUInt16BE(value: number) {
    const r = this.buffer.writeUInt16BE(value, this.pos);
    this.pos += 2;
    return r;
  }
}

export function addZero(str: string, length: number) {
  return new Array(length - str.length + 1).join("0") + str;
}
