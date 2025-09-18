FROM ubuntu

RUN apt-get update && \
apt-get install -y git curl wget iputils-ping locales
# locales は　dockerコンテナ内で日本語が入力できないため設定します。

RUN locale-gen ja_JP.UTF-8
ENV LANG=ja_JP.UTF-8

ENV TZ=Asia/Tokyo

ENV TERM=xterm-256color

# ubuntuユーザー用のnvmインストール
RUN su - ubuntu -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash'
RUN su - ubuntu -c '\
[ -s "/home/ubuntu/.nvm/nvm.sh" ] && \
source "/home/ubuntu/.nvm/nvm.sh" && \
nvm install --lts && \
nvm use --lts && \
nvm alias default node'

RUN mkdir -p /workspace && chown -R ubuntu:ubuntu /workspace

# Copy shared lib first
COPY ./app/lib /workspace/app/lib
RUN chown -R ubuntu:ubuntu /workspace/app/lib

# Build shared lib
RUN bash -c '\
[ -s "/home/ubuntu/.nvm/nvm.sh" ] && \
source "/home/ubuntu/.nvm/nvm.sh" && \
(cd /workspace/app/lib && npm install && npm run build) \
'

# Copy package files and install dependencies
COPY ./app/api/package*.json /workspace/app/api/

RUN chown -R ubuntu:ubuntu /workspace/app/api

RUN bash -c '\
[ -s "/home/ubuntu/.nvm/nvm.sh" ] && \
source "/home/ubuntu/.nvm/nvm.sh" && \
(cd /workspace/app/api && npm install) \
'

# # Copy the rest of the application code
COPY ./app/api /workspace/app/api

# Build the Vite project
RUN bash -c '\
[ -s "/home/ubuntu/.nvm/nvm.sh" ] && \
source "/home/ubuntu/.nvm/nvm.sh" && \
(cd /workspace/app/api && npm run build) \
'

COPY ./docker/api/entrypoint.sh /entrypoint.sh
RUN chown ubuntu:ubuntu /entrypoint.sh && chmod +x /entrypoint.sh

RUN chown -R ubuntu:ubuntu /workspace

USER ubuntu

WORKDIR /workspace/app/api

ENTRYPOINT [ "/entrypoint.sh" ]
