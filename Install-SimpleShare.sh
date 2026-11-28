#!/bin/sh
# Keep this file beside the downloaded SimpleShare AppImage.
set -eu
directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
set -- "$directory"/SimpleShare_*_amd64.AppImage "$directory"/SimpleShare_*_x86_64.AppImage
for image do
  if [ -f "$image" ]; then
    chmod u+x "$image"
    exec "$image" --install
  fi
done
printf '%s\n' 'Download the SimpleShare x64 AppImage into the same folder as this installer.' >&2
exit 1
