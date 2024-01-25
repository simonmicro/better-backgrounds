#!/bin/bash
TARGET=$HOME/.local/share/cinnamon/applets
VERSION="git"
if [ ! -d $TARGET ]; then 
  echo "Unable to find Cinnamon local data";
  exit -1;
fi
if [ -d $TARGET/social-backgrounds@emmedige ]; then 
  echo "Applet already installed, it will be overwritten.";
  echo "Press any key to Continue, Ctrl+C to Abort"
  read -n 1; echo
fi
echo "Extracting file into $TARGET"
# searches for the line number where finish the script and start the tar.gz
SKIP=`awk '/^__TARFILE_FOLLOWS__/ { print NR + 1; exit 0; }' $0`
#remember our file name
THIS=`pwd`/$0
# take the tarfile and pipe it into tar
tail -n +$SKIP $THIS | tar --directory=$TARGET -xz
# Any script here will happen after the tar file extract.
echo "Finished: installed applet version $VERSION."
exit 0
# NOTE: Don't place any newline characters after the last line below.
__TARFILE_FOLLOWS__
