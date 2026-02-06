FROM node:18-bullseye

# System dependencies for LaTeX, Pandoc, Poppler, and Python helpers
RUN apt-get update && apt-get install -y \
    python3 python3-pip \
    poppler-utils \
    pandoc \
    texlive-latex-base texlive-latex-extra texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN if [ -f requirements.txt ]; then pip3 install -r requirements.txt; fi

ENV PORT=5000
EXPOSE 5000

CMD ["node", "server.js"]
