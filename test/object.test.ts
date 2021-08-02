import { existsSync, readFileSync, rmdirSync } from "fs";
import log from "loglevel";
import { resolve } from "path";
import zlib from "zlib";
import { packRead } from "../src/lib/pack/packfile";
import { parseCommit, parseObject, parseTree } from "../src/lib/store/object";
import {
  createGitRepositoryFromPackfile,
  unpackPackfile,
} from "../src/lib/store/objectStore";
import { setLogLevel } from "../src/utils";
import { getFixtureContent, getFixturePath } from "./utils";

describe("object", () => {
  beforeAll(() => {
    setLogLevel("info");
  });
  test("parse object", () => {
    const buf = zlib.inflateSync(
      getFixtureContent("./objects/0e/2e9fa76cfeada542f8f744d200c53ad582e27e")
    );
    const gitObject = parseObject(
      "0e2e9fa76cfeada542f8f744d200c53ad582e27e",
      buf
    );
    // git cat-file -t 0e2e9fa76cfeada542f8f744d200c53ad582e27e
    expect(gitObject.objType).toEqual("blob");
    // git cat-file -p 0e2e9fa76cfeada542f8f744d200c53ad582e27e
    expect(gitObject.getBlobContent.toString()).toEqual(
      String.raw`export function log(name: string, ...x: any) {
  if (process.env.LOG) {
    console.log(name + ": ", ...x);
  }
}

export function dir(name: string, ...x: any) {
  if (process.env.LOG) {
    console.dir(name + ": ", ...x);
  }
}
`
    );
  });

  test("parse tree", () => {
    const treeEverything = getFixtureContent("./tree/everything.tree");
    const tree = parseTree("abc", treeEverything);
    expect(tree.getEnries).toHaveLength(5);
    expect(tree.getEnries[0].getPath).toEqual(Buffer.from("exe"));
    expect(tree.getEnries[0].getMode).toEqual(Buffer.from("100755"));

    const tree_1 = parseTree(
      "abc",
      getFixtureContent("./tree/maybe-special.tree")
    );
    expect(tree_1.getEnries).toHaveLength(160);

    const tree_2 = parseTree(
      "abc",
      getFixtureContent("./tree/definitely-special.tree")
    );
    expect(tree_2.getEnries).toHaveLength(19);
  });

  test("parse commit", () => {
    const commit_1 = Buffer.from(
      "tree b5213cb334e855fb5c89edc99d54606377e15d70\nparent 3c1d7b88edaf2119aff47104de389867cad0f0fb\nauthor Stefan Saasen <stefan@saasen.me> 1361272292 +1100\ncommitter Stefan Saasen <stefan@saasen.me> 1361272292 +1100\n\nRemove git INSTALL instructions\n"
    );

    const commit_no_parent = Buffer.from(
      "tree 920512d27e4df0c79ca4a929bc5d4254b3d05c4c\nauthor Stefan Saasen <ssaasen@atlassian.com> 1362201640 +1100\ncommitter Stefan Saasen <ssaasen@atlassian.com> 1362201640 +1100\n\nAdd test.txt\n"
    );

    const commit_merge = Buffer.from(
      "tree 639e28af470be85166a2bbfcaa2835fc68a257a5\nparent 7517fa2cf314c8c9f5e54aa5ae8fab514c88e2cf\nparent e5fe0a4bfbf1d28d41805c8e80e4ffd826c30ac9\nauthor Ludovic Landry <landry.ludovic+github@gmail.com> 1350079175 -0700\ncommitter Ludovic Landry <landry.ludovic+github@gmail.com> 1350079175 -0700\n\nMerge e5fe0a4bfbf1d28d41805c8e80e4ffd826c30ac9 into 7517fa2cf314c8c9f5e54aa5ae8fab514c88e2cf"
    );

    const parsed1 = parseCommit(commit_1);
    expect(parsed1.getTree.toString()).toEqual(
      "b5213cb334e855fb5c89edc99d54606377e15d70"
    );
    expect(parsed1.getParents[0].toString()).toEqual(
      "3c1d7b88edaf2119aff47104de389867cad0f0fb"
    );

    const parsed2 = parseCommit(commit_no_parent);
    expect(parsed2.getParents).toEqual([]);

    const parsed3 = parseCommit(commit_merge);
    expect(parsed3.getParents).toEqual(
      [
        "7517fa2cf314c8c9f5e54aa5ae8fab514c88e2cf",
        "e5fe0a4bfbf1d28d41805c8e80e4ffd826c30ac9",
      ].map((k) => Buffer.from(k))
    );
  });
});

describe("unpack", () => {
  beforeAll(() => {
    setLogLevel("info");
  });
  test("unpack works", () => {
    const DEST_DIR = "tmp/test-unpack";
    rmdirSync(DEST_DIR, { recursive: true });
    const pack = packRead(getFixturePath("clone.response"));
    expect(pack).not.toBe("InvalidPackfile");
    if (pack !== "InvalidPackfile") {
      log.debug(pack.numObjects);
      unpackPackfile(pack, { getName: DEST_DIR });
      expect(existsSync(resolve(DEST_DIR, ".git", "objects"))).toBeTruthy();
      expect(existsSync(resolve(DEST_DIR, ".git", "objects/01"))).toBeTruthy();
    }
  });

  test("create from packFile", () => {
    const refs = [
      {
        getObjId: "e42aacbedfcb03aff60c3c6dcbf3691a9fa85c3d",
        getRefName: "HEAD",
      },
      {
        getObjId: "e42aacbedfcb03aff60c3c6dcbf3691a9fa85c3d",
        getRefName: "refs/heads/master",
      },
      {
        getObjId: "66fa67ccdff9cfe8b2119313b068ad4eb364a9ec",
        getRefName: "refs/heads/recieve",
      },
    ];
    const DEST_DIR = "tmp/test-create-from-unpack";
    rmdirSync(DEST_DIR, { recursive: true });
    const packFile = getFixturePath("clonePack");
    createGitRepositoryFromPackfile(packFile, refs, { getName: DEST_DIR });

    expect(
      readFileSync(resolve(DEST_DIR, ".git", "HEAD"), "utf-8").trim()
    ).toEqual("ref: refs/heads/master");
    expect(
      readFileSync(
        resolve(DEST_DIR, ".git", "refs/heads/master"),
        "utf-8"
      ).trim()
    ).toEqual(refs[0].getObjId);
  });
});
