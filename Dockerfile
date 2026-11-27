# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:26-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1

FROM ${NODE_IMAGE} AS source-builder-base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

FROM source-builder-base AS framework-builder
ARG OPL_FRAMEWORK_REPOSITORY=https://github.com/gaofeng21cn/one-person-lab.git
ARG OPL_FRAMEWORK_REF=1a295253f7cfd89c5345feddef28e7677f23243e
WORKDIR /src/opl-framework

RUN git init \
  && git remote add origin "${OPL_FRAMEWORK_REPOSITORY}" \
  && git fetch --depth 1 origin "${OPL_FRAMEWORK_REF}" \
  && git checkout --detach FETCH_HEAD \
  && test "$(git rev-parse HEAD)" = "${OPL_FRAMEWORK_REF}"
RUN npm ci --ignore-scripts \
  && npm run framework:archive -- /tmp/opl-framework-artifact
WORKDIR /opt/opl-framework/runtime
RUN tar -xzf /tmp/opl-framework-artifact/one-person-lab-framework-*.tar.gz --strip-components=1 \
  && npm ci --omit=dev --ignore-scripts \
  && npm install --global --prefix /opt/opl-framework --omit=dev --ignore-scripts --offline . \
  && npm cache clean --force

FROM ${NODE_IMAGE} AS codex-builder
ARG OPL_CODEX_NPM_SPEC
RUN node -e 'if (!/^@openai\/codex@\d+\.\d+\.\d+$/.test(process.argv[1])) throw new Error("App must supply the Framework-resolved exact Codex npm spec")' "${OPL_CODEX_NPM_SPEC}" \
  && npm install --global --prefix /opt/codex "${OPL_CODEX_NPM_SPEC}" \
  && npm cache clean --force

FROM source-builder-base AS app-product-profile
ARG OPL_APP_REPOSITORY=https://github.com/gaofeng21cn/one-person-lab-app.git
ARG OPL_APP_REF=2e9b6fedcb83cd3e80697b4c886636ffa1005efc
WORKDIR /src/one-person-lab-app
RUN git init \
  && git remote add origin "${OPL_APP_REPOSITORY}" \
  && git fetch --depth 1 origin "${OPL_APP_REF}" \
  && git checkout --detach FETCH_HEAD \
  && test "$(git rev-parse HEAD)" = "${OPL_APP_REF}" \
  && test -f contracts/app-product-profile.json
RUN node --experimental-strip-types --input-type=module -e "import { materializeStudioOfficialProfileResources } from './scripts/studio-official-profile-resources.ts'; materializeStudioOfficialProfileResources('/opt/opl', process.cwd());"

FROM ${NODE_IMAGE} AS renderer-builder
ARG OPL_BUN_VERSION=1.3.14
WORKDIR /app
ENV OPL_APP_REPO_ROOT=/app/one-person-lab-app
COPY package.json package-lock.json ./
COPY plugins ./plugins
COPY vendor ./vendor
COPY packages ./packages
RUN npm install --global "bun@${OPL_BUN_VERSION}" \
  && npm ci --ignore-scripts
COPY LICENSE ./LICENSE
COPY contracts ./contracts
COPY scripts ./scripts
COPY desktop/deep-links.mjs ./desktop/deep-links.mjs
COPY src ./src
COPY tsconfig.json tsconfig.typecheck.json ./
COPY --from=app-product-profile /src/one-person-lab-app/contracts ./one-person-lab-app/contracts
RUN npm run build:webui

FROM ${NODE_IMAGE} AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY plugins ./plugins
COPY packages ./packages
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ARG OPL_SOURCE_REVISION=local-candidate
WORKDIR /app

LABEL org.opencontainers.image.title="One Person Lab" \
  org.opencontainers.image.description="One Person Lab headless WebUI carrier" \
  org.opencontainers.image.source="https://github.com/gaofeng21cn/opl-studio" \
  org.opencontainers.image.revision="${OPL_SOURCE_REVISION}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git gosu \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/codex /data/inputs /projects \
  && chown -R node:node /data /projects

COPY --from=framework-builder /opt/opl-framework /opt/opl-framework
COPY --from=codex-builder /opt/codex /opt/codex
COPY --from=app-product-profile /opt/opl/resources /opt/opl/resources
COPY scripts/headless/image-manifest.mjs /tmp/image-manifest.mjs
ARG OPL_FRAMEWORK_REF=1a295253f7cfd89c5345feddef28e7677f23243e
ARG OPL_APP_REF=2e9b6fedcb83cd3e80697b4c886636ffa1005efc
ARG OPL_CODEX_NPM_SPEC
RUN OPL_FRAMEWORK_REF="${OPL_FRAMEWORK_REF}" OPL_APP_REF="${OPL_APP_REF}" OPL_CODEX_NPM_SPEC="${OPL_CODEX_NPM_SPEC}" OPL_SOURCE_REVISION="${OPL_SOURCE_REVISION}" node /tmp/image-manifest.mjs \
  && rm /tmp/image-manifest.mjs
COPY --from=production-dependencies --chown=node:node /app/package.json ./package.json
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=renderer-builder --chown=node:node /app/plugins ./plugins
COPY --from=renderer-builder --chown=node:node /app/dist/webui ./dist/webui
COPY --from=renderer-builder --chown=node:node /app/scripts/headless ./scripts/headless
COPY --from=renderer-builder --chown=node:node /app/src/host ./src/host
COPY --from=renderer-builder --chown=node:node /app/packages/host-kit ./packages/host-kit
COPY --from=renderer-builder --chown=node:node /app/packages/host-contracts/thread-error.mjs ./packages/host-contracts/thread-error.mjs

ENV NODE_ENV=production \
  NARB_DISABLE_NATIVE_CACHE=1 \
  HOME=/data \
  CODEX_HOME=/data/codex \
  OPL_DATA_DIR=/data \
  OPL_IMAGE_MANIFEST_PATH=/opt/opl/image-manifest.json \
  OPL_IMAGE_SEED_DIR=/opt/opl/seed \
  OPL_OFFICIAL_PROFILE_RESOURCES=/opt/opl/resources \
  OPL_PROJECTS_DIR=/projects \
  OPL_WORKSPACE_ROOT=/projects \
  OPL_STUDIO_CODEX_CWD=/projects \
  OPL_CODEX_BIN=/opt/codex/bin/codex \
  OPL_APP_OPL_BIN=/opt/opl-framework/bin/opl \
  OPL_HEADLESS_HOST=0.0.0.0 \
  OPL_HEADLESS_PORT=3000 \
  OPL_HEADLESS_SHUTDOWN_TIMEOUT_MS=8000 \
  OPL_NATIVE_WORKBENCH_READ_ONLY=0 \
  PATH=/opt/opl-framework/bin:/opt/codex/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

VOLUME ["/data", "/projects"]
EXPOSE 3000
USER root
COPY scripts/headless/docker-entrypoint.sh /usr/local/bin/opl-webui-entrypoint
RUN chmod 755 /usr/local/bin/opl-webui-entrypoint
USER node
ENTRYPOINT ["/usr/local/bin/opl-webui-entrypoint"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "--input-type=module", "-e", "import { resolveWebBindAddress } from './src/host/dsh/host.mjs'; const host=resolveWebBindAddress(process.env.OPL_HEADLESS_HOST); fetch('http://'+(host.includes(':')?'['+host+']':host)+':'+process.env.OPL_HEADLESS_PORT+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "scripts/headless/run.mjs"]
