FROM ubuntu:latest

RUN apt update -y
RUN apt upgrade -y

RUN apt install -y sudo
RUN apt install -y vim

# ubuntuユーザーにパスワードを設定
RUN echo "ubuntu:ubuntu" | chpasswd

# ubuntuユーザーのホームディレクトリに.hushloginファイルを作成してMOTDを抑制
# .hushloginファイルが無いと下記のメッセージが表示されます。
# To run a command as administrator (user "root"), use "sudo <command>".
# See "man sudo_root" for details.
RUN touch /home/ubuntu/.hushlogin
RUN chown ubuntu:ubuntu /home/ubuntu/.hushlogin

# dockerコンテナ内で日本語が入力できないため設定します。
RUN apt-get install -y locales
RUN locale-gen ja_JP.UTF-8

RUN apt install -y git
RUN apt install -y curl
RUN apt install -y wget
RUN apt install -y iputils-ping

ENV TERM=xterm-256color
ENV LANG=ja_JP.UTF-8
ENV TZ=Asia/Tokyo

RUN apt install -y php
RUN apt install -y php-cli

# ubuntuユーザー用のnvmインストール
RUN su - ubuntu -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash'
RUN su - ubuntu -c '\
[ -s "/home/ubuntu/.nvm/nvm.sh" ] && \
\. "/home/ubuntu/.nvm/nvm.sh" && \
nvm install --lts && \
nvm use --lts && \
nvm alias default node'

RUN apt-get install -y unzip

# AWS CLI の最新バージョンのインストールまたは更新 - AWS Command Line Interface
# https://docs.aws.amazon.com/ja_jp/cli/latest/userguide/getting-started-install.html
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
    unzip awscliv2.zip && \
    ./aws/install

# Docker CLI をインストール
COPY ./docker/script/install-docker.sh /tmp/install-docker.sh
RUN bash /tmp/install-docker.sh

# Dockerデーモンを自動起動するスクリプトを作成
COPY ./docker/script/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER ubuntu

WORKDIR /app
