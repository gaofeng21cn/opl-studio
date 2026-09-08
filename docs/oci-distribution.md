# OCI Preview Distribution

The OCI carrier packages the same React renderer and Node host core used by the
desktop and standalone WebUI carriers. It does not contain Electron, AionUI, or
AionCore. The independently versioned OCI is a public Studio Preview carrier,
not the Stable OPL App shell and not proof of Cloud activation.

The publication owner emits an `opl_studio_cloud_workspace_image_handoff.v1`
receipt containing the immutable index, child identities, verification, and
rollback input. Read that receipt and registry readback before installation.
`preview` and `latest` are mutable convenience aliases, never installation or
rollback identity; their names do not imply Stable adoption.

## Host-Managed Lifecycle

The host manager keeps installation state outside the checkout and drives the
fixed `docker-compose.distribution.yaml` template. Registry installs and updates
must use a digest reference:

```bash
node scripts/oci/manage.mjs install \
  --image ghcr.io/OWNER/IMAGE@sha256:DIGEST
node scripts/oci/manage.mjs status
node scripts/oci/manage.mjs start
node scripts/oci/manage.mjs update \
  --image ghcr.io/OWNER/IMAGE@sha256:NEW_DIGEST
node scripts/oci/manage.mjs recreate
node scripts/oci/manage.mjs rollback
node scripts/oci/manage.mjs uninstall
```

`install` and `update` resolve and record the observed Docker image ID. Update
does not advance the state file until the new container is healthy. If startup
fails, the manager recreates the previous image and reports whether recovery
succeeded. `rollback` swaps the current and previous immutable identities.

Uninstall preserves the named `/data` and `/projects` volumes. Destructive data
removal requires the explicit `uninstall --purge-data` form. The operation lock
prevents concurrent host lifecycle writers, the installed Compose template is
checked against its recorded SHA-256 before each Docker mutation, and the state
file is replaced atomically with user-only permissions.

For a locally built candidate, `--allow-local-image` is required. The manager
then stores the image ID, never the mutable tag, and marks the receipt as local
candidate evidence. This option is not a registry release path.

## Security Boundary

The distribution template enforces UID/GID 1000, a read-only root filesystem,
`no-new-privileges`, all Linux capabilities dropped, a bounded PID count, and a
restricted temporary filesystem. Only `/data` and `/projects` are persistent.
The container listens on port `3000`; the distribution Compose template maps it
to `127.0.0.1:${OPL_APP_PORT:-4178}`. Cloud mode requires password auth and
signed sessions through `OPL_WEBUI_DEPLOYMENT_MODE=cloud`,
`OPL_WEBUI_AUTH_MODE=password`, `OPL_WEBUI_PASSWORD_FILE`, and
`OPL_WEBUI_SESSION_SECRET_FILE`. The session secret must contain at least 32
bytes. The signed `aionui-session` cookie is HttpOnly, SameSite=Lax, valid for
30 days, and all state-changing requests require a session-bound CSRF token.

Studio does not terminate public TLS or own Workspace routing and tenant
isolation. Those remain Cloud proxy responsibilities; the manager continues to
bind its local distribution to loopback.

## Multi-Architecture Contract

The source contract targets `linux/amd64` and `linux/arm64` from one Dockerfile.
Generate the non-executing build plan with an exact source revision:

```bash
node scripts/oci/build-plan.mjs \
  --image ghcr.io/OWNER/IMAGE:v26.8.15 \
  --source-revision 0123456789abcdef0123456789abcdef01234567 \
  --framework-ref 0123456789abcdef0123456789abcdef01234567 \
  --app-ref 0123456789abcdef0123456789abcdef01234567 \
  --output ./out/one-person-lab.oci.tar
```

The plan requests BuildKit provenance, an SBOM, both platforms, and a local OCI
layout. It deliberately does not execute a build or push an image. The Preview
publication workflow uses native GitHub-hosted `amd64` and `arm64` runners,
smokes each exact child digest, combines an immutable index, verifies the SPDX
and SLSA attestations, and signs the index and both children with GitHub OIDC and
Cosign. It moves only the `preview` and `latest` aliases after anonymous native smoke and
emits `opl_studio_cloud_workspace_image_handoff.v1`. Cloud activation and final
Workspace runtime readback remain separate owner gates.

The Dockerfile pins the multi-platform Node base by digest and pins App and
Framework source inputs by Git commit. Codex and Bun are exact package versions,
but their registry artifact integrity is not independently attested by this
repository. OCI labels record the supplied source revision; a label is
provenance metadata, not signature verification.

## Validation

```bash
node --test tests/oci/*.test.mjs tests/headless/docker-contract.test.mjs
npm run smoke:docker:lifecycle
npm run smoke:docker
npm test
docker compose config
docker compose -f docker-compose.distribution.yaml config
git diff --check
```

The lifecycle smoke builds two local images, then proves install, start, update,
recreate, rollback, preserving uninstall, reinstallation, destructive uninstall,
volume persistence, health, image identity, loopback publication, and container
hardening on the current Docker host. The hosted Preview workflow additionally
proves public anonymous exact-digest access, registry identity, native
dual-architecture runtime behavior, and supply-chain identity. It does not prove
Cloud activation or Stable adoption.

## Publication Order

For a joint desktop and OCI release, first commit the matching `package.json`
and lockfile version to canonical Studio `main`, then dispatch
`studio-webui-preview.yml` from `main`. Its source gate accepts numeric
`major.minor.patch` versions and requires the matching Git release tag to be
unused. The workflow freezes `github.sha`, publishes the immutable OCI version
and source tags, and emits the handoff; it does not create a Git tag or GitHub
Release. Wait for the entire OCI workflow to succeed before creating the
desktop release tag at that exact Studio commit. Preserve the handoff alongside
the desktop release evidence. An existing immutable OCI version or source tag
must be reconciled before retrying publication.

## Existing AionUI Data

Keep the Studio data volume persistent. For a separate legacy volume, add
`-v OLD_AIONUI_VOLUME:/aionui-legacy:ro` and
`-e OPL_AIONUI_DATA_DIR=/aionui-legacy` to the existing container configuration.
The Host imports on startup and preserves the source. If the old data already
lives under `/data`, discovery is automatic. An unmounted volume cannot be
discovered from inside the new container. For an old multi-user database,
`OPL_AIONUI_USER_ID` selects one user's records; histories are never mixed.
