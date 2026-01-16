#!/bin/bash -f 
VER=$(git rev-parse --short HEAD)
if [ $VER == "undefined" ]; then
  VER=$(git name-rev --name-only --tags HEAD)
fi
sed -i -e "s/__VERSION__/$VER/g" extract.sh

tar cvf package.tar -C ../files social-backgrounds@emmedige
cat extract.sh package.tar > social-backgrounds-$VER.sh
chmod ug+x  social-backgrounds-$VER.sh
echo "RELEASE_TAG=$VER" >> $GITHUB_ENV 
