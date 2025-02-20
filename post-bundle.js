const fse = require("fs-extra");
const path = require("path");
const puppeteer = require("puppeteer");

const { PUPPETEER_REVISIONS } = require("puppeteer-core/internal/revisions.js");

async function main() {
  for (const platform of ["linux", "mac", /*"mac_arm", "win32", */"win64"]) {
    const browserFetcher = puppeteer.createBrowserFetcher({
      platform: platform,
    });
    const revisionInfo = browserFetcher.revisionInfo(PUPPETEER_REVISIONS.chromium);
    if (!revisionInfo.local) {
      await browserFetcher.download(PUPPETEER_REVISIONS.chromium);
    }
    fse.copySync(revisionInfo.folderPath, path.resolve(`./exec/puppeteer/`));
  }  
}

main();