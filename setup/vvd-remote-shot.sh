#!/usr/bin/env bash
# Drive the Vega Virtual Device with remote keys and capture a contact sheet.
#
# Usage: setup/vvd-remote-shot.sh NAME STEP...
#   UP|DOWN|LEFT|RIGHT|ENTER|BACK|MENU  one remote key press (inputd-cli on the device)
#   burst:KEY:N   N quick presses of KEY in a single device command (rapid D-pad test)
#   wN            sleep N seconds
#   cap           capture the TV area of the VVD window (960x540)
#   relaunch      terminate and relaunch com.familyos.tv.main
# Writes /tmp/NAME.jpg (2 columns). Requires DISPLAY with the VVD window, xwininfo and ImageMagick.
# X keyboard events and the on-screen remote do not reach the app, and on-device `screenshooter`
# hung during testing; see docs/FRICTION_LOG.md entry 12.
set -uo pipefail
name=$1; shift
export DISPLAY=${DISPLAY:-:0}
app=com.familyos.tv.main
W=$(xwininfo -name 'Vega Virtual Device' -int 2>/dev/null | awk '/Window id/{print $4}')
[ -n "$W" ] || { echo "no VVD window on $DISPLAY"; exit 1; }
tmp=$(mktemp -d); n=0
for s in "$@"; do
  case $s in
    cap) n=$((n+1)); import -window "$W" -crop 960x540+0+0 +repage "$tmp/$(printf %02d $n).png" ;;
    w[0-9]*) sleep "${s#w}" ;;
    relaunch)
      vega device terminate-app --appName $app -d VirtualDevice >/dev/null 2>&1; sleep 2
      vega device launch-app --appName $app -d VirtualDevice >/dev/null 2>&1 ;;
    burst:*)
      r=${s#burst:}
      vega device run-cmd -d VirtualDevice -c "i=0; while [ \$i -lt ${r#*:} ]; do inputd-cli button_press KEY_${r%:*} >/dev/null; i=\$((i+1)); done" >/dev/null 2>&1
      sleep 1 ;;
    *) vega device run-cmd -d VirtualDevice -c "inputd-cli button_press KEY_$s" >/dev/null 2>&1 || echo "key failed: $s"; sleep 1 ;;
  esac
done
if [ "$n" -gt 1 ]; then montage "$tmp"/*.png -tile 2x -geometry +6+6 -background '#ff00ff' -quality 80 "/tmp/$name.jpg"
elif [ "$n" -eq 1 ]; then convert "$tmp/01.png" -quality 85 "/tmp/$name.jpg"; fi
rm -rf "$tmp"; echo "frames=$n -> /tmp/$name.jpg"
