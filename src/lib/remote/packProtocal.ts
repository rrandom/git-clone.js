import { Ref } from "../../lib/common";

export interface PacketLine {
  objId: string;
  ref: string;
  capabilities?: string;
}

export function parsePacket(p?: string): PacketLine[] | null {
  if (p) {
    const lines = p.split("\n").slice(0, -1);
    const firstLine = parseFirstLine(lines[0]);

    const restLines = lines.slice(1).map((l) => ({
      objId: l.slice(0, 40),
      ref: l.slice(41),
    }));

    return [firstLine, ...restLines];
  }
  return null;
}

function parseFirstLine(line: string): PacketLine {
  const objId = line.slice(0, 40);
  const [ref, capabilities] = line.slice(41).split(/\0/);
  return {
    objId,
    ref,
    capabilities,
  };
}

export function toRef(packetLine: PacketLine): Ref {
  return {
    getObjId: packetLine.objId,
    getRefName: packetLine.ref,
  };
}
