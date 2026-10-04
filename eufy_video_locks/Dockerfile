# Base app wrapper 0.4.0; overlay the separately versioned JavaScript SDK 0.3.0.
ARG TARGETARCH
FROM --platform=linux/amd64 ghcr.io/mega-yfue/amd64-addon-eufy-sdk-bridge:0.4.0 AS base-amd64
FROM --platform=linux/arm64 ghcr.io/mega-yfue/aarch64-addon-eufy-sdk-bridge:0.4.0 AS base-arm64
FROM base-${TARGETARCH} AS final
WORKDIR /app
RUN curl -fsSL https://registry.npmjs.org/@mega-yfue/eufy-sdk/-/eufy-sdk-0.3.0.tgz -o /tmp/sdk.tgz \
 && echo '26e47102b23a965683622ca1fd08740b3a386c348490e2741debd3703ef55d72  /tmp/sdk.tgz' | sha256sum -c - \
 && npm install --omit=dev --ignore-scripts --no-audit --no-fund --save-exact /tmp/sdk.tgz \
 && rm /tmp/sdk.tgz \
 && node -e "const fs=require('node:fs');if(JSON.parse(fs.readFileSync('node_modules/@mega-yfue/eufy-sdk/package.json')).version!=='0.3.0')throw Error('Unexpected SDK version');const [a,b]=process.versions.node.split('.').map(Number);if(a<24||(a===24&&b<5))throw Error('SDK requires Node >=24.5');"
COPY *.mjs /app/src/
RUN node src/patch-control.mjs \
 && node src/patch-access.mjs \
 && node src/patch-video.mjs \
 && node src/patch-status.mjs \
 && node src/patch-front-control.mjs \
 && node src/patch-sdk-version.mjs \
 && for file in src/*.mjs go2rtc-config.mjs node_modules/@mega-yfue/eufy-sdk/dist/index.js; do node --check "$file" || exit 1; done \
 && node --input-type=module -e "const sdk=await import('@mega-yfue/eufy-sdk');for(const n of ['SecureMqtt','buildAppShapedClientId','mqttUuidFrom'])if(typeof sdk[n]!=='function')throw Error('SDK export unavailable: '+n);"
ARG BUILD_VERSION=0.1.0-rc.1
LABEL org.opencontainers.image.source="https://github.com/BirdsofaFeather/ha-eufy-video-locks" \
      org.opencontainers.image.title="Eufy Video Locks" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.licenses="Apache-2.0 AND MIT" \
      io.hass.type="addon" io.hass.version="${BUILD_VERSION}"
CMD ["node", "/app/src/bootstrap.mjs"]
