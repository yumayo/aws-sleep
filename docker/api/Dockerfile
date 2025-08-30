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

RUN mkdir -p /app && chown -R ubuntu:ubuntu /app

# Copy package files and install dependencies
COPY ./app/api/package*.json /app

RUN chown -R ubuntu:ubuntu /app

RUN bash -c '\
[ -s "/home/ubuntu/.nvm/nvm.sh" ] && \
source "/home/ubuntu/.nvm/nvm.sh" && \
(cd /app && npm install) \
'

# # Copy the rest of the application code
COPY ./app/api /app

# Build the Vite project
RUN bash -c '\
[ -s "/home/ubuntu/.nvm/nvm.sh" ] && \
source "/home/ubuntu/.nvm/nvm.sh" && \
(cd /app && npm run build) \
'

COPY ./docker/api/entrypoint.sh /entrypoint.sh
RUN chown ubuntu:ubuntu /entrypoint.sh && chmod +x /entrypoint.sh

RUN chown -R ubuntu:ubuntu /app

USER ubuntu

WORKDIR /app

ENTRYPOINT [ "/entrypoint.sh" ]
