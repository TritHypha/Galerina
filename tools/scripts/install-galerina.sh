#!/usr/bin/env bash

set -e

Galerina_DIR="packages-galerina/galerina-core"
Galerina_REPO="https://github.com/phillbooth/Galerina.git"

if [ -d "$Galerina_DIR/.git" ]; then
  echo "Galerina is already installed at $Galerina_DIR"
  echo "No changes made."
  exit 0
fi

if [ -d "$Galerina_DIR" ] && [ "$(ls -A "$Galerina_DIR")" ]; then
  echo "Error: $Galerina_DIR already exists and is not empty."
  echo "No changes made."
  exit 1
fi

echo "Installing Galerina into $Galerina_DIR..."
git submodule add "$Galerina_REPO" "$Galerina_DIR"

echo "Galerina installed."
echo "Commit the change with:"
echo "git add .gitmodules $Galerina_DIR"
echo "git commit -m \"Add Galerina submodule\""
