import { isMsbSet, pktLine, toHex } from "../src/lib/common";
import { parseRemote } from "../src/lib/remote/operations";

describe("common test", () => {
  test("isMsbSet should be true if the most significant bit is set", () => {
    expect(isMsbSet(128)).toBeTruthy();
  });

  test("isMsbSet should be false if the most significant bit is not set", () => {
    expect(isMsbSet(127)).toBeFalsy();
  });

  test("Empty pktline should be 0004", () => {
    expect(pktLine("")).toBe("0004");
  });

  test("Should be prefixed with valid length (in hex)", () => {
    expect(pktLine("want 40bcec379e1cde8d3a3e841e7f218cd84448cec5\n")).toBe(
      "0032want 40bcec379e1cde8d3a3e841e7f218cd84448cec5\n"
    );
  });

  test("Done packet", () => {
    expect(pktLine("done")).toBe("0008done");
  });

  test("Done packetLn", () => {
    expect(pktLine("done\n")).toBe("0009done\n");
  });

  test("210 should be in hex", () => {
    expect(toHex(210)).toBe("d2");
  });
});

describe("parse remote", () => {
  test("works", () => {
    expect(parseRemote("git://git.apache.org:9418/foo.git")).toEqual({
      getHost: "git.apache.org",
      getPort: 9418,
      getRepository: "foo",
    });

    expect(parseRemote("git://git.apache.org/foo.git")).toEqual({
      getHost: "git.apache.org",
      getPort: undefined,
      getRepository: "foo",
    });

    expect(parseRemote("git://git.apache.org/foo")).toEqual({
      getHost: "git.apache.org",
      getPort: undefined,
      getRepository: "foo",
    });
  });
});
