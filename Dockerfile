# Apify base image with Node.js 22, Playwright and Chrome preinstalled
FROM apify/actor-node-playwright-chrome:22

# Install dependencies first to use Docker layer cache
COPY --chown=myuser:myuser package*.json ./
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" && node --version \
    && echo "NPM version:" && npm --version \
    && rm -r ~/.npm

# Copy the source code
COPY --chown=myuser:myuser . ./

CMD ["npm", "start", "--silent"]
