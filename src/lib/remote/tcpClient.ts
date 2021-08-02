import log from "loglevel";
import net from "net";
import stream from "stream";

export async function withConnection<T>(
  host: string,
  port: number,
  cb: (x: net.Socket) => Promise<T>
) {
  const sock = net.createConnection(port, host, () => {
    log.debug("connected");
  });
  const res = await cb(sock);
  sock.end();
  return res;
}

export function send(sock: stream.Writable, data: string) {
  sock.write(Buffer.from(data));
}

export async function* receive(sock: stream.Readable) {
  const chunks: Buffer[] = [];
  let totalLen = 0;

  let chunk: Buffer | null;

  for await (chunk of readPacketLine(sock)) {
    // log.debug("packetLine", chunk?.toString());
    if (chunk === null) {
      yield Buffer.concat(chunks, totalLen);
    } else {
      chunks.push(chunk);
      totalLen += chunk.length;
    }
  }
  return null;
}

export async function* receiveWithSideband(sock: stream.Readable) {
  const chunks: Buffer[] = [];
  let totalLen = 0;

  let chunk: Buffer | null;
  for await (chunk of readPacketLine(sock)) {
    if (chunk === null) {
      yield Buffer.concat(chunks, totalLen);
    } else {
      if (chunk.toString() === "NAK\n") {
        log.debug("nak");
        continue;
      }

      const sideband = chunk.readUInt8();
      const line = chunk.slice(1);

      if (sideband === 1) {
        chunks.push(line);
        totalLen += line.length;
      } else if (sideband === 2) {
        log.info("remote: ", line.toString());
      } else if (sideband === 3) {
        log.error(line.toString());
      }
    }
  }
  return null;
}

async function* readPacketLine(sock: stream.Readable) {
  let chunk: Buffer;
  let pending = Buffer.alloc(0);

  function readFully(chunk: Buffer) {
    const chunks = [];
    pending = Buffer.concat([pending, chunk]);
    while (true) {
      if (pending.length < 4) {
        break;
      } else {
        const len = parseInt(pending.slice(0, 4).toString(), 16);
        if (len === 0) {
          chunks.push(null);
          break;
        } else if (pending.length >= len) {
          // log.debug("raw", len, pending.length);
          chunks.push(pending.slice(4, len));
          pending = pending.slice(len);
        } else {
          break;
        }
      }
    }
    return chunks;
  }
  for await (chunk of sock) {
    // log.debug("chunk: ", chunk.toString());
    for (const line of readFully(chunk)) {
      yield line;
    }
  }
}
