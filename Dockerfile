FROM node:24-bookworm-slim
ARG WARP_GENERATOR_COMMIT=d4616f154d654d5c159c193432159240c96614bb
ENV NEXT_TELEMETRY_DISABLED=1 PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends bash ca-certificates curl jq python3 wireguard-tools util-linux \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL "https://raw.githubusercontent.com/lanrat/wireguard-warp-generator/${WARP_GENERATOR_COMMIT}/scripts/warp-register.sh" -o /usr/local/bin/warp-register.sh \
 && chmod 0755 /usr/local/bin/warp-register.sh
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/bin/bash", "/app/entrypoint.sh"]
