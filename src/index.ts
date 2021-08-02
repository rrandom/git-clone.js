import log from "loglevel";
import minimist from "minimist";
import { cloneCmd, lsRemoteCmd } from "./lib/remote/operations";
import { setLogLevel } from "./utils";

log.setDefaultLevel(log.levels.INFO);
setLogLevel();

// yarn cmd ls-remote "git://localhost/git-clone.js"
// yarn cmd clone "git://localhost/git-clone.js" out
function main() {
  const argv = minimist(process.argv.slice(2));
  log.debug(argv);
  const {
    _: [command, url, dest],
  } = argv;
  if (command === "clone") {
    cloneCmd(url, dest);
  } else if (command === "ls-remote") {
    lsRemoteCmd(url);
  } else {
    throw "Not support";
  }
}

main();
