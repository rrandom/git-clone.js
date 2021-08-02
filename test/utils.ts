import fs from "fs";
import path from "path";

export function getFixturePath(name: string) {
  return path.resolve(__dirname, "fixture", name);
}

export function getFixtureContent(name: string) {
  return fs.readFileSync(path.resolve(__dirname, "fixture", name));
}
