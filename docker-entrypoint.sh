#!/bin/bash -e
# If a /space/CONTAINER_BOOT.md file exists, execute it as a bash script upon boot
if [ -f "/space/CONTAINER_BOOT.md" ]; then
    echo "Executing CONTAINER_BOOT.md script"
    bash /space/CONTAINER_BOOT.md &
fi

# Check if UID and GID are passed as environment variables, if not, extract from the space folder owner
if [ -z "$PUID" ] && [ "$UID" == "0" ] ; then
    # Get the UID of the folder owner
    PUID=$(stat -c "%u" "$SB_FOLDER")
    echo "Will run SilverBullet with UID $PUID, inferred from the owner of $SB_FOLDER (set PUID environment variable to override)"
fi
if [ -z "$PGID" ]; then
    # Get the GID of the folder owner
    PGID=$(stat -c "%g" "$SB_FOLDER")
fi

# Clean up any stale Chrome profile locks or temp sockets
rm -rf /space/.chrome-data/Singleton* /tmp/chrome-data /tmp/.org.chromium.Chromium* /tmp/org.chromium.Chromium* /tmp/.com.google.Chrome*
mkdir -p "${SB_CHROME_DATA_DIR:-/tmp/chrome-data}"
chmod 777 "${SB_CHROME_DATA_DIR:-/tmp/chrome-data}" 2>/dev/null || true

if [ "$PUID" == "0" ] || [ "$UID" != "0" ]; then
    # Will run SilverBullet as default user
    /silverbullet $@
else
    echo "Creating 'silverbullet' group (with GID $PGID) and 'silverbullet' user (with UID $PUID) inside container"
    # Create silverbullet user and group ad-hoc mapped to PUID and PGID if they don't already exist
    getent group silverbullet > /dev/null || addgroup -g $PGID silverbullet
    getent passwd silverbullet > /dev/null || adduser -D -G silverbullet -u $PUID silverbullet
    args="$@"
    # And run via su as requested PUID
    echo "Running SilverBullet as user configured with PUID $PUID and PGID $PGID"
    su silverbullet -s /bin/bash -c "/silverbullet $args"
fi
