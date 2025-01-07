FROM python:3.12-bookworm

RUN apt update -y

RUN apt install -y curl

RUN pip install poetry

ENV NVM_DIR=/usr/local/nvm
ENV NVM_SYMLINK_CURRENT=true
RUN mkdir -p $NVM_DIR
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
RUN . $NVM_DIR/nvm.sh && nvm install 20
ENV NODE_PATH=$NVM_DIR/current/lib/node_modules
ENV PATH=$NVM_DIR/current/bin:$PATH

COPY ./server/poetry.toml ./server/pyproject.toml /workspace/server/
RUN cd /workspace/server && poetry install

COPY ./client/package.json /workspace/client/
RUN cd /workspace/client && npm install --loglevel verbose

COPY . /workspace/

RUN cd /workspace/client && npm run openapi && npm run build

WORKDIR /workspace/server
CMD ["./.venv/bin/uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "8080"]

