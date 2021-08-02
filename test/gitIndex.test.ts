import { writeFileSync } from "fs";
import log from "loglevel";
import {
  encodeIndex,
  makeRelativeToRepoRoot,
  readIndex,
} from "../src/lib/store/gitIndex";
import { setLogLevel } from "../src/utils";
import { getFixturePath } from "./utils";

describe("git index", () => {
  beforeAll(() => {
    setLogLevel("info");
  });
  test("parse index file", () => {
    const indexPath = getFixturePath("index-file");
    const mockFn = jest.fn(() => {
      const parsed = readIndex(indexPath);
      return parsed;
    });
    mockFn();
    expect(mockFn).toReturn();
    expect(mockFn.mock.results[0]["value"][0]["device"]).toBe(16777220);
  });

  test("read and parse index", () => {
    const DEST_PATH = "tmp/created-index";
    const indexPath = getFixturePath("index-file");

    const expectedEntries = readIndex(indexPath);
    const createdIndex = encodeIndex({ getIndexEntries: expectedEntries });
    writeFileSync(DEST_PATH, createdIndex);

    const actualEntries = readIndex(DEST_PATH);
    expect(actualEntries).toHaveLength(expectedEntries.length);

    log.debug(
      "expected: ",
      expectedEntries.map((k) => k.path)
    );
    log.debug(
      "actual:",
      actualEntries.map((k) => k.path)
    );
    expect(actualEntries).toEqual(expectedEntries);
  });

  test("torelatve path", () => {
    const repoName = "tmprepo";
    const path = "/Users/abcd/test/tsp/gitclone/tmprepo/.eslintrc";

    const relativePath = makeRelativeToRepoRoot(repoName, path);
    expect(relativePath).toEqual(".eslintrc");

    const path2 = "/Users/abcd/test/tsp/gitclone/tmprepo/src/index.ts";
    expect(makeRelativeToRepoRoot(repoName, path2)).toEqual("src/index.ts");

    expect(
      makeRelativeToRepoRoot(
        "tmp/repo",
        "/Users/abcd/test/tsp/gitclone/tmp/repo/src/index.ts"
      )
    ).toEqual("src/index.ts");
  });
});
