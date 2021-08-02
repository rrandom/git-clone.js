# git-clone.js

A Typescript implementation of `git clone` command,
based on the original [Haskell version](https://stefan.saasen.me/articles/git-clone-in-haskell-from-the-bottom-up/).

- support git protcal.

## Develop
open git daemon server
```
cd ..
git daemon --reuseaddr --verbose  --base-path=. --export-all
```

run the ls-remote command or the clone command
```
yarn cmd ls-remote "git://localhost/git-clone.js"
yarn cmd clone "git://localhost/git-clone.js" out
```

## TO-DO
add test fixtures.
