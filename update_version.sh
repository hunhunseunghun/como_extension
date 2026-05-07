#!/bin/bash
# Usage: ./update_version.sh <new_version>
# FORMAT IS <0.0.0>

if [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  find . \( -name 'package.json' -o -name 'manifest.json' \) -not -path '*/node_modules/*' -not -path '*/dist/*' -exec bash -c '
    # Parse the version from the file
    current_version=$(grep -o "\"version\": \"[^\"]*" "$0" | cut -d"\"" -f4)

    if [ -n "$current_version" ]; then
      # Update the version
      perl -i -pe"s/\"version\": \"$current_version\"/\"version\": \"'$1'\"/" "$0"
    fi
  '  {} \;

  echo "Updated versions to $1";
else
  echo "Version format <$1> isn't correct, proper format is <0.0.0>";
fi
