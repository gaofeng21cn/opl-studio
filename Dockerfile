# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436

FROM ${NODE_IMAGE} AS source-builder-base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

FROM source-builder-base AS framework-builder
ARG OPL_FRAMEWORK_REPOSITORY=https://github.com/gaofeng21cn/one-person-lab.git
ARG OPL_FRAMEWORK_REF=2a490a41c30106d08f982f96eec439144af88cec
WORKDIR /src/opl-framework

RUN git init \
  && git remote add origin "${OPL_FRAMEWORK_REPOSITORY}" \
  && git fetch --depth 1 origin "${OPL_FRAMEWORK_REF}" \
  && git checkout --detach FETCH_HEAD \
  && test "$(git rev-parse HEAD)" = "${OPL_FRAMEWORK_REF}"
RUN npm ci --ignore-scripts \
  && npm run build \
  && npm pack --workspaces --ignore-scripts --silent --pack-destination /tmp \
  && npm pack --ignore-scripts --silent --pack-destination /tmp \
  && npm install --global --prefix /opt/opl-framework --omit=dev /tmp/one-person-lab-*.tgz /tmp/opl-framework-*.tgz \
  && npm cache clean --force

FROM ${NODE_IMAGE} AS codex-builder
ARG OPL_CODEX_NPM_SPEC=@openai/codex@0.144.5
RUN npm install --global --prefix /opt/codex "${OPL_CODEX_NPM_SPEC}" \
  && npm cache clean --force

FROM source-builder-base AS app-product-profile
ARG OPL_APP_REPOSITORY=https://github.com/gaofeng21cn/one-person-lab-app.git
ARG OPL_APP_REF=da71d20448cdbcc9425c0dae2d81dd1b6f005507
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
RUN npm install --global "bun@${OPL_BUN_VERSION}" \
  && npm ci
COPY contracts ./contracts
COPY scripts ./scripts
COPY desktop/deep-links.mjs ./desktop/deep-links.mjs
COPY packages ./packages
COPY src ./src
COPY tsconfig.json tsconfig.typecheck.json ./
COPY --from=app-product-profile /src/one-person-lab-app/contracts ./one-person-lab-app/contracts
RUN npm run build:webui

FROM ${NODE_IMAGE} AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --omit=dev \
  && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ARG OPL_SOURCE_REVISION=local-candidate
WORKDIR /app

LABEL org.opencontainers.image.title="One Person Lab" \
  org.opencontainers.image.description="One Person Lab headless WebUI carrier" \
  org.opencontainers.image.source="https://github.com/gaofeng21cn/opl-studio" \
  org.opencontainers.image.revision="${OPL_SOURCE_REVISION}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git gosu \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/codex /data/inputs /projects \
  && chown -R node:node /data /projects

COPY --from=framework-builder /opt/opl-framework /opt/opl-framework
COPY --from=codex-builder /opt/codex /opt/codex
COPY --from=app-product-profile /opt/opl/resources /opt/opl/resources
COPY desktop/official-profile.mjs ./desktop/official-profile.mjs
COPY scripts/headless/image-manifest.mjs /tmp/image-manifest.mjs
ARG OPL_FRAMEWORK_REF=2a490a41c30106d08f982f96eec439144af88cec
ARG OPL_APP_REF=da71d20448cdbcc9425c0dae2d81dd1b6f005507
ARG OPL_CODEX_NPM_SPEC=@openai/codex@0.144.5
RUN OPL_FRAMEWORK_REF="${OPL_FRAMEWORK_REF}" OPL_APP_REF="${OPL_APP_REF}" OPL_CODEX_NPM_SPEC="${OPL_CODEX_NPM_SPEC}" OPL_SOURCE_REVISION="${OPL_SOURCE_REVISION}" node /tmp/image-manifest.mjs \
  && rm /tmp/image-manifest.mjs
COPY --from=production-dependencies --chown=node:node /app/package.json ./package.json
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/packages ./packages
COPY --from=renderer-builder --chown=node:node /app/dist/webui ./dist/webui
COPY --from=renderer-builder --chown=node:node /app/scripts/headless ./scripts/headless
COPY --from=renderer-builder --chown=node:node /app/scripts/webui-host ./scripts/webui-host

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
ENTRYPOINT ["/usr/local/bin/opl-webui-entrypoint"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.OPL_HEADLESS_PORT+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "scripts/headless/run.mjs"]
