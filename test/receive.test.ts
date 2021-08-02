import fs from "fs";
import { fromChunks } from "../src/lib/common";
import { parsePacket } from "../src/lib/remote/packProtocal";
import { receive, receiveWithSideband } from "../src/lib/remote/tcpClient";
import { setLogLevel } from "../src/utils";
import { getFixturePath } from "./utils";

describe("receive", () => {
  beforeAll(() => {
    setLogLevel("silent");
  });
  test("lsRemote", async () => {
    const res = fs.createReadStream(getFixturePath("lsRemote.response"));

    const expected = [
      {
        objId: "c00b3079d946cda7d70f5ace1ebe808ee10b23ea",
        ref: "HEAD",
        capabilities:
          "multi_ack thin-pack side-band side-band-64k ofs-delta shallow deepen-since deepen-not deepen-relative no-progress include-tag multi_ack_detailed symref=HEAD:refs/heads/zh-xqc agent=git/2.19.0",
      },
      {
        objId: "668fcbc7b5492e0fed8edb4b9b7a06cc4ab5959b",
        ref: "refs/heads/PAZCMH-28",
      },
      {
        objId: "dd004bcbea70a293bfb547d63bf6467c71dc121a",
        ref: "refs/heads/PAZCMH-57",
      },
      {
        objId: "241afce3fc1e60b39b826acbb1583cc87fe13b1c",
        ref: "refs/heads/PAZCMH-68",
      },
      {
        objId: "49fcc6b5834ec99144b15448f1e3587a56860533",
        ref: "refs/heads/PZIFS-1647",
      },
      {
        objId: "3978cf8ab12f2f4e78af963146618cc2c9676be5",
        ref: "refs/heads/carousel-type",
      },
      {
        objId: "49d8ff47f8bb735e5c43c58e2b286a924db9c2ce",
        ref: "refs/heads/fix-groupbuy",
      },
      {
        objId: "7283aac9ecfdbaca7bf5944b99ebb612ca518540",
        ref: "refs/heads/fix-safari-blur",
      },
      {
        objId: "541b14b3833ddf4be908a0db2c75fe718c4e0666",
        ref: "refs/heads/groupbuy-detail-fix-style",
      },
      {
        objId: "2ee225d835851c17993afd332aa78c92dcddb8b2",
        ref: "refs/heads/gzjc-xqc",
      },
      {
        objId: "5ccccadc29f6e98dfdf8dc18bbffe37bbdcfe77d",
        ref: "refs/heads/gztc-bug-fix-xqc",
      },
      {
        objId: "c881e3c04bb641b1569a3579ca07dbdebe9543a3",
        ref: "refs/heads/master",
      },
      {
        objId: "071cb846430666614ab01bf852deb8cd0e369402",
        ref: "refs/heads/step",
      },
      {
        objId: "578360bb320e9b2c7b144b1fc582ea217463f37c",
        ref: "refs/heads/welcome-txt",
      },
      {
        objId: "e57c40260095234d2a10c9808af3f6e28dad0cce",
        ref: "refs/heads/zc-groupbuy",
      },
      {
        objId: "c00b3079d946cda7d70f5ace1ebe808ee10b23ea",
        ref: "refs/heads/zh-xqc",
      },
      {
        objId: "c00b3079d946cda7d70f5ace1ebe808ee10b23ea",
        ref: "refs/remotes/origin/HEAD",
      },
      {
        objId: "c00b3079d946cda7d70f5ace1ebe808ee10b23ea",
        ref: "refs/remotes/origin/master",
      },
      {
        objId: "f255420de39551fabe93106b402ac80a167a52be",
        ref: "refs/remotes/origin/zh-xqc",
      },
      { objId: "dcfd31456816230d56d4ca5934de03040c49222a", ref: "refs/stash" },
      {
        objId: "2e099c7d55e9ec7bc08e6554ad1eb3a7a235e6a4",
        ref: "refs/tags/v2",
      },
      {
        objId: "04122f3ef64c5f171dae93a9ffec813391cd3e6a",
        ref: "refs/tags/v2^{}",
      },
    ];

    const buf = (await receive(res).next()).value;
    const pktLines = parsePacket(fromChunks(buf));
    if (pktLines) {
      expect(pktLines).toHaveLength(expected.length);
      pktLines.forEach((line, idx) => {
        expect(line).toEqual(expected[idx]);
      });
    }
  });

  test("clone", async () => {
    const cloneRes = fs.createReadStream(getFixturePath("rawCloneRes"));

    const mockFn = jest.fn(async () => {
      return (await receiveWithSideband(cloneRes).next()).value;
    });
    mockFn();
    expect(mockFn).toReturn();
  });
});
