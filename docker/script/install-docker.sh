#!/bin/bash
set -e

# Ubuntu | Docker Docs
# https://docs.docker.com/engine/install/ubuntu/
# Add Docker's official GPG key:
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update

apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Post-installation steps | Docker Docs
# https://docs.docker.com/engine/install/linux-postinstall/
# wsl2上のdockerは999で動いてたので、999を使ってるsystemd系を移動してます。
groupmod -g 104 systemd-journal
groupmod -g 105 systemd-network
groupmod -g 106 systemd-timesync
groupmod -g 107 systemd-resolve
groupmod -g 999 docker
usermod -aG docker ubuntu

# ulimit -Hn エラーの対策
sed -i 's/ulimit -Hn/ulimit -n/g' /etc/init.d/docker
