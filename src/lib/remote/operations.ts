import fs from "fs";
import log from "loglevel";
import net from "net";
import path from "path";
import {
  createDirectoryIfMissing,
  flushPkt,
  fromChunks,
  gitProtoRequest,
  GitRepository,
  pktLine,
} from "../../lib/common";
import { PacketLine, parsePacket, toRef } from "../../lib/remote/packProtocal";
import {
  receive,
  receiveWithSideband,
  send,
  withConnection,
} from "../../lib/remote/tcpClient";
import { checkoutHead } from "../../lib/repository";
import {
  createGitRepositoryFromPackfile,
  pathForPack,
} from "../../lib/store/objectStore";

type Remote = {
  readonly getHost: string;
  readonly getPort?: number;
  readonly getRepository: string;
};

//  | Parse a URL that is using the git protocol format.
//  E.g. @git://git.apache.org:9418/foo.git@
//
//  Schema:
//
//    * @git://host.xz[:port]/path/to/repo.git/@
//
//    * @git://host.xz[:port]/~[user]/path/to/repo.git/@
//
//  See the /GIT URLS/ section on
//  <http://www.kernel.org/pub/software/scm/git/docs/git-clone.html>
//  naive implementation
export function parseRemote(url: string): Remote {
  if (!url.startsWith("git://")) throw "Support git protcal only";
  const [hostport, repo] = url.slice(6).split("/");
  const [host, port] = hostport.split(":");

  return {
    getHost: host,
    getPort: port ? +port : undefined,
    getRepository: repo.replace(/(.+)(.git)\/?$/, (s, s1) => s1),
  };
}

async function lsRemote({ getHost, getPort = 9418, getRepository }: Remote) {
  return await withConnection(
    getHost,
    getPort,
    async function (sock: net.Socket) {
      const payload = gitProtoRequest(getHost, getRepository);
      send(sock, payload);
      const response = (await receive(sock).next()).value;
      send(sock, flushPkt);
      return parsePacket(fromChunks(response));
    }
  );
}

export async function lsRemoteCmd(url: string) {
  const remote = parseRemote(url);
  const packteLines = await lsRemote(remote);
  log.info(packteLines?.map((l) => `${l.objId} ${l.ref}`).join("\n"));
}

async function clone(repo: GitRepository, remote: Remote) {
  const rp = await receivePack(remote);
  if (!rp) return;
  log.debug("rp: ", rp);

  const [refs, packFile] = rp;
  const dir = pathForPack(repo);
  log.debug([dir]);
  const tmpPack = path.resolve(dir, "tmp_pack_incoming");
  createDirectoryIfMissing(dir);
  fs.writeFileSync(tmpPack, packFile);
  createGitRepositoryFromPackfile(tmpPack, refs, repo);
  fs.unlinkSync(tmpPack);
  checkoutHead(repo);
}

export async function cloneCmd(url: string, destDir?: string) {
  const remote = parseRemote(url);
  const gitRepoName = destDir || repositoryName(remote);
  await clone({ getName: gitRepoName }, remote);
}

function repositoryName(remote: Remote) {
  return path.basename(
    remote.getRepository,
    path.extname(remote.getRepository)
  );
}

function createNegotiationRequest(capabilities: string[], lines: PacketLine[]) {
  const toObjId = (line: PacketLine) => line.objId;
  const filterPeeledTags = (line: PacketLine) => !line.ref.endsWith("^{}");
  const filterRefs = (line: PacketLine) =>
    line.ref.startsWith("refs/tags/") || line.ref.startsWith("refs/heads/");

  return lines
    .filter(filterRefs)
    .filter(filterPeeledTags)
    .map((line) => toObjId(line))
    .map((obj, idx) => {
      if (idx === 0) return ["want", obj, ...capabilities].join(" ");
      return ["want", obj].join(" ");
    })
    .map((l) => pktLine(l + "\n"))
    .join("");
}

async function receivePack({ getHost, getPort = 9418, getRepository }: Remote) {
  return await withConnection(getHost, getPort, async (sock: net.Socket) => {
    const payload = gitProtoRequest(getHost, getRepository);
    send(sock, payload);
    const response = (await receive(sock).next()).value;

    const pack = parsePacket(fromChunks(response));
    if (!pack) return;
    const request =
      createNegotiationRequest(
        ["multi_ack_detailed", "side-band-64k", "agent=git/1.8.1"],
        pack
      ) +
      flushPkt +
      pktLine("done\n");
    log.debug("clone request: ", request);
    send(sock, request);
    const rawPack = (await receiveWithSideband(sock).next()).value;
    if (!rawPack) return;
    return [pack.map((p) => toRef(p)), rawPack] as const;
  });
}
