This directory is populated at packaging and release time from the single
canonical `one-person-lab-app/install.sh` via
`one-person-lab-app/scripts/prepare-standard-release-payload.ts` (invoked by
`npm run materialize:bootstrap` or the App-owned Studio release workflow).

Do not commit generated `opl-install.sh` or `manifest.json` files into
`opl-studio`. Development checkouts keep this directory present and exclude
this README from packaged resources.
